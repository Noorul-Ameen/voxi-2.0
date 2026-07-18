export const VOICE_CANCELLATION_DECISION_TTL_MS = 90_000;

const confirmationPhases = new Set(["route_confirmation", "final_confirmation"]);
const bookingKey = (value) => String(value || "").trim().toUpperCase();

const isRetryableCancellationError = ({ phase, retryAllowed, dismissAllowed, outcomeUnknown } = {}) => (
  phase === "error"
  && retryAllowed !== false
  && dismissAllowed !== false
  && outcomeUnknown !== true
);

const cancellationDecisionContextKey = ({ bookingRef, phase, retryAllowed, dismissAllowed, outcomeUnknown } = {}) => {
  const normalizedBookingRef = bookingKey(bookingRef);
  if (!normalizedBookingRef) return null;
  if (confirmationPhases.has(phase)) return `${normalizedBookingRef}:${phase}`;
  if (isRetryableCancellationError({ phase, retryAllowed, dismissAllowed, outcomeUnknown })) {
    return `${normalizedBookingRef}:error:retryable`;
  }
  return null;
};

export function createVoiceCancellationDecisionState() {
  return {
    userTurn: 0,
    confirmationNonce: 0,
    confirmationKey: null,
    decisionSequence: 0,
    pending: null,
    disposition: null,
  };
}

export function invalidateVoiceCancellationDecision(state, reason = "invalidated") {
  if (!state?.pending) return state;
  return {
    ...state,
    pending: null,
    disposition: {
      status: "invalidated",
      reason,
      bookingRef: state.pending.bookingRef,
      phase: state.pending.phase,
      decisionNonce: state.pending.decisionNonce,
      expiresAt: state.pending.expiresAt,
    },
  };
}

export function advanceVoiceCancellationUserTurn(state) {
  const invalidated = invalidateVoiceCancellationDecision(state || createVoiceCancellationDecisionState(), "later_user_turn");
  return {
    ...invalidated,
    userTurn: Number(state?.userTurn || 0) + 1,
  };
}

export function syncVoiceCancellationConfirmation(state, flow = {}) {
  const current = state || createVoiceCancellationDecisionState();
  const key = cancellationDecisionContextKey(flow);
  if (key === current.confirmationKey) return current;
  const invalidated = invalidateVoiceCancellationDecision(current, "confirmation_changed");
  return {
    ...invalidated,
    confirmationKey: key,
    confirmationNonce: current.confirmationNonce + 1,
  };
}

export function captureVoiceCancellationDecision(state, {
  decision,
  bookingRef,
  phase,
  retryAllowed,
  dismissAllowed,
  outcomeUnknown,
  now = Date.now(),
} = {}) {
  const current = state || createVoiceCancellationDecisionState();
  if (typeof decision !== "boolean") {
    return { state: invalidateVoiceCancellationDecision(current, "decision_not_boolean"), pending: null, reason: "decision_not_boolean" };
  }
  if (phase === "error" && decision !== false) {
    return { state: invalidateVoiceCancellationDecision(current, "destructive_error_decision_rejected"), pending: null, reason: "destructive_error_decision_rejected" };
  }
  const contextKey = cancellationDecisionContextKey({ bookingRef, phase, retryAllowed, dismissAllowed, outcomeUnknown });
  if (phase === "error" && !contextKey) {
    return { state: invalidateVoiceCancellationDecision(current, "retryable_error_not_eligible"), pending: null, reason: "retryable_error_not_eligible" };
  }
  if (!contextKey || current.confirmationKey !== contextKey) {
    return { state: current, pending: null, reason: "confirmation_not_active" };
  }
  const decisionSequence = current.decisionSequence + 1;
  const pending = {
    decision,
    bookingRef: String(bookingRef).trim(),
    phase,
    confirmationKey: contextKey,
    userTurn: current.userTurn,
    confirmationNonce: current.confirmationNonce,
    decisionNonce: decisionSequence,
    capturedAt: now,
    expiresAt: now + VOICE_CANCELLATION_DECISION_TTL_MS,
  };
  return {
    state: { ...current, decisionSequence, pending, disposition: null },
    pending,
    reason: null,
  };
}

