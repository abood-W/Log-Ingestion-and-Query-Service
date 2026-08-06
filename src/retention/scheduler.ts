import { deleteExpiredLogs } from "./cleanup.js";

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);

  if (parsed < 1) {
    throw new Error(`${name} must be at least 1`);
  }

  return parsed;
}

export function startRetentionScheduler(): NodeJS.Timeout {
  const retentionDays = parsePositiveInteger(
    process.env.LOG_RETENTION_DAYS,
    30,
    "LOG_RETENTION_DAYS",
  );

  const intervalMinutes = parsePositiveInteger(
    process.env.RETENTION_CHECK_INTERVAL_MINUTES,
    60,
    "RETENTION_CHECK_INTERVAL_MINUTES",
  );

  const runCleanup = async () => {
    try {
      const deletedCount = await deleteExpiredLogs(retentionDays);

      console.log(
        `Retention cleanup completed: deleted ${deletedCount} expired logs`,
      );
    } catch (error) {
      console.error("Retention cleanup failed:", error);
    }
  };

  void runCleanup();

  return setInterval(
    () => {
      void runCleanup();
    },
    intervalMinutes * 60 * 1000,
  );
}
