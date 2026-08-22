# Log Ingestion and Query Service

A high-throughput log ingestion and query service built with TypeScript, Express, PostgreSQL, Drizzle ORM, and postgres.js.

The service accepts structured logs in batches, validates them, stores them in PostgreSQL, supports filtering and cursor-based pagination, provides time-bucketed aggregation, and automatically removes expired logs based on a configurable retention period.

The project is designed to handle approximately 1,000,000 stored log records while maintaining high ingestion throughput and responsive queries under constrained CPU and memory resources.

---

## Features

- Bulk log ingestion through `POST /logs`
- Per-entry validation with partial batch acceptance
- PostgreSQL persistent storage
- Filtering by:
  - service
  - log level
  - time range
  - message text
  - attributes
- Cursor-based pagination
- Time-bucketed aggregation
- Aggregation grouping by service or log level
- Configurable log retention
- Automatic retention cleanup
- Database indexes for common query patterns
- Docker and Docker Compose support
- Automatic database migrations
- Automated tests
- GitHub Actions CI
- Load-testing scripts
- Performance measurements under constrained CPU and memory

---

## Technology Stack

- Node.js 22
- TypeScript
- Express
- PostgreSQL 17
- Drizzle ORM
- postgres.js
- Docker
- Docker Compose
- GitHub Actions
- Node.js test runner
- tsx

---

## Project Structure

```text
src/
├── db/
│   ├── migrations/
│   ├── bulk-insert.ts
│   ├── index.ts
│   └── schema.ts
├── query/
│   ├── log-filters.ts
│   └── time-range.ts
├── retention/
│   ├── cleanup.ts
│   └── scheduler.ts
├── routes/
│   ├── aggregate.ts
│   └── logs.ts
├── types/
│   └── logs.ts
├── validation/
│   └── logs.ts
├── app.ts
├── index.ts
└── server.ts

scripts/
├── aggregate-load.ts
├── http-load.ts
└── load-data.ts

tests/
├── aggregate.test.ts
├── health.test.ts
├── log validation.test.ts
├── log.test.ts
└── retention.test.ts

.github/
├── workflows/
│   └── ci.yml

.dockerignore
.gitignore
docker-compose.yml
Dockerfile
drizzle.config.ts
```

### Main directories

- `src/db/` — database connection, schema, migrations, and optimized bulk insertion.
- `src/query/` — reusable log filtering and time-range query logic.
- `src/retention/` — retention cleanup and scheduled deletion of expired logs.
- `src/routes/` — ingestion, querying, and aggregation API routes.
- `src/types/` — shared TypeScript types.
- `src/validation/` — validation of incoming log entries.
- `scripts/` — dataset generation and performance/load-testing scripts.
- `tests/` — automated API, validation, aggregation, and retention tests.
- `.github/workflows/` — CI workflow configuration.

````
# Log Schema

Each log entry contains:

| Field        | Type            | Required | Description                         |
| ------------ | --------------- | -------- | ----------------------------------- |
| `timestamp`  | ISO 8601 string | Yes      | Event timestamp                     |
| `level`      | string          | Yes      | `debug`, `info`, `warn`, or `error` |
| `service`    | string          | Yes      | Service that generated the log      |
| `message`    | string          | Yes      | Log message                         |
| `attributes` | object          | No       | Flat key/value metadata             |

Attribute values may contain:

- strings
- numbers
- booleans

Example:

