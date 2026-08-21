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

let buffer: ValidLogInput[] = [];
let flushing = false;
let wake: (() => void) | null = null;

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

async function runLoop() {
  while (true) {
    if (buffer.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      continue;
    }
    const batch = buffer;
    buffer = [];
    flushing = true;
    try {
      const copyStream =
        await client`COPY logs (timestamp, level, service, message, attributes) FROM STDIN`.writable();
      await pipeline(Readable.from(batch.map(toCopyRow)), copyStream);
    } catch (err) {
      console.error(`Flush failed, ${batch.length} logs lost:`, err);
    } finally {
      flushing = false;
    }
  }
}

const loopPromise = runLoop();
loopPromise.catch((err) => console.error("Flush loop crashed:", err)); // safety net — the loop should never throw, but don't let it die silently

export function enqueueLogs(logs: ValidLogInput[]) {
  buffer.push(...logs);
  if (wake) {
    const resolve = wake;
    wake = null;
    resolve();
  }
}

// For tests: block until the buffer is fully drained
export async function flushNow() {
  while (buffer.length > 0 || flushing) {
    await new Promise((r) => setTimeout(r, 1));
  }
}
