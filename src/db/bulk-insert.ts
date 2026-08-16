//It is faster than await db.insert(logs).values(acceptedLogs);
//tagged template literal
/*
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
*/

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { client } from "./index.js";
import type { ValidLogInput } from "../types/logs.js";

// COPY text format requires backslash, tab, newline, and carriage return to be escaped
function escapeCopyField(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function toCopyRow(log: ValidLogInput): string {
  const fields = [
    log.timestamp.toISOString(),
    log.level,
    log.service,
    log.message,
    JSON.stringify(log.attributes),
  ];
  return fields.map(escapeCopyField).join("\t") + "\n";
}

export async function bulkInsertLogs(logs: ValidLogInput[]) {
  const copyStream = await client`
    COPY logs (timestamp, level, service, message, attributes)
    FROM STDIN
  `.writable();

  const rowStream = Readable.from(logs.map(toCopyRow));

  await pipeline(rowStream, copyStream);
}
