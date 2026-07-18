import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";
import { VoxApiError } from "./vox-client.js";

test("server credentials are not required for build-time health mode", () => {
  const config = loadConfig({ requireCredentials: false });
  assert.equal(typeof config.orderWritesEnabled, "boolean");
});

test("upstream errors expose safe structured fields", () => {
  const error = new VoxApiError("Unavailable", { code: "VOX_TIMEOUT", retryable: true });
  assert.equal(error.code, "VOX_TIMEOUT");
  assert.equal(error.retryable, true);
  assert.equal(error.status, 502);
});
