import assert from "node:assert/strict";
import {
  cancellationFlowMatchesBooking,
  planPausedCancellationRestoration,
  synchronizedCancellationRenderState,
} from "../src/lib/cancellationRestoration.js";
import {
  CANCELLATION_CONFIRMATION_TTL_MS,
  armCancellationConfirmationTimerState,
  clearCancellationConfirmationTimerState,
  consumeCancellationConfirmationTimeout,
  createCancellationConfirmationTimerState,
  resumeCancellationConfirmationTimerState,
  suspendCancellationConfirmationTimerState,
} from "../src/lib/cancellationConfirmationTimer.js";
import {
  capturePausedRichStage,
  createPausedRichJourney,
  hidePausedRichStage,
  restorePausedRichStage,
  selectRestorableRichStage,
} from "../src/lib/pausedRichJourney.js";

const booking = {
  ref: "WLRESTORE1",
  movieTitle: "Restoration Test",
  cancelled: false,
};
const finalFlow = {
  bookingRef: booking.ref,
  phase: "final_confirmation",
  demoOnly: true,
  message: "Confirm device cancellation.",
};
const cancellationState = {
  phase: finalFlow.phase,
  bookingRef: booking.ref,
  demoOnly: true,
  message: finalFlow.message,
};
const stage = {
  view: "booking",
  purpose: "cancellation_target_selection",
  booking,
  pausedContext: {
    booking,
    cancellationFlow: finalFlow,
  },
};

let model = createPausedRichJourney({ sessionId: "session-1", journeyId: "journey-1" });
model = capturePausedRichStage(model, stage, { sessionId: "session-1", journeyId: "journey-1", now: 1_000 });
model = hidePausedRichStage(model, { reason: "faq_topic_change", now: 2_000 });
const entry = selectRestorableRichStage(model, { view: "cancellation" });
assert.ok(entry, "a paused cancellation must remain a distinct restorable entry");
assert.deepEqual(entry.snapshot.pausedContext.cancellationFlow, finalFlow, "the paused snapshot must retain the exact cancellation flow that owned its controls");
const modelWithUnrelatedHistory = capturePausedRichStage(model, {
  view: "history",
  bookings: [{ ...booking, ref: "WLOTHER" }],
}, { sessionId: "session-1", journeyId: "journey-1", now: 2_500 });
assert.equal(
  selectRestorableRichStage(modelWithUnrelatedHistory, { view: "cancellation" }).snapshot.booking.ref,
  booking.ref,
  "an unrelated history panel must not overwrite the paused cancellation entry",
);

const missingLiveFlowPlan = planPausedCancellationRestoration({
  snapshot: entry.snapshot,
  currentFlow: null,
  storedBooking: booking,
  bookingIsCurrent: true,
});
assert.equal(missingLiveFlowPlan.action, "revalidate", "a visible snapshot with a missing live flow must require a fresh cancellation check");
assert.equal(missingLiveFlowPlan.bookingRef, booking.ref);
assert.equal(synchronizedCancellationRenderState({
  state: cancellationState,
  flow: null,
  bookingRef: booking.ref,
  paused: false,
  stageVisible: true,
}), null, "stale React confirmation state must not render controls when the synchronous flow is missing");

const wrongFlowPlan = planPausedCancellationRestoration({
  snapshot: entry.snapshot,
  currentFlow: { ...finalFlow, bookingRef: "WLOTHER" },
  storedBooking: booking,
  bookingIsCurrent: true,
});
assert.equal(wrongFlowPlan.action, "booking_only", "a different active cancellation must never be dismissed to revive an old snapshot");
assert.equal(wrongFlowPlan.reason, "another_cancellation_active");
assert.equal(synchronizedCancellationRenderState({
  state: cancellationState,
  flow: { ...finalFlow, bookingRef: "WLOTHER" },
  bookingRef: booking.ref,
}), null);

const currentFlowPlan = planPausedCancellationRestoration({
  snapshot: entry.snapshot,
  currentFlow: finalFlow,
  storedBooking: booking,
  bookingIsCurrent: true,
  currentBooking: booking,
  currentBookingIsCurrent: true,
});
assert.equal(currentFlowPlan.action, "reuse_current");
assert.equal(planPausedCancellationRestoration({
  snapshot: entry.snapshot,
  currentFlow: finalFlow,
  storedBooking: booking,
  bookingIsCurrent: true,
  currentBooking: { ...booking, ref: "WLOTHER" },
  currentBookingIsCurrent: true,
}).action, "revalidate", "a matching flow with a different visible booking must pass through fresh provider revalidation instead of being reused");
const restored = restorePausedRichStage(model, {
  view: "cancellation",
  validation: { booking: true },
  sessionId: "session-1",
  journeyId: "journey-1",
  now: 3_000,
});
assert.equal(restored.plan.outcome, "ready");
assert.equal(restored.stage.booking.ref, booking.ref);
assert.equal(cancellationFlowMatchesBooking(finalFlow, restored.stage.booking.ref), true);
assert.equal(synchronizedCancellationRenderState({
  state: cancellationState,
  flow: finalFlow,
  bookingRef: restored.stage.booking.ref,
  paused: false,
  stageVisible: true,
}), cancellationState, "controls may render only after the restored booking, ref state, and flow phase agree");
assert.equal(synchronizedCancellationRenderState({
  state: { ...cancellationState, phase: "route_confirmation" },
  flow: finalFlow,
  bookingRef: booking.ref,
}), null, "a stale phase must fail closed even when its booking reference matches");
assert.equal(synchronizedCancellationRenderState({
  state: cancellationState,
  flow: finalFlow,
  bookingRef: booking.ref,
  paused: true,
}), null, "paused cancellation controls must remain hidden");