```json
{
  "timestamp": "2026-08-04T12:00:00Z",
  "level": "info",
  "service": "auth-service",
  "message": "User logged in",
  "attributes": {
    "userId": 123,
    "method": "oauth",
    "success": true
  }
}
````

Timestamps more than five minutes in the future are rejected.

---

# Database Design

The main PostgreSQL table is `logs`.

```text
logs
--------------------------------
id          bigint primary key
timestamp   timestamptz
level       log_level enum
service     text
message     text
attributes  jsonb
```

## Attribute Storage

Dynamic attributes are stored using PostgreSQL `JSONB`.

This allows different services to attach different metadata without requiring schema changes for every possible attribute.

For example:

```json
{
  "user_id": 42,
  "region": "eu",
  "cached": true
}
```

The API can filter these attributes using query parameters such as:

```text
GET /logs?attr.region=eu
```

Only flat string, number, and boolean attribute values are accepted.

---

# Index Design

Indexes are defined for frequently queried fields:

```text
timestamp
service
level
```

These indexes improve filtering and time-range queries while keeping write overhead relatively low.

The index strategy was tested using PostgreSQL:

```sql
EXPLAIN ANALYZE
```

Performance testing showed that PostgreSQL may choose different query plans depending on dataset size and query selectivity.

For example, small datasets may use sequential scans because scanning the table can be cheaper than using an index.

At larger dataset sizes PostgreSQL uses indexes when they provide a lower-cost execution plan.

Index design was kept intentionally limited because every additional index increases ingestion cost.

---

# API

The service runs on:

```text
http://localhost:8080
```

## GET /health

Health/readiness endpoint.

```http
GET /health
```

Response:

```text
OK
```

---

# POST /logs

Ingests a batch of logs.

Example:

```http
POST /logs
Content-Type: application/json
```

```json
{
  "logs": [
    {
      "timestamp": "2026-08-04T12:00:00Z",
      "level": "info",
      "service": "auth-service",
      "message": "User logged in",
      "attributes": {
        "userId": 123
      }
    }
  ]
}
```

Successful response:

```json
{
  "accepted": 1,
  "rejected": []
}
```

Validation is performed independently for every entry.

Therefore, a batch may contain both accepted and rejected entries.

If every entry is invalid, the request returns HTTP `400`.

---

# GET /logs

Queries stored logs.

Supported query parameters include:

| Parameter    | Description               |
| ------------ | ------------------------- |
| `service`    | Filter by service         |
| `level`      | Filter by log level       |
| `since`      | Inclusive start timestamp |
| `until`      | Exclusive end timestamp   |
| `q`          | Search log messages       |
| `attr.<key>` | Filter by attribute       |
| `limit`      | Number of results         |
| `cursor`     | Pagination cursor         |

The filters can be combined.

Example:

```text
GET /logs?service=checkout&level=error&limit=100
```

Attribute filtering:

```text
GET /logs?attr.region=eu
```

Time filtering:

```text
GET /logs?since=2026-08-01T00:00:00Z&until=2026-08-02T00:00:00Z
```

---

## Cursor Pagination

`GET /logs` uses cursor-based pagination rather than offset pagination.

Results are ordered by:

```text
timestamp DESC
id DESC
```

The cursor contains the timestamp and ID of the last returned log.

Example response:

```json
{
  "logs": [],
  "next_cursor": null
}
```

When additional results exist, `next_cursor` can be supplied to the next request.

Cursor pagination was selected because it scales better than large SQL offsets as the log table grows.

---

# GET /logs/aggregate

Returns time-bucketed log counts.

Aggregation supports grouping by:

- service
- level

and supports the same relevant filtering behavior as log querying.

Example:

```text
GET /logs/aggregate?since=2026-08-01T00:00:00Z&until=2026-08-02T00:00:00Z&bucket=5m&group_by=service
```

The aggregation endpoint is designed for use cases such as monitoring log volume over time and comparing activity between services or log levels.

---

# Retention

The service supports automatic deletion of logs older than the configured retention period.

Retention cleanup runs automatically and removes expired records from PostgreSQL.

This prevents the log table from growing indefinitely.

The retention implementation is tested automatically.

---

# Bulk Ingestion Optimization

The initial ingestion implementation used Drizzle ORM:

```ts
await db.insert(logs).values(acceptedLogs);
```

During load testing, application-side processing became a significant bottleneck under the application's `0.5 CPU` limit.

The ingestion hot path was therefore optimized using the lower-level postgres.js client.

Before insertion, values are converted into database-friendly representations:

```ts
const rows = logs.map((log) => ({
  timestamp: log.timestamp.toISOString(),
  level: log.level,
  service: log.service,
  message: log.message,
  attributes: JSON.stringify(log.attributes),
}));
```

The entire batch is then inserted in one operation:

```ts
await client`
  INSERT INTO logs
  ${client(rows, "timestamp", "level", "service", "message", "attributes")}
`;
```

Drizzle remains useful for schema management and normal database queries, while the lower-level client is used for the performance-critical ingestion path.

This optimization produced a significant improvement in measured ingestion throughput.

---

# Docker

The entire service can be started using Docker Compose.

```bash
docker compose up --build
```

Or in detached mode:

```bash
docker compose up --build -d
```

Docker Compose starts:

```text
logs-app
logs-postgres
```

The application is available at:

```text
localhost:8080
```

PostgreSQL is exposed at:

```text
localhost:5432
```

The PostgreSQL container includes a health check, and the application waits for the database before starting.

Database migrations are automatically applied during container startup.

Persistent PostgreSQL data is stored using a Docker volume.

---

# Local Development

Install dependencies:

```bash
npm install
```

Run database migrations:

```bash
npm run db:migrate
```

Start the development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

---

# Testing

The project contains automated tests for:

- health endpoint
- log validation
- valid ingestion
- partial batch rejection
- completely invalid batches
- malformed request bodies
- service filtering
- level filtering
- message filtering
- attribute filtering
- time-range filtering
- invalid time ranges
- cursor pagination
- invalid cursors
- invalid limits
- aggregation
- aggregation grouping
- aggregation filtering
- invalid aggregation parameters
- retention cleanup

Current test suite:

```text
33 tests
33 passed
0 failed
```

Run:

```bash
npm test
```

---

# CI

GitHub Actions is used to automatically validate the project.

The CI pipeline:

1. starts PostgreSQL
2. installs Node.js dependencies
3. builds the TypeScript project
4. runs automated tests
5. validates the application against PostgreSQL

This ensures changes are checked before being merged.

---

# Performance Testing

Performance testing was performed using custom load-generation scripts.

The goal was to measure actual system behavior rather than estimate performance theoretically.

## Test Environment

The Docker containers were restricted to approximately:

| Component   |     CPU | Memory |
| ----------- | ------: | -----: |
| Application | 0.5 CPU | 256 MB |
| PostgreSQL  |   1 CPU |   1 GB |

The tests were executed locally using Docker.

---

# Aggregation Benchmark

Aggregation was tested at **1 request per second for 60 seconds while ingestion was active**.

```text
Successful requests: 60
Failed requests: 0
Average latency: 465.60 ms
p50 latency: 479.14 ms
p95 latency: 727.96 ms
p99 latency: 1040.26 ms
```

The aggregation p95 remained below the required **1 second** while the
system was simultaneously ingesting logs.

The p99 result shows occasional tail-latency spikes, which should be considered when evaluating behavior under heavier concurrent workloads.

> Note: final simultaneous ingestion + aggregation benchmarking is still being completed. The standalone aggregation result above should not be interpreted as the final concurrent-load result.

---

# Resource Usage

The application and PostgreSQL containers were monitored using:

```bash
docker stats logs-app logs-postgres

