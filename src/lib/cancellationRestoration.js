const ACTIVE_CANCELLATION_PHASES = new Set([
  "checking",
  "route_confirmation",
  "final_confirmation",
  "processing",
  "error",
]);

const REVALIDATABLE_CANCELLATION_PHASES = new Set([
  "checking",
  "route_confirmation",
  "final_confirmation",
  "error",
]);

const bookingKey = (value) => String(value || "").trim().toUpperCase();

const normalizedPhase = (value) => ({
  checking_eligibility: "checking",
  route: "route_confirmation",
  final: "final_confirmation",
  in_flight: "processing",
})[String(value || "")] || String(value || "");

export function cancellationFlowMatchesBooking(flow, bookingRef) {
  return Boolean(
    bookingKey(bookingRef)
    && bookingKey(flow?.bookingRef) === bookingKey(bookingRef)
    && ACTIVE_CANCELLATION_PHASES.has(normalizedPhase(flow?.phase)),
  );
}

export function planPausedCancellationRestoration({
  snapshot,
  currentFlow,
  storedBooking,
  bookingIsCurrent,
  currentBooking,
  currentBookingIsCurrent,
} = {}) {
  const snapshotFlow = snapshot?.pausedContext?.cancellationFlow || null;
  const snapshotFlowRef = snapshotFlow?.bookingRef || null;
  const visibleBookingRef = snapshot?.booking?.ref || snapshot?.pausedContext?.booking?.ref || null;
  const bookingRef = visibleBookingRef || snapshotFlowRef || null;
  const failClosed = (reason) => ({ action: "booking_only", reason, bookingRef, flow: null });

  if (!bookingKey(bookingRef)) return failClosed("booking_reference_missing");
  if (snapshotFlowRef && visibleBookingRef && bookingKey(snapshotFlowRef) !== bookingKey(visibleBookingRef)) {
    return failClosed("snapshot_flow_booking_mismatch");
  }
  if (currentFlow?.bookingRef && bookingKey(currentFlow.bookingRef) !== bookingKey(bookingRef)) {
    return failClosed("another_cancellation_active");
  }
  const storedMatches = storedBooking && bookingKey(storedBooking.ref) === bookingKey(bookingRef);
  const currentMatches = currentBooking && bookingKey(currentBooking.ref) === bookingKey(bookingRef);
  const bookingEvidence = storedMatches ? storedBooking : currentMatches ? currentBooking : null;
  const evidenceIsCurrent = storedMatches ? bookingIsCurrent === true : currentBookingIsCurrent === true;
  if (!bookingEvidence) return failClosed("booking_evidence_missing");
  if (bookingEvidence.cancelled || !evidenceIsCurrent) return failClosed("booking_not_current");

  if (
    cancellationFlowMatchesBooking(currentFlow, bookingRef)
    && currentMatches
    && currentBookingIsCurrent === true
    && currentBooking.cancelled !== true
  ) {
    return {
      action: "reuse_current",
      reason: "active_flow_synchronized",
      bookingRef,
      flow: currentFlow,
    };
  }

  if (!cancellationFlowMatchesBooking(snapshotFlow, bookingRef)) return failClosed("snapshot_flow_missing_or_stale");
  const snapshotPhase = normalizedPhase(snapshotFlow.phase);
  if (snapshotPhase === "processing" || snapshotFlow.outcomeUnknown === true) {
    return failClosed("unsafe_cancellation_state");
  }
  if (!REVALIDATABLE_CANCELLATION_PHASES.has(snapshotPhase)) return failClosed("snapshot_phase_not_revalidatable");

  return {
    action: "revalidate",
    reason: "fresh_cancellation_check_required",
    bookingRef,
    flow: snapshotFlow,
  };
}

export function synchronizedCancellationRenderState({
  state,
  flow,
  bookingRef,
  paused = false,
  stageVisible = true,
} = {}) {
  if (paused || !stageVisible) return null;
  const globalReconciliationState = !bookingKey(flow?.bookingRef)
    && !bookingKey(state?.bookingRef)
    && normalizedPhase(flow?.phase) === "error"
    && normalizedPhase(state?.phase) === "error"
    && flow?.outcomeUnknown === true
    && state?.outcomeUnknown === true
    && flow?.retryAllowed === false
    && flow?.dismissAllowed === false;
  if (globalReconciliationState) return state;
  if (!cancellationFlowMatchesBooking(flow, bookingRef)) return null;
  if (!state || bookingKey(state.bookingRef) !== bookingKey(bookingRef)) return null;
  if (normalizedPhase(state.phase) !== normalizedPhase(flow.phase)) return null;
  return state;
}
