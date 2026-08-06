import type { ParsedQs } from "qs";

type TimeRangeResult =
  | {
      valid: true;
      since?: Date;
      until?: Date;
    }
  | {
      valid: false;
      reason: string;
    };

type TimeRangeOptions = {
  sinceRequired: boolean;
  untilRequired: boolean;
};
// parses a timestamp from a query parameter and returns a Date object if valid, or an error message if invalid
function parseTimestamp(
  value: unknown,
  name: "since" | "until",
  required: boolean,
):
  | {
      valid: true;
      value?: Date;
    }
  | {
      valid: false;
      reason: string;
    } {
  if (value === undefined) {
    if (required) {
      return {
        valid: false,
        reason: `${name} is required and must be a valid ISO 8601 timestamp`,
      };
    }

    return {
      valid: true,
      value: undefined,
    };
  }

  if (typeof value !== "string") {
    return {
      valid: false,
      reason: `${name} must be a valid ISO 8601 timestamp`,
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      valid: false,
      reason: `${name} must be a valid ISO 8601 timestamp`,
    };
  }

  return {
    valid: true,
    value: date,
  };
}
/** TimeRangeOptions specifies whether the since and until parameters are required.
The parseTimeRange function takes a query object and options, and returns a TimeRangeResult 
indicating whether the time range is valid, and if so, the parsed since and until dates.*/
export function parseTimeRange(
  query: ParsedQs,
  options: TimeRangeOptions,
): TimeRangeResult {
  const sinceResult = parseTimestamp(
    query.since,
    "since",
    options.sinceRequired,
  );

  if (!sinceResult.valid) {
    return sinceResult;
  }

  const untilResult = parseTimestamp(
    query.until,
    "until",
    options.untilRequired,
  );

  if (!untilResult.valid) {
    return untilResult;
  }

  const since = sinceResult.value;
  const until = untilResult.value;

  if (since !== undefined && until !== undefined && until <= since) {
    return {
      valid: false,
      reason: "until must be later than since",
    };
  }

  return {
    valid: true,
    since,
    until,
  };
}
