import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const { app } = await import("../src/app.js");

test("GET /health returns 200 and OK", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.text, "OK");
});
