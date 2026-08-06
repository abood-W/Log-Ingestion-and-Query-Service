import { existsSync } from "node:fs";
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const { db, client } = await import("../src/db/index.js");
const { logs } = await import("../src/db/schema.js");
const { deleteExpiredLogs } = await import("../src/retention/cleanup.js");

beforeEach(async () => {
  await db.delete(logs);
});

after(async () => {
  await client.end();
});

test("deletes logs older than the retention period", async () => {
  await db.insert(logs).values([
    {
      timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      level: "info",
      service: "old-service",
      message: "expired log",
      attributes: {},
    },
    {
      timestamp: new Date(),
      level: "info",
      service: "current-service",
      message: "current log",
      attributes: {},
    },
  ]);

  const deletedCount = await deleteExpiredLogs(30);

  assert.equal(deletedCount, 1);

  const remainingLogs = await db.select().from(logs);

  assert.equal(remainingLogs.length, 1);
  assert.equal(remainingLogs[0]?.service, "current-service");
});
