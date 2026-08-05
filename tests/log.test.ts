import { existsSync } from "node:fs";
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Locally, load DATABASE_URL from .env.
// In GitHub Actions, DATABASE_URL already exists in the CI environment.
if (existsSync(".env")) {
  process.loadEnvFile();
}

const { app } = await import("../src/app.js");
const { db, client } = await import("../src/db/index.js");
const { logs } = await import("../src/db/schema.js");

// Give every test an empty logs table.
beforeEach(async () => {
  await db.delete(logs);
});

// Close PostgreSQL connections after all tests finish.
after(async () => {
  await client.end();
});

test("POST /logs accepts valid log entries", async () => {
  const response = await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-07-20T14:32:01.123Z",
          level: "error",
          service: "checkout",
          message: "payment declined",
          attributes: {
            user_id: "42",
            region: "eu-west",
            retries: 3,
          },
        },
        {
          timestamp: "2026-07-20T14:33:01.123Z",
          level: "info",
          service: "auth",
          message: "login successful",
        },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted, 2);
  assert.deepEqual(response.body.rejected, []);

  const storedLogs = await db.select().from(logs);

  assert.equal(storedLogs.length, 2);
});
test("POST /logs accepts valid entries and rejects invalid entries", async () => {
  const response = await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-07-20T14:32:01.123Z",
          level: "info",
          service: "auth",
          message: "login successful",
        },
        {
          timestamp: "2026-07-20T14:33:01.123Z",
          level: "critical",
          service: "checkout",
          message: "invalid level test",
        },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted, 1);
  assert.equal(response.body.rejected.length, 1);
  assert.equal(response.body.rejected[0].index, 1);
  assert.match(response.body.rejected[0].reason, /invalid level/i);

  const storedLogs = await db.select().from(logs);

  assert.equal(storedLogs.length, 1);
  assert.equal(storedLogs[0]?.service, "auth");
});

test("POST /logs returns 400 when all entries are rejected", async () => {
  const response = await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "invalid-date",
          level: "error",
          service: "checkout",
          message: "invalid timestamp",
        },
        {
          timestamp: "2026-07-20T14:32:01.123Z",
          level: "critical",
          service: "checkout",
          message: "invalid level",
        },
      ],
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.accepted, 0);
  assert.equal(response.body.rejected.length, 2);

  const storedLogs = await db.select().from(logs);

  assert.equal(storedLogs.length, 0);
});

test("POST /logs rejects a body without a logs array", async () => {
  const response = await request(app).post("/logs").send({
    message: "missing logs array",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /logs must be an array/i);
});

test("GET /logs filters by service, level, message, and attributes", async () => {
  const insertResponse = await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-07-20T14:00:00.000Z",
          level: "error",
          service: "checkout",
          message: "payment declined",
          attributes: {
            user_id: "42",
            region: "eu-west",
          },
        },
        {
          timestamp: "2026-07-20T14:01:00.000Z",
          level: "info",
          service: "auth",
          message: "login successful",
          attributes: {
            user_id: "10",
          },
        },
      ],
    });

  assert.equal(insertResponse.status, 200);

  const response = await request(app).get("/logs").query({
    service: "checkout",
    level: "error",
    q: "PAYMENT",
    "attr.user_id": "42",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.logs.length, 1);
  assert.equal(response.body.logs[0].service, "checkout");
  assert.equal(response.body.logs[0].level, "error");
  assert.equal(response.body.logs[0].message, "payment declined");
  assert.equal(response.body.next_cursor, null);
});

test("GET /logs applies inclusive since and exclusive until filters", async () => {
  await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-07-20T14:00:00.000Z",
          level: "info",
          service: "auth",
          message: "first log",
        },
        {
          timestamp: "2026-07-20T14:30:00.000Z",
          level: "info",
          service: "auth",
          message: "second log",
        },
        {
          timestamp: "2026-07-20T15:00:00.000Z",
          level: "info",
          service: "auth",
          message: "third log",
        },
      ],
    });

  const response = await request(app).get("/logs").query({
    since: "2026-07-20T14:00:00.000Z",
    until: "2026-07-20T15:00:00.000Z",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.logs.length, 2);

  const messages = response.body.logs.map(
    (log: { message: string }) => log.message,
  );

  assert.deepEqual(messages, ["second log", "first log"]);
});

test("GET /logs rejects until earlier than since", async () => {
  const response = await request(app).get("/logs").query({
    since: "2026-07-20T15:00:00.000Z",
    until: "2026-07-20T14:00:00.000Z",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "until must be later than since");
});

test("GET /logs supports cursor pagination", async () => {
  await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-07-20T14:00:00.000Z",
          level: "debug",
          service: "checkout",
          message: "first log",
        },
        {
          timestamp: "2026-07-20T14:00:00.000Z",
          level: "info",
          service: "auth",
          message: "second log",
        },
      ],
    });

  const firstPage = await request(app).get("/logs").query({ limit: 1 });

  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.logs.length, 1);
  assert.equal(typeof firstPage.body.next_cursor, "string");

  const firstLogId = firstPage.body.logs[0].id;
  const cursor = firstPage.body.next_cursor;

  const secondPage = await request(app).get("/logs").query({
    limit: 1,
    cursor,
  });

  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.logs.length, 1);
  assert.notEqual(secondPage.body.logs[0].id, firstLogId);
  assert.equal(secondPage.body.next_cursor, null);
});

test("GET /logs rejects an invalid cursor", async () => {
  const response = await request(app).get("/logs").query({
    cursor: "not-a-valid-cursor",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid cursor");
});
