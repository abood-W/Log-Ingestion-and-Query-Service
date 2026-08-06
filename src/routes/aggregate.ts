import { Router } from "express";
import { and, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";
import { buildSharedLogFilters } from "../query/log-filters.js";

const router = Router();

router.get("/logs/aggregate", async (req, res) => {
  const sinceParameter = req.query.since;
  const untilParameter = req.query.until;
  const bucketParameter = req.query.bucket;
  const groupByParameter = req.query.group_by;

  if (typeof sinceParameter !== "string") {
    return res.status(400).json({
      error: "since is required and must be a valid ISO 8601 timestamp",
    });
  }

  const since = new Date(sinceParameter);

  if (Number.isNaN(since.getTime())) {
    return res.status(400).json({
      error: "since must be a valid ISO 8601 timestamp",
    });
  }

  if (typeof untilParameter !== "string") {
    return res.status(400).json({
      error: "until is required and must be a valid ISO 8601 timestamp",
    });
  }

  const until = new Date(untilParameter);

  if (Number.isNaN(until.getTime())) {
    return res.status(400).json({
      error: "until must be a valid ISO 8601 timestamp",
    });
  }

  if (until <= since) {
    return res.status(400).json({
      error: "until must be later than since",
    });
  }

  const allowedBuckets = ["1m", "5m", "1h", "1d"] as const;

  if (
    typeof bucketParameter !== "string" ||
    !allowedBuckets.includes(bucketParameter as (typeof allowedBuckets)[number])
  ) {
    return res.status(400).json({
      error: "bucket must be one of: 1m, 5m, 1h, 1d",
    });
  }

  if (
    groupByParameter !== undefined &&
    (typeof groupByParameter !== "string" ||
      !["service", "level"].includes(groupByParameter))
  ) {
    return res.status(400).json({
      error: "group_by must be either service or level",
    });
  }

  const sharedFiltersResult = buildSharedLogFilters(req.query);

  if (!sharedFiltersResult.valid) {
    return res.status(400).json({
      error: sharedFiltersResult.reason,
    });
  }

  const conditions: SQL[] = [
    gte(logs.timestamp, since),
    lt(logs.timestamp, until),
    ...sharedFiltersResult.conditions,
  ];

  const bucketExpression: SQL =
    bucketParameter === "1m"
      ? sql`date_trunc('minute', ${logs.timestamp})`
      : bucketParameter === "5m"
        ? sql`
            to_timestamp(
              floor(extract(epoch from ${logs.timestamp}) / 300) * 300
            )
          `
        : bucketParameter === "1h"
          ? sql`date_trunc('hour', ${logs.timestamp})`
          : sql`date_trunc('day', ${logs.timestamp})`;

  let result;

  if (groupByParameter === "service") {
    result = await db
      .select({
        start: bucketExpression,
        group: logs.service,
        count: sql<number>`count(*)::int`,
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(bucketExpression, logs.service)
      .orderBy(bucketExpression, logs.service);
  } else if (groupByParameter === "level") {
    result = await db
      .select({
        start: bucketExpression,
        group: logs.level,
        count: sql<number>`count(*)::int`,
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(bucketExpression, logs.level)
      .orderBy(bucketExpression, logs.level);
  } else {
    result = await db
      .select({
        start: bucketExpression,
        group: sql<null>`NULL`,
        count: sql<number>`count(*)::int`,
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(bucketExpression)
      .orderBy(bucketExpression);
  }
  const buckets = result.map((row) => ({
    start: new Date(row.start as string | Date).toISOString(),
    group: row.group,
    count: row.count,
  }));
  return res.status(200).json({
    buckets,
  });
});

export default router;
