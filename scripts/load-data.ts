import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const { db, client } = await import("../src/db/index.js");
const { logs } = await import("../src/db/schema.js");

const TOTAL_ROWS = Number(process.env.LOAD_ROWS ?? 10_000);
const BATCH_SIZE = Number(process.env.LOAD_BATCH_SIZE ?? 1000);

const services = ["checkout", "auth", "payments", "orders", "inventory"];

const levels = ["debug", "info", "warn", "error"] as const;

function createLog(index: number) {
  const now = Date.now();

  return {
    timestamp: new Date(now - (index % (30 * 24 * 60 * 60)) * 1000),

    level: levels[index % levels.length],

    service: services[index % services.length] ?? "unknown",

    message: `generated log message ${index}`,

    attributes: {
      user_id: String(index % 10000),
      region: index % 2 === 0 ? "eu-west" : "us-east",
      retries: index % 5,
    },
  };
}

async function main() {
  console.log(`Generating ${TOTAL_ROWS} logs...`);

  const startTime = performance.now();

  for (let start = 0; start < TOTAL_ROWS; start += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_ROWS - start);

    const batch = Array.from({ length: batchSize }, (_, i) =>
      createLog(start + i),
    );

    await db.insert(logs).values(batch);

    const inserted = start + batchSize;

    console.log(`Inserted ${inserted}/${TOTAL_ROWS}`);
  }

  const endTime = performance.now();

  const seconds = (endTime - startTime) / 1000;

  console.log(`Finished in ${seconds.toFixed(2)} seconds`);

  console.log(
    `Average throughput: ${Math.round(TOTAL_ROWS / seconds)} logs/second`,
  );

  await client.end();
}

main().catch(async (error) => {
  console.error("Load generation failed:", error);

  await client.end();

  process.exit(1);
});
