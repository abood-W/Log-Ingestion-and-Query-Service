import test from "node:test";
import assert from "node:assert/strict";
import { validateLogEntry } from "../src/validation/logs.js";

test("accepts a valid log entry", () => {
  const result = validateLogEntry({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "auth",
    message: "login successful",
    attributes: {
      user_id: "42",
      retries: 3,
      successful: true,
    },
  });

  assert.equal(result.valid, true);

  if (result.valid) {
    assert.equal(result.value.level, "info");
    assert.equal(result.value.service, "auth");
    assert.equal(result.value.message, "login successful");
    assert.deepEqual(result.value.attributes, {
      user_id: "42",
      retries: 3,
      successful: true,
    });
  }
});

test("rejects a missing timestamp", () => {
  const result = validateLogEntry({
    level: "info",
    service: "auth",
    message: "login successful",
  });

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(result.reason, "timestamp is required");
  }
});

test("rejects an invalid timestamp", () => {
  const result = validateLogEntry({
    timestamp: "not-a-date",
    level: "info",
    service: "auth",
    message: "login successful",
  });

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(result.reason, "timestamp must be a valid ISO 8601 timestamp");
  }
});

test("rejects a timestamp more than 5 minutes in the future", () => {
  const futureTimestamp = new Date(Date.now() + 6 * 60 * 1000).toISOString();

  const result = validateLogEntry({
    timestamp: futureTimestamp,
    level: "info",
    service: "auth",
    message: "future log",
  });

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(
      result.reason,
      "timestamp cannot be more than 5 minutes in the future",
    );
  }
});

test("rejects an unsupported log level", () => {
  const result = validateLogEntry({
    timestamp: new Date().toISOString(),
    level: "critical",
    service: "checkout",
    message: "payment failed",
  });

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(result.reason, "invalid level: 'critical'");
  }
});

test("rejects an empty service", () => {
  const result = validateLogEntry({
    timestamp: new Date().toISOString(),
    level: "error",
    service: "   ",
    message: "payment failed",
  });

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(result.reason, "service must be a non-empty string");
  }
});

test("rejects an empty message", () => {
  const result = validateLogEntry({
    timestamp: new Date().toISOString(),
    level: "error",
    service: "checkout",
    message: "",
  });

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(result.reason, "message must be a non-empty string");
  }
});

test("accepts a timestamp within five minutes in the future", () => {
  const timestamp = new Date(Date.now() + 4 * 60 * 1000).toISOString();

  const result = validateLogEntry({
    timestamp,
    level: "info",
    service: "auth",
    message: "future log",
  });

  assert.equal(result.valid, true);
});

test("rejects a timestamp more than five minutes in the future", () => {
  const timestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const result = validateLogEntry({
    timestamp,
    level: "info",
    service: "auth",
    message: "future log",
  });

  assert.equal(result.valid, false);
});
