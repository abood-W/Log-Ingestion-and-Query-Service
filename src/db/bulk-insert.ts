//It is faster than await db.insert(logs).values(acceptedLogs);
//tagged template literal
import { client } from "./index.js";
import type { ValidLogInput } from "../types/logs.js";
export async function bulkInsertLogs(logs: ValidLogInput[]) {
  const rows = logs.map((log) => ({
    timestamp: log.timestamp.toISOString(),
    level: log.level,
    service: log.service,
    message: log.message,
    attributes: JSON.stringify(log.attributes),
  }));

  await client`
    INSERT INTO logs
    ${client(rows, "timestamp", "level", "service", "message", "attributes")}
  `;
}