export function consumeVoiceCancellationDecision(state, {
  requestedRef,
  flowBookingRef,
  flowPhase,
  flowRetryAllowed,
  flowDismissAllowed,
  flowOutcomeUnknown,
  paused = false,
  now = Date.now(),
} = {}) {
  const current = state || createVoiceCancellationDecisionState();
  const pending = current.pending;
  if (paused) return { state: invalidateVoiceCancellationDecision(current, "cancellation_paused"), pending: null, reason: "cancellation_paused" };
  if (!pending) {
    const disposition = current.disposition;
    const dispositionReference = bookingKey(requestedRef || flowBookingRef);
    const dispositionMatches = disposition
      && dispositionReference
      && bookingKey(disposition.bookingRef) === dispositionReference
      && (!bookingKey(flowBookingRef) || bookingKey(disposition.bookingRef) === bookingKey(flowBookingRef))
      && (!flowPhase || disposition.phase === flowPhase)
      && (!disposition.expiresAt || now < disposition.expiresAt);
    if (dispositionMatches) return { state: current, pending: null, reason: `decision_${disposition.status}` };
    return { state: current, pending: null, reason: "no_pending_decision" };
  }
  if (now >= pending.expiresAt) return { state: invalidateVoiceCancellationDecision(current, "decision_expired"), pending: null, reason: "decision_expired" };
  if (pending.userTurn !== current.userTurn) return { state: invalidateVoiceCancellationDecision(current, "user_turn_changed"), pending: null, reason: "user_turn_changed" };
  if (pending.confirmationNonce !== current.confirmationNonce) return { state: invalidateVoiceCancellationDecision(current, "confirmation_changed"), pending: null, reason: "confirmation_changed" };
  const flowContextKey = cancellationDecisionContextKey({
    bookingRef: flowBookingRef,
    phase: flowPhase,
    retryAllowed: flowRetryAllowed,
    dismissAllowed: flowDismissAllowed,
    outcomeUnknown: flowOutcomeUnknown,
  });
  if (
    bookingKey(flowBookingRef) !== bookingKey(pending.bookingRef)
    || flowPhase !== pending.phase
    || pending.confirmationKey !== current.confirmationKey
    || flowContextKey !== pending.confirmationKey
  ) {
    return { state: invalidateVoiceCancellationDecision(current, "flow_changed"), pending: null, reason: "flow_changed" };
  }
  if (pending.phase === "error" && pending.decision !== false) {
    return { state: invalidateVoiceCancellationDecision(current, "destructive_error_decision_rejected"), pending: null, reason: "destructive_error_decision_rejected" };
  }
  if (!bookingKey(requestedRef)) return { state: current, pending: null, reason: "booking_ref_required" };
  if (bookingKey(requestedRef) !== bookingKey(pending.bookingRef)) return { state: current, pending: null, reason: "booking_ref_mismatch" };
  return {
    state: {
      ...current,
      pending: null,
      disposition: {
        status: "consumed",
        reason: "decision_consumed",
        bookingRef: pending.bookingRef,
        phase: pending.phase,
        decisionNonce: pending.decisionNonce,
        expiresAt: pending.expiresAt,
      },
    },
    pending,
    reason: null,
  };
}

export function cancellationDecisionOutputOwner({ source } = {}) {
  return source === "voice_tool" ? "tool" : "local";
}

export function cancellationCompletionOutputOwner({ source, isDemoSimulation } = {}) {
  if (source === "voice_tool") return "tool";
  if (source === "ui" && !isDemoSimulation) return "agent";
  return "local";
}

export function buildCancellationCompletionMessage({
  locale = "en",
  isDemoSimulation = false,
  storagePersisted = true,
  bookingRef,
  refundReference,
} = {}) {
  if (isDemoSimulation) {
    return locale === "ar"
      ? "تم تسجيل الحجز كملغى على هذا الجهاز فقط. لم تتم معالجة أي استرداد مالي."
      : "The booking is marked cancelled on this device only. No refund was processed.";
  }
  if (!storagePersisted) {
    return locale === "ar"
      ? `تم تأكيد الاسترداد بالمرجع ${refundReference}، لكن تعذر حفظ حالة الإلغاء على هذا الجهاز. تحقق من الحالة عبر خدمة إدارة الحجز الرسمية من VOX.`
      : `The live refund was confirmed with reference ${refundReference}, but the cancelled status could not be saved on this device. Check the status in the official VOX Manage Booking service.`;
  }
  return locale === "ar"
    ? `تم إلغاء الحجز ${bookingRef}. تمت معالجة الاسترداد إلى محفظة VOX بالمرجع ${refundReference}.`
    : `Booking ${bookingRef} was cancelled. The refund was processed to VOX Wallet with reference ${refundReference}.`;
}
