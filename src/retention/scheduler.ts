import { deleteExpiredLogs } from "./cleanup.js";

// Scheduler for periodic retention cleanup.
// This module reads configuration from the environment and schedules a
// periodic task that deletes expired log rows from the database.

/**
 * Parse a positive integer from a string environment value.
 *
 * - `value` is the raw string (or undefined) from an env var.
 * - `fallback` is returned when `value` is undefined.
 * - `name` is used to produce a helpful error message when parsing fails.
 *
 * Throws an Error when the value is not a positive integer (>= 1).
 */
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

/**
 * Start the retention scheduler.
 *
 * Reads two environment variables:
 * - `LOG_RETENTION_DAYS` (default: 30): how many days to keep logs before
 *   they are considered expired and eligible for deletion.
 * - `RETENTION_CHECK_INTERVAL_MINUTES` (default: 60): how often (in
 *   minutes) the cleanup job runs.
 *
 * The function performs an immediate cleanup run once, then schedules
 * subsequent runs with `setInterval`. It returns the `NodeJS.Timeout` so
 * the caller can clear the interval if needed (e.g., during shutdown).
 */
export function startRetentionScheduler(): NodeJS.Timeout {
  // Read and validate retention configuration from environment.
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

  // The actual cleanup function that calls into `cleanup.deleteExpiredLogs`.
  // It logs success with the number of deleted rows and catches errors so
  // they don't crash the scheduler.
  const runCleanup = async () => {
    try {
      const deletedCount = await deleteExpiredLogs(retentionDays);

      console.log(
        `Retention cleanup completed: deleted ${deletedCount} expired logs`,
      );
    } catch (error) {
      // Keep the error handling simple: log and continue. The next scheduled
      // run will attempt cleanup again.
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