const reconciliationState = {
  phase: "error",
  bookingRef: null,
  outcomeUnknown: true,
  retryAllowed: false,
  dismissAllowed: false,
  journalStartedAt: 1_000,
};
assert.equal(synchronizedCancellationRenderState({
  state: reconciliationState,
  flow: reconciliationState,
  bookingRef: booking.ref,
}), reconciliationState, "a non-interactive global reconciliation warning must remain visible without exposing confirmation controls");

const cancelledPlan = planPausedCancellationRestoration({
  snapshot: entry.snapshot,
  currentFlow: null,
  storedBooking: { ...booking, cancelled: true },
  bookingIsCurrent: false,
});
assert.equal(cancelledPlan.action, "booking_only");
assert.equal(cancelledPlan.reason, "booking_not_current");

const providerOnlyPlan = planPausedCancellationRestoration({
  snapshot: entry.snapshot,
  currentFlow: finalFlow,
  storedBooking: null,
  bookingIsCurrent: false,
  currentBooking: { ...booking, verified: true },
  currentBookingIsCurrent: true,
});
assert.equal(providerOnlyPlan.action, "reuse_current", "an exact live provider booking may restore even when it is absent from device storage");

const conflictingSnapshot = {
  ...entry.snapshot,
  booking: { ...booking, ref: "WLOTHER" },
};
assert.equal(planPausedCancellationRestoration({
  snapshot: conflictingSnapshot,
  currentFlow: null,
  storedBooking: booking,
  bookingIsCurrent: true,
}).reason, "snapshot_flow_booking_mismatch", "a snapshot flow may never target a different visible booking");

const processingSnapshot = {
  ...entry.snapshot,
  pausedContext: {
    ...entry.snapshot.pausedContext,
    cancellationFlow: { ...finalFlow, phase: "processing" },
  },
};
assert.equal(planPausedCancellationRestoration({
  snapshot: processingSnapshot,
  currentFlow: null,
  storedBooking: booking,
  bookingIsCurrent: true,
}).action, "booking_only", "a lost processing state must never be restarted as a fresh destructive request");

const unknownErrorSnapshot = {
  ...entry.snapshot,
  pausedContext: {
    ...entry.snapshot.pausedContext,
    cancellationFlow: { ...finalFlow, phase: "error", outcomeUnknown: true },
  },
};
assert.equal(planPausedCancellationRestoration({
  snapshot: unknownErrorSnapshot,
  currentFlow: null,
  storedBooking: booking,
  bookingIsCurrent: true,
}).action, "booking_only", "an unknown provider outcome must never be reissued from a paused snapshot");

let timer = createCancellationConfirmationTimerState();
timer = armCancellationConfirmationTimerState(timer, {
  bookingRef: booking.ref,
  phase: "final_confirmation",
  now: 0,
});
const oldGeneration = timer.generation;
assert.equal(timer.expiresAt, CANCELLATION_CONFIRMATION_TTL_MS);
assert.equal(consumeCancellationConfirmationTimeout(timer, { generation: oldGeneration, now: 89_000 }).fire, false);
timer = suspendCancellationConfirmationTimerState(timer, {
  bookingRef: booking.ref,
  phase: "final_confirmation",
});
assert.equal(timer.status, "suspended");
assert.equal(timer.expiresAt, null, "pausing at 89 seconds must remove the old deadline entirely");
assert.equal(consumeCancellationConfirmationTimeout(timer, { generation: oldGeneration, now: 90_000 }).fire, false, "the pre-pause callback generation must be inert");
timer = resumeCancellationConfirmationTimerState(timer, {
  bookingRef: booking.ref,
  phase: "final_confirmation",
  now: 100_000,
});
assert.equal(timer.status, "armed");
assert.equal(timer.expiresAt, 100_000 + CANCELLATION_CONFIRMATION_TTL_MS, "a synchronized restore must receive a fresh full confirmation window");
assert.equal(consumeCancellationConfirmationTimeout(timer, { generation: timer.generation, now: timer.expiresAt - 1 }).fire, false);
assert.equal(consumeCancellationConfirmationTimeout(timer, { generation: timer.generation, now: timer.expiresAt }).fire, true);
timer = clearCancellationConfirmationTimerState(timer, "reset");
assert.equal(timer.status, "idle");
assert.equal(timer.bookingRef, null, "dismiss, completion, and reset must clear the suspended timer marker");

console.log("Validated behavioral paused-cancellation restoration, exact flow synchronization, safe revalidation, timer suspension and fresh rearm, cross-journey isolation, stale-control suppression, and destructive fail-closed cases.");