docker stats
```

The application was observed approaching its configured CPU limit during heavy ingestion, while PostgreSQL generally used substantially less CPU.

Memory remained well below the configured limits during the observed tests.

Final peak resource measurements from the simultaneous ingestion and aggregation benchmark will be recorded here.

---

# Bottlenecks Discovered

Load testing identified several important bottlenecks.

## 1. Application CPU

During high-throughput ingestion, the application container approached its `0.5 CPU` limit.

PostgreSQL CPU usage remained significantly lower.

This indicated that part of the ingestion bottleneck was in the Node.js application rather than PostgreSQL itself.

---

## 2. ORM Bulk Insert Overhead

The original Drizzle bulk insertion path introduced measurable application-side overhead.

Replacing the ingestion hot path with direct postgres.js bulk insertion significantly improved throughput.

---

## 3. Excessive Concurrency

Higher concurrency improved throughput during short tests but did not always improve sustained throughput.

For example:

```text
500k logs
concurrency 4 → 15,112 logs/s
concurrency 8 → 13,693 logs/s
```

Concurrency 8 also substantially increased request latency.

This demonstrated that more concurrency does not necessarily mean more throughput when CPU resources are constrained.

---

## 4. Batch Size

Batch size had a significant effect on throughput.

A batch size of `1500` provided better sustained performance than `1000` in the 1,000,000-log benchmark.

Very large batches can increase individual request latency, so batch size was selected based on measured throughput rather than assumptions.

---

## 5. Index Cost

Indexes improve query performance but increase write cost because PostgreSQL must update each relevant index for every inserted record.

The schema therefore uses a limited set of indexes aligned with the main query patterns rather than indexing every possible field.

---

# Optimizations Applied

The following optimizations were applied based on measured results:

- Bulk insertion instead of one insert per log
- PostgreSQL `COPY FROM STDIN` for high-throughput log ingestion
- Buffered batching with a background flush loop to combine incoming logs into larger database writes
- Direct `postgres.js` access on the ingestion hot path
- Batch-size tuning
- Concurrency tuning
- Limited database indexes
- Timestamp index for time-range queries
- Composite indexes for common service/time and level/time filters
- Cursor pagination instead of offset pagination
- PostgreSQL JSONB for flexible attributes
- Batched retention cleanup
- Performance testing using realistic large datasets

The ingestion pipeline was optimized by replacing the ORM-based hot path with lower-level PostgreSQL operations. Logs are buffered in memory and flushed in batches using PostgreSQL's `COPY FROM STDIN`, reducing per-row insert overhead and improving throughput.

# Performance Summary

Latest benchmark run:

```text
Stored records tested:        ~1,000,000

Ingestion:

Throughput:                   11,903 logs/sec
p95 request latency:          192 ms
Failed requests:              0
Error rate:                   0.0%

Aggregation:

Aggregate p95 latency:        6,079 ms

Benchmark reliability:

Successful scenarios:         4 / 4
```

# Final Verification

Before submission, the project should pass:

```bash
npm run build
npm test
```

Docker startup should also work from a clean environment:

```bash
docker compose up --build
```

Health can be verified using:

```bash
curl http://localhost:8080/health
```

Expected response:

```text
OK
```

---

# Status

Core functionality and mandatory performance testing are complete.

Implemented:

- ingestion and validation
- querying and filtering
- cursor pagination
- aggregation
- retention
- PostgreSQL persistence and migrations
- Docker and Docker Compose
- CI
- automated testing
- load and performance testing

---

## Queryability of Newly Ingested Data

A uniquely identifiable log was inserted through `POST /logs` and queried immediately through `GET /logs`.

Measured result:

```text
Accepted logs: 1
Query time after insertion: 0.059 seconds
```

The newly ingested record was queryable in approximately **59 ms**, well below the required **20-second** limit.
