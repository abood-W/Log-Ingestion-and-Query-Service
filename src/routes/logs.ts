import { Router } from "express";
import { db, client } from "../db/index.js";
import { logs } from "../db/schema.js";
import { validateLogEntry } from "../validation/logs.js";
import type { ValidLogInput, RejectedLog } from "../types/logs.js";
import { desc, eq, and, gte, lt, or, SQL } from "drizzle-orm";
import { buildSharedLogFilters } from "../query/log-filters.js";
import { parseTimeRange } from "../query/time-range.js";
import { bulkInsertLogs } from "../db/bulk-insert.js";
const router = Router();

router.post("/logs", async (req, res) => {
  const body = req.body as unknown;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return res.status(400).json({
      error: "request body must be an object",
    });
  }

  const requestBody = body as Record<string, unknown>;

  if (!Array.isArray(requestBody.logs)) {
    return res.status(400).json({
      error: "logs must be an array",
    });
  }
  const validationStart = performance.now();
  const acceptedLogs: ValidLogInput[] = [];
  const rejected: RejectedLog[] = [];
  /*
  requestBody.logs.forEach((entry, index) => {
    const result = validateLogEntry(entry);

    if (result.valid) {
      acceptedLogs.push(result.value);
    } else {
      rejected.push({
        index,
        reason: result.reason,
      });
    }
  });
*/
  for (let index = 0; index < requestBody.logs.length; index++) {
    const entry = requestBody.logs[index];
    const result = validateLogEntry(entry);

    if (result.valid) {
      acceptedLogs.push(result.value);
    } else {
      rejected.push({
        index,
        reason: result.reason,
      });
    }
  }
  if (acceptedLogs.length === 0) {
    return res.status(400).json({
      accepted: 0,
      rejected,
    });
  }
  const validationEnd = performance.now();

  console.log(`Validation: ${(validationEnd - validationStart).toFixed(2)} ms`);

  const insertStart = performance.now();

  await bulkInsertLogs(acceptedLogs);

  const insertEnd = performance.now();

  console.log(`Insert: ${(insertEnd - insertStart).toFixed(2)} ms`);
  return res.status(200).json({
    accepted: acceptedLogs.length,
    rejected,
  });
});
router.get("/logs", async (req, res) => {
  let limit = 100;
  const limitParameter = req.query.limit;

  if (limitParameter !== undefined) {
    if (typeof limitParameter !== "string" || !/^\d+$/.test(limitParameter)) {
      return res.status(400).json({
        error: "limit must be an integer",
      });
    }

    limit = Number(limitParameter);

    if (limit < 1 || limit > 1000) {
      return res.status(400).json({
        error: "limit must be between 1 and 1000",
      });
    }
  }

  const sharedFiltersResult = buildSharedLogFilters(req.query);
  if (!sharedFiltersResult.valid) {
    return res.status(400).json({
      error: sharedFiltersResult.reason,
    });
  }

  const conditions: SQL[] = [...sharedFiltersResult.conditions];

  const timeRangeResult = parseTimeRange(req.query, {
    sinceRequired: false,
    untilRequired: false,
  });
  if (!timeRangeResult.valid) {
    return res.status(400).json({
      error: timeRangeResult.reason,
    });
  }
  const { since, until } = timeRangeResult;
  if (since !== undefined) {
    conditions.push(gte(logs.timestamp, since));
  }
  if (until !== undefined) {
    conditions.push(lt(logs.timestamp, until));
  }

  const cursorParameter = req.query.cursor;

  if (cursorParameter !== undefined) {
    if (typeof cursorParameter !== "string") {
      return res.status(400).json({
        error: "cursor must be a string",
      });
    }

    try {
      const decodedCursor = JSON.parse(
        Buffer.from(cursorParameter, "base64url").toString("utf8"),
      ) as {
        timestamp?: unknown;
        id?: unknown;
      };

      if (
        typeof decodedCursor.timestamp !== "string" ||
        typeof decodedCursor.id !== "number"
      ) {
        return res.status(400).json({
          error: "invalid cursor",
        });
      }

      const cursorTimestamp = new Date(decodedCursor.timestamp);

      if (Number.isNaN(cursorTimestamp.getTime())) {
        return res.status(400).json({
          error: "invalid cursor",
        });
      }

      conditions.push(
        or(
          lt(logs.timestamp, cursorTimestamp),
          and(
            eq(logs.timestamp, cursorTimestamp),
            lt(logs.id, decodedCursor.id),
          ),
        )!,
      );
    } catch {
      return res.status(400).json({
        error: "invalid cursor",
      });
    }
  }
  const result = await db
    .select()
    .from(logs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(limit + 1);

  const hasMore = result.length > limit;
  const pageLogs = hasMore ? result.slice(0, limit) : result;

  let nextCursor: string | null = null;

  if (hasMore) {
    const lastLog = pageLogs[pageLogs.length - 1]!;

    nextCursor = Buffer.from(
      JSON.stringify({
        timestamp: lastLog.timestamp.toISOString(),
        id: lastLog.id,
      }),
    ).toString("base64url");
  }

  return res.status(200).json({
    logs: pageLogs,
    next_cursor: nextCursor,
  });
});

export default router;
