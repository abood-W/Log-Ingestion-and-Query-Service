//this file It will handle only the filters shared by both endpoints:get logs and get aggregate
import { eq, ilike, sql, type SQL } from "drizzle-orm";
import type { ParsedQs } from "qs";
import { logs } from "../db/schema.js";
import type { LogLevel } from "../types/logs.js";

const allowedLevels: LogLevel[] = ["debug", "info", "warn", "error"];

type FilterResult =
  | {
      valid: true;
      conditions: SQL[];
    }
  | {
      valid: false;
      reason: string;
    };

export function buildSharedLogFilters(query: ParsedQs): FilterResult {
  const conditions: SQL[] = [];

  const serviceParameter = query.service;

  if (serviceParameter !== undefined) {
    if (typeof serviceParameter !== "string") {
      return {
        valid: false,
        reason: "service must be a string",
      };
    }

    conditions.push(eq(logs.service, serviceParameter));
  }

  const levelParameter = query.level;

  if (levelParameter !== undefined) {
    if (
      typeof levelParameter !== "string" ||
      !allowedLevels.includes(levelParameter as LogLevel)
    ) {
      return {
        valid: false,
        reason: "invalid level",
      };
    }

    conditions.push(eq(logs.level, levelParameter as LogLevel));
  }

  const queryParameter = query.q;

  if (queryParameter !== undefined) {
    if (typeof queryParameter !== "string") {
      return {
        valid: false,
        reason: "q must be a string",
      };
    }

    conditions.push(ilike(logs.message, `%${queryParameter}%`));
  }

  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("attr.")) {
      continue;
    }

    if (typeof value !== "string") {
      return {
        valid: false,
        reason: `${key} must be a string`,
      };
    }

    const attributeKey = key.slice("attr.".length);

    if (attributeKey === "") {
      return {
        valid: false,
        reason: "attribute key must not be empty",
      };
    }

    conditions.push(sql`${logs.attributes} ->> ${attributeKey} = ${value}`);
  }

  return {
    valid: true,
    conditions,
  };
}
