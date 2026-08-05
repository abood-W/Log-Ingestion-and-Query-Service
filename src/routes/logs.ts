import { Router } from "express";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";
import { validateLogEntry } from "../validation/logs.js";
import type { ValidLogInput, RejectedLog } from "../types/logs.js";
import { desc, eq, and, gte, lt, sql, ilike, or } from "drizzle-orm";

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

  const acceptedLogs: ValidLogInput[] = [];
  const rejected: RejectedLog[] = [];

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

  if (acceptedLogs.length === 0) {
    return res.status(400).json({
      accepted: 0,
      rejected,
    });
  }

  await db.insert(logs).values(acceptedLogs);

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

  const conditions = [];

  const serviceParameter = req.query.service;

  if (serviceParameter !== undefined) {
    if (typeof serviceParameter !== "string") {
      return res.status(400).json({
        error: "service must be a string",
      });
    }

    conditions.push(eq(logs.service, serviceParameter));
  }

  const levelParameter = req.query.level;

  if (levelParameter !== undefined) {
    if (
      typeof levelParameter !== "string" ||
      !["debug", "info", "warn", "error"].includes(levelParameter)
    ) {
      return res.status(400).json({
        error: "invalid level",
      });
    }

    conditions.push(
      eq(logs.level, levelParameter as "debug" | "info" | "warn" | "error"),
    );
  }

  const sinceParameter = req.query.since;

  if (sinceParameter !== undefined) {
    if (typeof sinceParameter !== "string") {
      return res.status(400).json({
        error: "since must be a valid ISO 8601 timestamp",
      });
    }

    const since = new Date(sinceParameter);

    if (Number.isNaN(since.getTime())) {
      return res.status(400).json({
        error: "since must be a valid ISO 8601 timestamp",
      });
    }

    conditions.push(gte(logs.timestamp, since));
  }

  const untilParameter = req.query.until;
  if (untilParameter !== undefined) {
    if (typeof untilParameter !== "string") {
      return res.status(400).json({
        error: "until must be a valid ISO 8601 timestamp",
      });
    }

    const until = new Date(untilParameter);

    if (Number.isNaN(until.getTime())) {
      return res.status(400).json({
        error: "until must be a valid ISO 8601 timestamp",
      });
    }
    conditions.push(lt(logs.timestamp, until));
  }

  for (const [key, value] of Object.entries(req.query)) {
    if (!key.startsWith("attr.")) {
      continue;
    }

    if (typeof value !== "string") {
      return res.status(400).json({
        error: `query parameter ${key} must be a string`,
      });
    }
    const attributeKey = key.substring(5);

    conditions.push(sql`${logs.attributes} ->> ${attributeKey} = ${value}`);
  }

  const queryParameter = req.query.q;

  if (queryParameter !== undefined) {
    if (typeof queryParameter !== "string") {
      return res.status(400).json({
        error: "q must be a string",
      });
    }
    conditions.push(ilike(logs.message, `%${queryParameter}%`));
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
