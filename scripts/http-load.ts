// Load test configuration (can be overridden with environment variables)
const TOTAL_LOGS = Number(process.env.LOAD_ROWS ?? 100_000);
const BATCH_SIZE = Number(process.env.LOAD_BATCH_SIZE ?? 1000);
const BASE_URL = process.env.LOAD_URL ?? "http://localhost:8080";
// Track overall load test results
let acceptedLogs = 0;
let failedRequests = 0;
// Store request durations for latency statistics
const requestLatencies: number[] = [];

const services = ["checkout", "auth", "payments", "orders", "inventory"];

const levels = ["debug", "info", "warn", "error"] as const;
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 4);
// Generate a realistic log entry for the benchmark
function createLog(index: number) {
  return {
    timestamp: new Date().toISOString(),
    level: levels[index % levels.length],
    service: services[index % services.length] ?? "unknown",
    message: `load test message ${index}`,
    attributes: {
      user_id: String(index % 10_000),
      region: index % 2 === 0 ? "eu-west" : "us-east",
      retries: index % 5,
    },
  };
}
// Send one batch of logs to the ingestion endpoint
async function sendBatch(start: number, size: number) {
  const logs = Array.from({ length: size }, (_, i) => createLog(start + i));

  const requestStart = performance.now();

  try {
    const response = await fetch(`${BASE_URL}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        logs,
      }),
    });

    const requestEnd = performance.now();

    requestLatencies.push(requestEnd - requestStart);

    if (!response.ok) {
      failedRequests++;

      console.error(`Request failed with status ${response.status}`);

      return;
    }

    const body = (await response.json()) as {
      accepted: number;
      rejected: unknown[];
    };
    // Count successfully ingested logs
    acceptedLogs += body.accepted;
  } catch (error) {
    failedRequests++;

    console.error("Request failed:", error);
  }
}

async function main() {
  console.log(`Target: ${BASE_URL}`);
  console.log(`Total logs: ${TOTAL_LOGS}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  const startTime = performance.now();
  // Each worker processes every Nth batch to allow parallel requests
  async function worker(startIndex: number) {
    // Each worker starts at a different batch and skips ahead by the
    // total number of workers to avoid processing the same logs.
    for (
      let start = startIndex * BATCH_SIZE;
      start < TOTAL_LOGS;
      start += BATCH_SIZE * CONCURRENCY
    ) {
      const size = Math.min(BATCH_SIZE, TOTAL_LOGS - start);

      await sendBatch(start, size);
    }
  }
  // Launch multiple workers to send requests concurrently
  const workers = Array.from({ length: CONCURRENCY }, (_, index) =>
    worker(index),
  );
  // Wait until every worker finishes its assigned batches
  await Promise.all(workers);

  const endTime = performance.now();

  const seconds = (endTime - startTime) / 1000;
  // Calculate overall benchmark statistics
  const throughput = acceptedLogs / seconds;

  const averageLatency =
    requestLatencies.reduce((sum, value) => sum + value, 0) /
    requestLatencies.length;
  // Sort latencies to compute the 95th percentile (p95)
  const sortedLatencies = [...requestLatencies].sort((a, b) => a - b);

  const p95Index = Math.ceil(sortedLatencies.length * 0.95) - 1;

  const p95Latency = sortedLatencies[p95Index] ?? 0;
  // Print a summary of the benchmark results
  console.log("\nResults");
  console.log(`Accepted logs: ${acceptedLogs}`);
  console.log(`Failed requests: ${failedRequests}`);
  console.log(`Total time: ${seconds.toFixed(2)} seconds`);
  console.log(`Throughput: ${Math.round(throughput)} logs/second`);
  console.log(`Average request latency: ${averageLatency.toFixed(2)} ms`);
  console.log(`p95 request latency: ${p95Latency.toFixed(2)} ms`);
  console.log(`Concurrency: ${CONCURRENCY}`);
}

void main();
