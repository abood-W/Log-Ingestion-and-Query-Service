import { existsSync } from "node:fs";
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

if (existsSync(".env")) {
  process.loadEnvFile();
}
const { app } = await import("../src/app.js");
const { db, client } = await import("../src/db/index.js");
const { logs } = await import("../src/db/schema.js");

beforeEach(async () => {
  await db.delete(logs);
});

after(async () => {
  await client.end();
});
test("GET /logs/aggregate returns counts grouped by time bucket", async () => {
  const insertResponse = await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-08-04T14:01:00.000Z",
          level: "debug",
          service: "checkout",
          message: "first log",
        },
        {
          timestamp: "2026-08-04T14:01:30.000Z",
          level: "info",
          service: "auth",
          message: "second log",
        },
        {
          timestamp: "2026-08-04T14:02:00.000Z",
          level: "error",
          service: "checkout",
          message: "third log",
        },
      ],
    });

  assert.equal(insertResponse.status, 200);

  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    until: "2026-08-04T15:00:00.000Z",
    bucket: "1m",
  });

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, {
    buckets: [
      {
        start: "2026-08-04T14:01:00.000Z",
        group: null,
        count: 2,
      },
      {
        start: "2026-08-04T14:02:00.000Z",
        group: null,
        count: 1,
      },
    ],
  });
});
test("GET /logs/aggregate groups results by service", async () => {
  await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-08-04T14:01:00.000Z",
          level: "debug",
          service: "checkout",
          message: "first checkout log",
        },
        {
          timestamp: "2026-08-04T14:02:00.000Z",
          level: "info",
          service: "auth",
          message: "auth log",
        },
        {
          timestamp: "2026-08-04T14:03:00.000Z",
          level: "error",
          service: "checkout",
          message: "second checkout log",
        },
      ],
    });

  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    until: "2026-08-04T15:00:00.000Z",
    bucket: "5m",
    group_by: "service",
  });

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, {
    buckets: [
      {
        start: "2026-08-04T14:00:00.000Z",
        group: "auth",
        count: 1,
      },
      {
        start: "2026-08-04T14:00:00.000Z",
        group: "checkout",
        count: 2,
      },
    ],
  });
});
test("GET /logs/aggregate groups results by level", async () => {
  await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-08-04T14:01:00.000Z",
          level: "error",
          service: "checkout",
          message: "payment failed",
        },
        {
          timestamp: "2026-08-04T14:02:00.000Z",
          level: "error",
          service: "checkout",
          message: "database failed",
        },
        {
          timestamp: "2026-08-04T14:03:00.000Z",
          level: "info",
          service: "auth",
          message: "login successful",
        },
      ],
    });

  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    until: "2026-08-04T15:00:00.000Z",
    bucket: "5m",
    group_by: "level",
  });

  assert.equal(response.status, 200);

  assert.equal(response.body.buckets.length, 2);

  const bucketsByGroup = new Map(
    response.body.buckets.map(
      (bucket: { start: string; group: string; count: number }) => [
        bucket.group,
        bucket,
      ],
    ),
  );

  assert.deepEqual(bucketsByGroup.get("error"), {
    start: "2026-08-04T14:00:00.000Z",
    group: "error",
    count: 2,
  });

  assert.deepEqual(bucketsByGroup.get("info"), {
    start: "2026-08-04T14:00:00.000Z",
    group: "info",
    count: 1,
  });
});
test("GET /logs/aggregate applies service, level, q, and attribute filters", async () => {
  await request(app)
    .post("/logs")
    .send({
      logs: [
        {
          timestamp: "2026-08-04T14:01:00.000Z",
          level: "error",
          service: "checkout",
          message: "payment declined",
          attributes: {
            user_id: "42",
          },
        },
        {
          timestamp: "2026-08-04T14:02:00.000Z",
          level: "error",
          service: "checkout",
          message: "payment timeout",
          attributes: {
            user_id: "99",
          },
        },
        {
          timestamp: "2026-08-04T14:03:00.000Z",
          level: "info",
          service: "auth",
          message: "login successful",
          attributes: {
            user_id: "42",
          },
        },
      ],
    });

  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    until: "2026-08-04T15:00:00.000Z",
    bucket: "5m",
    service: "checkout",
    level: "error",
    q: "DECLINED",
    "attr.user_id": "42",
  });

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, {
    buckets: [
      {
        start: "2026-08-04T14:00:00.000Z",
        group: null,
        count: 1,
      },
    ],
  });
});
test("GET /logs/aggregate returns an empty buckets array when no logs match", async () => {
  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-05T14:00:00.000Z",
    until: "2026-08-05T15:00:00.000Z",
    bucket: "1m",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    buckets: [],
  });
});

test("GET /logs/aggregate rejects a missing since parameter", async () => {
  const response = await request(app).get("/logs/aggregate").query({
    until: "2026-08-04T15:00:00.000Z",
    bucket: "1m",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /since is required/i);
});

test("GET /logs/aggregate rejects a missing until parameter", async () => {
  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    bucket: "1m",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /until is required/i);
});

test("GET /logs/aggregate rejects an invalid bucket", async () => {
  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    until: "2026-08-04T15:00:00.000Z",
    bucket: "10m",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "bucket must be one of: 1m, 5m, 1h, 1d");
});

test("GET /logs/aggregate rejects an invalid group_by", async () => {
  const response = await request(app).get("/logs/aggregate").query({
    since: "2026-08-04T14:00:00.000Z",
    until: "2026-08-04T15:00:00.000Z",
    bucket: "1m",
    group_by: "message",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "group_by must be either service or level");
});
