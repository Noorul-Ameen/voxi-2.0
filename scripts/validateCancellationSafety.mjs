import assert from "node:assert/strict";
import {
  CANCELLATION_WEB_LOCK_NAME,
  classifyRefundFailure,
  hydrateCancellationJournal,
  normalizeCancellationJournal,
  withCancellationMutationLock,
} from "../src/lib/cancellationSafety.js";

const migrated = normalizeCancellationJournal({
  token: "cancel-legacy",
  bookingRef: "PRIVATE-REF",
  startedAt: 1_000,
});
assert.deepEqual(migrated, {
  token: "cancel-legacy",
  startedAt: 1_000,
  state: "pending",
}, "legacy journals must be reduced to an opaque safety record");
assert.equal(Object.hasOwn(migrated, "bookingRef"), false, "opaque journals must never retain a booking reference");
assert.equal(hydrateCancellationJournal(migrated, 1_001).orphaned, false);
assert.equal(hydrateCancellationJournal({ ...migrated, state: "reconciliation_required" }, 1_001).orphaned, true);
assert.equal(hydrateCancellationJournal(migrated, 1_000 + (10 * 60 * 1000)).orphaned, true);

for (const code of ["INVALID_ARGUMENT", "REFUND_INELIGIBLE", "CAPABILITY_UNAVAILABLE", "REFUND_REJECTED"]) {
  assert.equal(classifyRefundFailure({ code }), "definitive", `${code} must permit a safe journal clear`);
}
for (const code of [
  "VISTA_TIMEOUT",
  "VISTA_NETWORK_ERROR",
  "VISTA_RESPONSE_READ_ERROR",
  "VISTA_INVALID_JSON",
  "VISTA_HTTP_ERROR",
  "REFUND_OUTCOME_UNVERIFIED",
  "VISTA_ERROR",
  "",
]) {
  assert.equal(classifyRefundFailure({ code }), "ambiguous", `${code || "unknown errors"} must require reconciliation`);
}

assert.deepEqual(
  await withCancellationMutationLock(null, async () => "not-run"),
  { acquired: false, reason: "cross_tab_lock_unavailable", result: null },
  "live cancellation must fail closed without a cross-tab lock",
);
for (const failingManager of [
  { request() { throw new Error("SecurityError"); } },
  { request() { return Promise.reject(new Error("Lock service unavailable")); } },
]) {
  assert.deepEqual(
    await withCancellationMutationLock(failingManager, async () => "not-run"),
    { acquired: false, reason: "cross_tab_lock_unavailable", result: null },
    "Web Lock failures must resolve to the same fail-closed result used by the UI",
  );
}
await assert.rejects(
  () => withCancellationMutationLock({ request: async (_name, _options, callback) => callback({ name: "lock" }) }, async () => {
    throw new Error("mutation callback failed");
  }),
  /mutation callback failed/,
  "errors after the lock callback starts must not be misreported as an unsent request",
);

let held = false;
let providerCalls = 0;
let releaseFirst;
const firstCanFinish = new Promise((resolve) => { releaseFirst = resolve; });
const lockManager = {
  async request(name, options, callback) {
    assert.equal(name, CANCELLATION_WEB_LOCK_NAME);
    assert.deepEqual(options, { mode: "exclusive", ifAvailable: true });
    if (held) return callback(null);
    held = true;
    try {
      return await callback({ name });
    } finally {
      held = false;
    }
  },
};
const first = withCancellationMutationLock(lockManager, async () => {
  providerCalls += 1;
  await firstCanFinish;
  return "first-complete";
});
await Promise.resolve();
const second = await withCancellationMutationLock(lockManager, async () => {
  providerCalls += 1;
  return "second-complete";
});
assert.deepEqual(second, { acquired: false, reason: "cross_tab_mutation_in_progress", result: null });
releaseFirst();
assert.deepEqual(await first, { acquired: true, reason: null, result: "first-complete" });
assert.equal(providerCalls, 1, "two tabs racing for cancellation must produce at most one provider call");

console.log("Validated opaque cancellation journals, conservative refund-outcome classification, and exclusive cross-tab mutation locking.");
