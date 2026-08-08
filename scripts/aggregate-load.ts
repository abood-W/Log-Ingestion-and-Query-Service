// Base URL of the running API.
// Can be overridden with LOAD_URL environment variable.
const BASE_URL = process.env.LOAD_URL ?? "http://localhost:8080";

// How long the load test should run.
// Default: 60 seconds.
const DURATION_SECONDS = Number(process.env.LOAD_DURATION ?? 60);

// Store the latency of every aggregation request in milliseconds.
const latencies: number[] = [];

// Counters used to track request results.
let failedRequests = 0;
let successfulRequests = 0;

/*
  Sends one aggregation request to the API
  and records how long the request takes.
 */
async function runAggregation() {
  // The aggregation query covers the last 24 hours.
  const until = new Date();

  const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);

  // Build:
  // GET /logs/aggregate
  const url = new URL("/logs/aggregate", BASE_URL);

  // Required aggregation time range.
  url.searchParams.set("since", since.toISOString());

  url.searchParams.set("until", until.toISOString());

  // Group logs into 5-minute time buckets.
  url.searchParams.set("bucket", "5m");

  // Inside every time bucket,
  // group the counts by service.
  url.searchParams.set("group_by", "service");

  // Start measuring this request's latency.
  const start = performance.now();

  try {
    const response = await fetch(url);

    const end = performance.now();

    // Save this request's latency so we can calculate
    // average, p50, p95 and p99 later.
    latencies.push(end - start);

    // response.ok is false for status codes such as
    // 400, 500, 503, etc.
    if (!response.ok) {
      failedRequests++;

      console.error(`Aggregation failed: ${response.status}`);

      return;
    }

    // Count successful aggregation requests.
    successfulRequests++;
  } catch (error) {
    // This catches network-level failures,
    // for example if the server is unavailable.
    failedRequests++;

    console.error("Aggregation request failed:", error);
  }
}

// Main load-test function.
async function main() {
  console.log(`Running aggregation load for ${DURATION_SECONDS} seconds`);

  console.log("Rate: 1 request/second");

  // Run one iteration for every second
  // of the configured test duration.
  for (let second = 0; second < DURATION_SECONDS; second++) {
    // Measure the complete iteration,
    // including the aggregation request.
    const iterationStart = performance.now();

    // Send one aggregation request
    // and wait for it to finish.
    await runAggregation();

    // Calculate how long the request took.
    const elapsed = performance.now() - iterationStart;

    // We want one request approximately every second.
    // If the request itself takes longer than 1 second,
    // waitTime becomes 0.
    const waitTime = Math.max(0, 1000 - elapsed);

    // Sleep for the remaining part of the second.
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  // Sort latency values from fastest to slowest.
  // Percentile calculations require sorted data.
  const sorted = [...latencies].sort((a, b) => a - b);

  // Calculate a latency percentile.

  const percentile = (p: number) => {
    if (sorted.length === 0) {
      return 0;
    }

    // Find the array position for the requested percentile.
    const index = Math.ceil(sorted.length * p) - 1;

    return sorted[Math.max(0, index)] ?? 0;
  };

  // Calculate average request latency.
  const average =
    latencies.length === 0
      ? 0
      : latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;

  // Print the final benchmark results.
  console.log("\nAggregation Results");

  console.log(`Successful requests: ${successfulRequests}`);

  console.log(`Failed requests: ${failedRequests}`);

  console.log(`Average latency: ${average.toFixed(2)} ms`);

  console.log(`p50 latency: ${percentile(0.5).toFixed(2)} ms`);

  console.log(`p95 latency: ${percentile(0.95).toFixed(2)} ms`);

  // p99 helps show rare slow requests / latency spikes.
  console.log(`p99 latency: ${percentile(0.99).toFixed(2)} ms`);
}

// Start the load test.
void main();
