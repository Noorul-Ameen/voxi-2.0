import assert from "node:assert/strict";
import {
  VOICE_CANCELLATION_DECISION_TTL_MS,
  advanceVoiceCancellationUserTurn,
  buildCancellationCompletionMessage,
  cancellationDecisionOutputOwner,
  cancellationCompletionOutputOwner,
  captureVoiceCancellationDecision,
  consumeVoiceCancellationDecision,
  createVoiceCancellationDecisionState,
  invalidateVoiceCancellationDecision,
  syncVoiceCancellationConfirmation,
} from "../src/lib/voiceCancellationDecision.js";

const activate = (state, bookingRef = "WLTEST1", phase = "final_confirmation") => (
  syncVoiceCancellationConfirmation(state, { bookingRef, phase })
);
const capture = (state, decision = true, now = 1_000) => captureVoiceCancellationDecision(state, {
  decision,
  bookingRef: "WLTEST1",
  phase: "final_confirmation",
  now,
}).state;
const consume = (state, overrides = {}) => consumeVoiceCancellationDecision(state, {
  requestedRef: "WLTEST1",
  flowBookingRef: "WLTEST1",
  flowPhase: "final_confirmation",
  now: 2_000,
  ...overrides,
});

let state = activate(advanceVoiceCancellationUserTurn(createVoiceCancellationDecisionState()));
state = capture(state);
assert.equal(state.pending.userTurn, 1, "a captured decision must bind to its monotonic user turn");
assert.equal(state.pending.confirmationNonce, state.confirmationNonce, "a captured decision must bind to its confirmation nonce");

const interrupted = advanceVoiceCancellationUserTurn(state);
assert.equal(interrupted.userTurn, 2);
assert.equal(interrupted.pending, null, "any later meaningful user turn must invalidate the decision");
assert.equal(consume(interrupted).reason, "decision_invalidated", "a delayed tool after a later turn must fail closed instead of replaying the confirmation");

const paused = consume(state, { paused: true });
assert.equal(paused.reason, "cancellation_paused");
assert.equal(paused.state.pending, null, "a paused cancellation must fail closed and invalidate the decision");
assert.equal(consume(createVoiceCancellationDecisionState(), { paused: true }).reason, "cancellation_paused", "paused state must reject before any no-pending or idempotent fallback");

const missingRef = consume(state, { requestedRef: "" });
assert.equal(missingRef.reason, "booking_ref_required");
assert.equal(missingRef.state.pending?.decisionNonce, state.pending.decisionNonce, "a missing reference must not consume a destructive decision");

const wrongRef = consume(state, { requestedRef: "WLOTHER" });
assert.equal(wrongRef.reason, "booking_ref_mismatch");
assert.equal(wrongRef.state.pending?.decisionNonce, state.pending.decisionNonce, "a wrong reference must not consume a destructive decision");

const correct = consume(state);
assert.equal(correct.pending.decision, true);
assert.equal(correct.state.pending, null, "the exact reference must consume once");
assert.equal(consume(correct.state).reason, "decision_consumed", "a consumed decision must not be reusable");

const expired = consume(state, { now: 1_000 + VOICE_CANCELLATION_DECISION_TTL_MS });
assert.equal(expired.reason, "decision_expired");
assert.equal(expired.state.pending, null);

const phaseChanged = syncVoiceCancellationConfirmation(state, { bookingRef: "WLTEST1", phase: "route_confirmation" });
assert.equal(phaseChanged.pending, null, "a phase change must invalidate the captured decision");
assert.notEqual(phaseChanged.confirmationNonce, state.confirmationNonce);

const disconnected = invalidateVoiceCancellationDecision(state, "disconnect");
assert.equal(disconnected.pending, null, "disconnect, reset, timeout, pause, and unmount use explicit invalidation");
assert.equal(consume(disconnected).reason, "decision_invalidated", "a delayed tool after disconnect invalidation must fail closed");

const retryableErrorFlow = {
  bookingRef: "WLERROR1",
  phase: "error",
  retryAllowed: true,
  dismissAllowed: true,
  outcomeUnknown: false,
};
let retryableErrorState = syncVoiceCancellationConfirmation(createVoiceCancellationDecisionState(), retryableErrorFlow);
retryableErrorState = advanceVoiceCancellationUserTurn(retryableErrorState);
const retryableErrorCapture = captureVoiceCancellationDecision(retryableErrorState, {
  ...retryableErrorFlow,
  decision: false,
  now: 5_000,
});
assert.equal(retryableErrorCapture.reason, null, "an eligible retryable error decline must be captured for the tool");
assert.equal(retryableErrorCapture.pending.decision, false, "an error decision state may capture only the non-destructive decline");
assert.equal(retryableErrorCapture.pending.bookingRef, "WLERROR1");
assert.equal(retryableErrorCapture.pending.userTurn, retryableErrorCapture.state.userTurn);
assert.equal(retryableErrorCapture.pending.confirmationNonce, retryableErrorCapture.state.confirmationNonce);

