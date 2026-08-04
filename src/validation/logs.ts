import e from "express";
import type {
  LogAttributeValue,
  LogLevel,
  ValidLogInput,
} from "../types/logs.js";

const allowedLogLevels: LogLevel[] = ["info", "warn", "error", "debug"];
// the validation is eather valid or invalid
type ValidationResult =
  | {
      valid: true;
      value: ValidLogInput;
    }
  | {
      valid: false;
      reason: string;
    };

export function validateLogEntry(entry: unknown): ValidationResult {
  // Implementation for validating log input
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return {
      valid: false,
      reason: "log entry must be an object",
    };
  }

  //used unknown not any ,because it's safer because each property is still unknown, so you must check its type before using it.
  const candidate = entry as Record<string, unknown>;

  if (typeof candidate.timestamp !== "string") {
    return {
      valid: false,
      reason: "timestamp is required",
    };
  }

  const timestamp = new Date(candidate.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return {
      valid: false,
      reason: "timestamp must be a valid ISO 8601 timestamp",
    };
  }

  const maxFutureDate = Date.now() + 5 * 60 * 1000; // 5 minutes in the future
  if (timestamp.getTime() > maxFutureDate) {
    return {
      valid: false,
      reason: "timestamp cannot be more than 5 minutes in the future",
    };
  }
  // Checking the timestamp is done

  if (
    typeof candidate.level !== "string" ||
    !allowedLogLevels.includes(candidate.level as LogLevel)
  ) {
    return {
      valid: false,
      reason: `invalid level: '${String(candidate.level)}'`,
    };
  }
  // Checking the level is done
  if (
    typeof candidate.service !== "string" ||
    candidate.service.trim() === ""
  ) {
    return {
      valid: false,
      reason: "service must be a non-empty string",
    };
  }
  // Checking the service is done

  if (
    typeof candidate.message !== "string" ||
    candidate.message.trim() === ""
  ) {
    return {
      valid: false,
      reason: "message must be a non-empty string",
    };
  }
  // Checking the message is done
  const attributesResult = validateAttributes(candidate.attributes);
  if (!attributesResult.valid) {
    return attributesResult;
  }

  return {
    valid: true,
    value: {
      timestamp,
      level: candidate.level as LogLevel,
      service: candidate.service,
      message: candidate.message,
      attributes: attributesResult.value,
    },
  };
}

function validateAttributes(attributes: unknown):
  | {
      valid: true;
      value: Record<string, LogAttributeValue>;
    }
  | {
      valid: false;
      reason: string;
    } {
  if (attributes === undefined) {
    return {
      valid: true,
      value: {},
    };
  }

  if (
    typeof attributes !== "object" ||
    attributes === null ||
    Array.isArray(attributes)
  ) {
    return {
      valid: false,
      reason: "attributes must be a flat object",
    };
  }

  for (const value of Object.values(attributes)) {
    const isAllowed =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean";

    if (!isAllowed) {
      return {
        valid: false,
        reason: "attribute values must be strings, numbers, or booleans",
      };
    }
  }

  return {
    valid: true,
    value: attributes as Record<string, LogAttributeValue>,
  };
}
