export const CANCELLATION_CONFIRMATION_TTL_MS = 90_000;

const bookingKey = (value) => String(value || "").trim().toUpperCase();
const confirmationPhase = (value) => ["route_confirmation", "final_confirmation"].includes(String(value || ""));

export function createCancellationConfirmationTimerState() {
  return {
    status: "idle",
    generation: 0,
    bookingRef: null,
    phase: null,
    expiresAt: null,
    reason: null,
  };
}

export function clearCancellationConfirmationTimerState(state, reason = "cleared") {
  const current = state || createCancellationConfirmationTimerState();
  return {
    ...current,
    status: "idle",
    generation: current.generation + 1,
    bookingRef: null,
    phase: null,
    expiresAt: null,
    reason,
  };
}

export function armCancellationConfirmationTimerState(state, { bookingRef, phase, now = Date.now() } = {}) {
  const current = state || createCancellationConfirmationTimerState();
  if (!bookingKey(bookingRef) || !confirmationPhase(phase)) {
    return clearCancellationConfirmationTimerState(current, "confirmation_context_invalid");
  }
  return {
    ...current,
    status: "armed",
    generation: current.generation + 1,
    bookingRef: String(bookingRef).trim(),
    phase,
    expiresAt: now + CANCELLATION_CONFIRMATION_TTL_MS,
    reason: null,
  };
}

export function suspendCancellationConfirmationTimerState(state, { bookingRef, phase } = {}) {
  const current = state || createCancellationConfirmationTimerState();
  const contextMatches = bookingKey(current.bookingRef) === bookingKey(bookingRef)
    && current.phase === phase
    && current.status === "armed";
  if (!contextMatches) return clearCancellationConfirmationTimerState(current, "pause_context_mismatch");
  return {
    ...current,
    status: "suspended",
    generation: current.generation + 1,
    expiresAt: null,
    reason: "paused",
  };
}

export function resumeCancellationConfirmationTimerState(state, { bookingRef, phase, now = Date.now() } = {}) {
  const current = state || createCancellationConfirmationTimerState();
  const contextMatches = current.status === "suspended"
    && bookingKey(current.bookingRef) === bookingKey(bookingRef)
    && current.phase === phase;
  if (!contextMatches) return clearCancellationConfirmationTimerState(current, "resume_context_mismatch");
  return armCancellationConfirmationTimerState(current, { bookingRef, phase, now });
}

export function consumeCancellationConfirmationTimeout(state, { generation, now = Date.now() } = {}) {
  const current = state || createCancellationConfirmationTimerState();
  const fire = current.status === "armed"
    && current.generation === generation
    && Number.isFinite(current.expiresAt)
    && now >= current.expiresAt;
  return {
    fire,
    state: fire ? clearCancellationConfirmationTimerState(current, "confirmation_timeout") : current,
  };
}
