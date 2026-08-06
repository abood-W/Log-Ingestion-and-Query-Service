import { lt } from "drizzle-orm";

import { db } from "../db/index.js";
import { logs } from "../db/schema.js";

export async function deleteExpiredLogs(
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const deletedRows = await db
    .delete(logs)
    .where(lt(logs.timestamp, cutoff))
    .returning({
      id: logs.id,
    });

  return deletedRows.length;
}