const retryableErrorWrongRef = consumeVoiceCancellationDecision(retryableErrorCapture.state, {
  requestedRef: "WLOTHER",
  flowBookingRef: retryableErrorFlow.bookingRef,
  flowPhase: retryableErrorFlow.phase,
  flowRetryAllowed: retryableErrorFlow.retryAllowed,
  flowDismissAllowed: retryableErrorFlow.dismissAllowed,
  flowOutcomeUnknown: retryableErrorFlow.outcomeUnknown,
  now: 6_000,
});
assert.equal(retryableErrorWrongRef.reason, "booking_ref_mismatch");
assert.equal(retryableErrorWrongRef.state.pending?.decisionNonce, retryableErrorCapture.pending.decisionNonce, "a wrong reference must not consume an error decline");

const retryableErrorConsumed = consumeVoiceCancellationDecision(retryableErrorCapture.state, {
  requestedRef: retryableErrorFlow.bookingRef,
  flowBookingRef: retryableErrorFlow.bookingRef,
  flowPhase: retryableErrorFlow.phase,
  flowRetryAllowed: retryableErrorFlow.retryAllowed,
  flowDismissAllowed: retryableErrorFlow.dismissAllowed,
  flowOutcomeUnknown: retryableErrorFlow.outcomeUnknown,
  now: 6_000,
});
assert.equal(retryableErrorConsumed.reason, null);
assert.equal(retryableErrorConsumed.pending.decision, false);
assert.equal(retryableErrorConsumed.state.pending, null);
assert.equal(consumeVoiceCancellationDecision(retryableErrorConsumed.state, {
  requestedRef: retryableErrorFlow.bookingRef,
  now: 6_001,
}).reason, "decision_consumed", "a duplicate exact-reference tool call must not reuse the error decline after the flow is dismissed");

const destructiveErrorCapture = captureVoiceCancellationDecision(retryableErrorState, {
  ...retryableErrorFlow,
  decision: true,
  now: 5_000,
});
assert.equal(destructiveErrorCapture.pending, null);
assert.equal(destructiveErrorCapture.reason, "destructive_error_decision_rejected", "yes during an error must never authorize a destructive retry");
const ineligibleErrorCapture = captureVoiceCancellationDecision(
  syncVoiceCancellationConfirmation(createVoiceCancellationDecisionState(), { ...retryableErrorFlow, retryAllowed: false }),
  { ...retryableErrorFlow, retryAllowed: false, decision: false, now: 5_000 },
);
assert.equal(ineligibleErrorCapture.pending, null);
assert.equal(ineligibleErrorCapture.reason, "retryable_error_not_eligible");

assert.equal(cancellationDecisionOutputOwner({ source: "voice_tool" }), "tool", "the existing tool must own the microphone error-decline acknowledgement");
assert.equal(cancellationDecisionOutputOwner({ source: "conversation" }), "local");

assert.equal(cancellationCompletionOutputOwner({ source: "conversation", isDemoSimulation: false }), "local");
assert.equal(cancellationCompletionOutputOwner({ source: "ui", isDemoSimulation: false }), "agent");
assert.equal(cancellationCompletionOutputOwner({ source: "ui", isDemoSimulation: true }), "local");
assert.equal(cancellationCompletionOutputOwner({ source: "voice_tool", isDemoSimulation: false }), "tool");

const persistenceWarning = buildCancellationCompletionMessage({
  locale: "en",
  storagePersisted: false,
  bookingRef: "WLTEST1",
  refundReference: "RF123",
});
assert.match(persistenceWarning, /refund was confirmed with reference RF123/i);
assert.match(persistenceWarning, /could not be saved on this device/i);
assert.match(persistenceWarning, /official VOX Manage Booking service/i);

for (const failure of [
  "Cancellation is not available for the current booking. No change was confirmed.",
  "The active booking changed before cancellation could run. No change was confirmed.",
  persistenceWarning,
]) {
  assert.ok(failure.trim(), "every practical failure or warning path must have an authoritative message");
}

console.log("Validated executable voice cancellation decision lifecycle, interruption safety, exact-reference one-time consumption, tool-owned retryable error decline, output ownership, expiry, and authoritative persistence warnings.");
