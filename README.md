# Log Ingestion and Query Service

A TypeScript-based Express service for ingesting structured logs, validating them, and storing them in PostgreSQL using Drizzle ORM.

## What it does

- Accepts bulk log events through a `/logs` POST endpoint.
- Validates each log entry for required fields, timestamp format, allowed log levels, and flat attribute values.
- Persists accepted log entries into a PostgreSQL database using Drizzle ORM.
- Provides a simple `/health` endpoint for readiness checks.

## Key components

- `src/index.ts` — loads environment variables and starts the server.
- `src/server.ts` — configures Express, health checks, and database connectivity.
- `src/routes/logs.ts` — handles `/logs` ingestion logic and response structure.
- `src/db/schema.ts` — defines the `logs` table with typed columns and indexes.
- `src/validation/logs.ts` — validates incoming log payloads.

## Supported log schema

Each log object must include:

- `timestamp` — ISO 8601 string, not more than 5 minutes in the future
- `level` — one of `info`, `warn`, `error`, `debug`
- `service` — non-empty string identifying the source service
- `message` — non-empty string
- `attributes` — optional flat object with string, number, or boolean values

## Database model

The `logs` table stores:

- `id` — auto-incrementing primary key
- `timestamp` — timestamp with timezone
- `level` — enum log level
- `service` — service name
- `message` — log message
- `attributes` — JSONB metadata

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run migrations:
   ```bash
   npm run db:migrate
   ```
3. Start the app in development mode:
   ```bash
   npm run dev
   ```

## API endpoints

- `GET /health` — returns `OK`
- `POST /logs` — submit an object with a `logs` array

Example request body:

```json
{
  "logs": [
    {
      "timestamp": "2026-08-04T12:00:00Z",
      "level": "info",
      "service": "auth-service",
      "message": "User logged in",
      "attributes": {
        "userId": 123,
        "method": "oauth"
      }
    }
  ]
}
```

## Notes

- The app uses `tsx` for development execution.
- Database connectivity is checked before the server starts.
- Invalid log entries are rejected with contextual errors and accepted entries are inserted in bulk.
