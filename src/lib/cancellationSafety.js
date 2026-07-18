export const CANCELLATION_JOURNAL_TTL_MS = 10 * 60 * 1000;
export const CANCELLATION_WEB_LOCK_NAME = "voxi-provider-cancellation-v1";

const DEFINITIVE_REFUND_FAILURE_CODES = new Set([
  "INVALID_ARGUMENT",
  "REFUND_INELIGIBLE",
  "CAPABILITY_UNAVAILABLE",
  "REFUND_REJECTED",
]);

export function normalizeCancellationJournal(entry) {
  const token = String(entry?.token || "").trim();
  const startedAt = Number(entry?.startedAt);
  if (!token || !Number.isFinite(startedAt)) return null;
  return {
    token,
    startedAt,
    state: entry?.state === "reconciliation_required" ? "reconciliation_required" : "pending",
  };
}

export function hydrateCancellationJournal(entry, now = Date.now()) {
  const normalized = normalizeCancellationJournal(entry);
  if (!normalized) return null;
  return {
    ...normalized,
    orphaned: normalized.state === "reconciliation_required"
      || now - normalized.startedAt >= CANCELLATION_JOURNAL_TTL_MS,
  };
}

export function classifyRefundFailure(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  return DEFINITIVE_REFUND_FAILURE_CODES.has(code) ? "definitive" : "ambiguous";
}

export async function withCancellationMutationLock(lockManager, callback) {
  if (!lockManager?.request) {
    return { acquired: false, reason: "cross_tab_lock_unavailable", result: null };
  }
  let callbackStarted = false;
  try {
    return await lockManager.request(
      CANCELLATION_WEB_LOCK_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) return { acquired: false, reason: "cross_tab_mutation_in_progress", result: null };
        callbackStarted = true;
        return { acquired: true, reason: null, result: await callback() };
      },
    );
  } catch (error) {
    if (callbackStarted) throw error;
    return { acquired: false, reason: "cross_tab_lock_unavailable", result: null };
  }
}
