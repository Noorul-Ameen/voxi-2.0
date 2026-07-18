import assert from "node:assert/strict";
import fs from "node:fs";
import { startTransportWithRetirement } from "../src/lib/transportStart.js";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const transport = fs.readFileSync(new URL("../src/components/ElevenLabsTransport.jsx", import.meta.url), "utf8");

let activeGeneration = 0;
let resolveRetiredStart;
let retiredEndCalls = 0;
let retryEndCalls = 0;

const retiredStart = new Promise((resolve) => { resolveRetiredStart = resolve; });
const retiredTransport = {
  startSession: () => retiredStart,
  endSession: async () => { retiredEndCalls += 1; },
};

await assert.rejects(
  startTransportWithRetirement({
    transport: retiredTransport,
    options: { connectionType: "websocket" },
    timeoutMs: 5,
    retire: () => { activeGeneration += 1; },
  }),
  /timed out/i,
  "a never-settling SDK start must return control after the configured bound",
);
assert.equal(activeGeneration, 1, "a timed-out transport generation must be retired synchronously");

const retryTransport = {
  startSession: async () => "retry-conversation",
  endSession: async () => { retryEndCalls += 1; },
};
const retryId = await startTransportWithRetirement({
  transport: retryTransport,
  options: { connectionType: "websocket" },
  timeoutMs: 50,
  retire: () => { activeGeneration += 1; },
});
assert.equal(retryId, "retry-conversation", "a retry must use the fresh transport without waiting for retired cleanup");

resolveRetiredStart("late-conversation");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(retiredEndCalls, 1, "a late connection must be closed through its original transport handle");
assert.equal(retryEndCalls, 0, "late cleanup must never close the successful retry transport");

assert.match(app, /key=\{transportGeneration\}/, "the SDK hook must remount on transport retirement");
assert.match(transport, /if \(isActive\(generation\)\) callbacks\.onConnect/, "stale connection callbacks must be ignored");
assert.match(transport, /callbacks\.onMessage\?\./, "stale transport messages must be ignored");
assert.match(transport, /reason: "stale_transport"/, "stale client-tool calls must be rejected");
assert.doesNotMatch(app, /lateSessionCleanupRef/, "retries must not await a potentially never-settling cleanup promise");

console.log("Validated bounded start timeout, fresh-host retry, stale callback/tool invalidation, and targeted late cleanup.");
