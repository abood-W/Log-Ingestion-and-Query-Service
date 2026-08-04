import { Router } from "express";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";
import { validateLogEntry } from "../validation/logs.js";
import type { ValidLogInput, RejectedLog } from "../types/logs.js";
import { desc } from "drizzle-orm";
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

  const result = await db
    .select()
    .from(logs)
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(limit);

  return res.status(200).json({
    logs: result,
    next_cursor: null,
  });
});

export default router;
