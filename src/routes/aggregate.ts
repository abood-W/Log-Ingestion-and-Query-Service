import { Router } from "express";
import { and, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";
import { buildSharedLogFilters } from "../query/log-filters.js";
import { parseTimeRange } from "../query/time-range.js";

const router = Router();

router.get("/logs/aggregate", async (req, res) => {
  const bucketParameter = req.query.bucket;
  const groupByParameter = req.query.group_by;

  const timeRangeResult = parseTimeRange(req.query, {
    sinceRequired: true,
    untilRequired: true,
  });

  if (!timeRangeResult.valid) {
    return res.status(400).json({
      error: timeRangeResult.reason,
    });
  }

  const { since, until } = timeRangeResult;

  if (since === undefined || until === undefined) {
    return res.status(400).json({
      error: "since and until are required",
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
