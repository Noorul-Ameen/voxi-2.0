/**
 * Immutable storage for rich panels that are hidden while the conversation
 * temporarily moves to another topic.
 *
 * This module deliberately contains no React or transport dependencies. The
 * application owns intent classification and rendering. This helper owns a
 * safe snapshot, restoration ordering, expiry, and invalidation rules.
 */

export const RICH_JOURNEY_VIEWS = Object.freeze([
  "movies",
  "showtimes",
  "seatmap",
  "checkout",
  "history",
  "booking",
  "cancellation",
]);

export const RESTORE_PRIORITY = Object.freeze({
  checkout: 700,
  cancellation: 650,
  seatmap: 600,
  showtimes: 500,
  movies: 400,
  booking: 300,
  history: 200,
});

const NO_REVALIDATION = Object.freeze({
  requiresSessionRevalidation: false,
  requiresAvailabilityRevalidation: false,
  requiresPricingRevalidation: false,
  requiresBookingRevalidation: false,
});

export const RESTORE_POLICY = Object.freeze({
  movies: NO_REVALIDATION,
  showtimes: Object.freeze({
    ...NO_REVALIDATION,
    requiresSessionRevalidation: true,
  }),
  seatmap: Object.freeze({
    ...NO_REVALIDATION,
    requiresSessionRevalidation: true,
    requiresAvailabilityRevalidation: true,
  }),
  checkout: Object.freeze({
    ...NO_REVALIDATION,
    requiresSessionRevalidation: true,
    requiresAvailabilityRevalidation: true,
    requiresPricingRevalidation: true,
  }),
  history: Object.freeze({
    ...NO_REVALIDATION,
    requiresBookingRevalidation: true,
  }),
  booking: Object.freeze({
    ...NO_REVALIDATION,
    requiresBookingRevalidation: true,
  }),
  cancellation: Object.freeze({
    ...NO_REVALIDATION,
    requiresBookingRevalidation: true,
  }),
});

export const INVALIDATION_SCOPE_VIEWS = Object.freeze({
  all: RICH_JOURNEY_VIEWS,
  booking_journey: Object.freeze(["movies", "showtimes", "seatmap", "checkout"]),
  records_journey: Object.freeze(["history", "booking", "cancellation"]),
  cinema: Object.freeze(["movies", "showtimes", "seatmap", "checkout"]),
  date: Object.freeze(["movies", "showtimes", "seatmap", "checkout"]),
  time: Object.freeze(["movies", "showtimes", "seatmap", "checkout"]),
  movie: Object.freeze(["showtimes", "seatmap", "checkout"]),
  experience: Object.freeze(["movies", "showtimes", "seatmap", "checkout"]),
  session: Object.freeze(["showtimes", "seatmap", "checkout"]),
  seats: Object.freeze(["seatmap", "checkout"]),
  pricing: Object.freeze(["checkout"]),
  booking_records: Object.freeze(["history", "booking", "cancellation"]),
  cancellation: Object.freeze(["cancellation"]),
});

const VIEW_ALIASES = Object.freeze({
  movie: "movies",
  movies: "movies",
  movie_list: "movies",
  movie_listing: "movies",
  showtime: "showtimes",
  showtimes: "showtimes",
  session: "showtimes",
  sessions: "showtimes",
  seat: "seatmap",
  seats: "seatmap",
  seat_map: "seatmap",
  seatmap: "seatmap",
  checkout: "checkout",
  payment: "checkout",
  history: "history",
  booking_history: "history",
  booking: "booking",
  confirmation: "booking",
  booking_confirmation: "booking",
  cancel: "cancellation",
  cancellation: "cancellation",
  cancellation_confirmation: "cancellation",
});

const REVALIDATION_KEYS = Object.freeze([
  ["requiresSessionRevalidation", "session"],
  ["requiresAvailabilityRevalidation", "availability"],
  ["requiresPricingRevalidation", "pricing"],
  ["requiresBookingRevalidation", "booking"],
]);

function cloneValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (Array.isArray(value)) {
    const clone = [];
    seen.set(value, clone);
    for (const item of value) clone.push(cloneValue(item, seen));
    return clone;
  }
  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    for (const [key, item] of value) clone.set(cloneValue(key, seen), cloneValue(item, seen));
    return clone;
  }
  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    for (const item of value) clone.add(cloneValue(item, seen));
    return clone;
  }
  const clone = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  seen.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    if (Object.prototype.propertyIsEnumerable.call(value, key)) clone[key] = cloneValue(value[key], seen);
  }
  return clone;
}
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key, seen);
      deepFreeze(item, seen);
    }
  } else if (value instanceof Set) {
    for (const item of value) deepFreeze(item, seen);
  } else {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  }
  return Object.freeze(value);
}

const snapshotClone = (value) => cloneValue(value);
const immutable = (value) => deepFreeze(value);

function toIso(value, fallback = Date.now()) {
  const instant = value === undefined || value === null ? fallback : value;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid event time is required.");
  return date.toISOString();
}

function expiryIso(value) {
  if (value === undefined || value === null || value === "") return null;
  return toIso(value);
}

function eventRecord(type, at, reason, details = {}) {
  return {
    type,
    at: toIso(at),
    reason: reason || null,
    ...details,
  };
}

function baseEntries(model) {
  return model?.entries && typeof model.entries === "object" ? model.entries : {};
}

function terminalModel(model, status, type, { now, reason } = {}) {
  return immutable({
    ...model,
    status,
    activeView: null,
    resumeView: null,
    entries: {},
    sequence: Number(model?.sequence || 0) + 1,
    lastRestore: null,
    lastEvent: eventRecord(type, now, reason),
  });
}

export function normalizeRichJourneyView(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return VIEW_ALIASES[normalized] || null;
}

export function richJourneyViewFromStage(stage) {
  const view = normalizeRichJourneyView(stage?.view || stage?.type);
  const purpose = String(stage?.purpose || stage?.mode || "").toLowerCase();
  if ((view === "history" || view === "booking") && /cancel/.test(purpose)) return "cancellation";
  return view;
}

export function isRichJourneyStage(stageOrView) {
  return typeof stageOrView === "object"
    ? Boolean(richJourneyViewFromStage(stageOrView))
    : Boolean(normalizeRichJourneyView(stageOrView));
}

export function createPausedRichJourney({
  sessionId = null,
  journeyId = null,
  expiresAt = null,
  now,
} = {}) {
  return immutable({
    schemaVersion: "1.0",
    sessionId: sessionId === null ? null : String(sessionId),
    journeyId: journeyId === null ? null : String(journeyId),
    previousJourneyId: null,
    status: "empty",
    activeView: null,
    resumeView: null,
    entries: {},
    sequence: 0,
    expiresAt: expiryIso(expiresAt),
    lastRestore: null,
    lastEvent: eventRecord("created", now, null),
  });
}

export function capturePausedRichStage(model, stage, {
  now,
  sessionId = model?.sessionId ?? null,
  journeyId = model?.journeyId ?? null,
  contextVersion = null,
} = {}) {
  if (!stage || typeof stage !== "object") throw new TypeError("A rich stage object is required.");
  const view = richJourneyViewFromStage(stage);
  if (!view) throw new TypeError(`Unsupported rich stage view: ${String(stage.view || stage.type || "unknown")}`);
  const capturedAt = toIso(now);
  const entry = immutable({
    view,
    sourceView: String(stage.view || stage.type || view),
    snapshot: snapshotClone(stage),
    capturedAt,
    hiddenAt: null,
    restoredAt: null,
    invalidatedAt: null,
    invalidationReason: null,
    restorable: true,
    priority: RESTORE_PRIORITY[view],
    restorePolicy: RESTORE_POLICY[view],
    sessionId: sessionId === null ? null : String(sessionId),
    journeyId: journeyId === null ? null : String(journeyId),
    contextVersion: contextVersion === null ? null : String(contextVersion),
    sequence: Number(model?.sequence || 0) + 1,
  });
  return immutable({
    ...model,
    sessionId: sessionId === null ? null : String(sessionId),
    journeyId: journeyId === null ? null : String(journeyId),
    status: "visible",
    activeView: view,
    resumeView: view,
    entries: { ...baseEntries(model), [view]: entry },
    sequence: entry.sequence,
    lastRestore: null,
    lastEvent: eventRecord("captured", capturedAt, null, { view }),
  });
}

export function hidePausedRichStage(model, { now, reason = "topic_change" } = {}) {
  const activeView = normalizeRichJourneyView(model?.activeView);
  if (!activeView || !baseEntries(model)[activeView]?.restorable) return model;
  const hiddenAt = toIso(now);
  const entry = immutable({ ...baseEntries(model)[activeView], hiddenAt });
  return immutable({
    ...model,
    status: "paused",
    activeView: null,
    resumeView: activeView,
    entries: { ...baseEntries(model), [activeView]: entry },
    sequence: Number(model?.sequence || 0) + 1,
    lastRestore: null,
    lastEvent: eventRecord("hidden", hiddenAt, reason, { view: activeView }),
  });
}

function validEntry(model, view) {
  const entry = baseEntries(model)[view];
  return entry?.restorable && entry.snapshot ? entry : null;
}

export function selectRestorableRichStage(model, { view } = {}) {
  const requestedView = normalizeRichJourneyView(view);
  if (view && !requestedView) return null;
  if (requestedView) {
    const entry = validEntry(model, requestedView);
    return entry ? snapshotClone(entry) : null;
  }
  const resumeView = normalizeRichJourneyView(model?.resumeView);
  if (resumeView) {
    const entry = validEntry(model, resumeView);
    if (entry) return snapshotClone(entry);
  }
  const candidates = Object.values(baseEntries(model))
    .filter((entry) => entry?.restorable && entry.snapshot)
    .sort((a, b) => (b.priority - a.priority)
      || (b.sequence - a.sequence)
      || String(b.capturedAt).localeCompare(String(a.capturedAt)));
  return candidates[0] ? snapshotClone(candidates[0]) : null;
}

export function isPausedRichJourneyExpired(model, now = Date.now()) {
  if (!model?.expiresAt) return false;
  const expiresAt = new Date(model.expiresAt).getTime();
  const at = new Date(now).getTime();
  return Number.isFinite(expiresAt) && Number.isFinite(at) && at >= expiresAt;
}

export function planPausedRichRestore(model, {
  view,
  now,
  sessionId = model?.sessionId ?? null,
  journeyId = model?.journeyId ?? null,
  validation = {},
} = {}) {
  if (isPausedRichJourneyExpired(model, now)) {
    return immutable({ outcome: "session_expired", view: null, stage: null, requirements: [], missing: [], failed: [] });
  }
  const entry = selectRestorableRichStage(model, { view });
  if (!entry) return immutable({ outcome: "nothing_to_restore", view: null, stage: null, requirements: [], missing: [], failed: [] });
  if (entry.sessionId !== null && sessionId !== null && String(sessionId) !== entry.sessionId) {
    return immutable({ outcome: "identity_mismatch", view: entry.view, stage: null, requirements: [], missing: [], failed: [] });
  }
  if (entry.journeyId !== null && journeyId !== null && String(journeyId) !== entry.journeyId) {
    return immutable({ outcome: "identity_mismatch", view: entry.view, stage: null, requirements: [], missing: [], failed: [] });
  }
  const requirements = REVALIDATION_KEYS
    .filter(([policyKey]) => entry.restorePolicy[policyKey])
    .map(([, validationKey]) => validationKey);
  const missing = requirements.filter((key) => validation[key] !== true && validation[key] !== false);
  const failed = requirements.filter((key) => validation[key] === false);
  const outcome = failed.length
    ? "revalidation_failed"
    : missing.length
      ? "revalidation_required"
      : "ready";
  return immutable({
    outcome,
    view: entry.view,
    stage: outcome === "ready" ? snapshotClone(entry.snapshot) : null,
    requirements,
    missing,
    failed,
    policy: snapshotClone(entry.restorePolicy),
    capturedAt: entry.capturedAt,
    contextVersion: entry.contextVersion,
  });
}

export function restorePausedRichStage(model, options = {}) {
  const plan = planPausedRichRestore(model, options);
  const restoredAt = toIso(options.now);
  if (plan.outcome === "session_expired") {
    return immutable({
      model: expirePausedRichJourney(model, { now: restoredAt, reason: "restore_after_expiry" }),
      stage: null,
      plan,
    });
  }
  if (plan.outcome === "revalidation_failed") {
    return immutable({
      model: invalidatePausedRichStage(model, {
        views: [plan.view],
        now: restoredAt,
        reason: `revalidation_failed:${plan.failed.join(",")}`,
      }),
      stage: null,
      plan,
    });
  }
  if (plan.outcome !== "ready") return immutable({ model, stage: null, plan });
  const currentEntry = baseEntries(model)[plan.view];
  const restoredEntry = immutable({ ...currentEntry, restoredAt, hiddenAt: null });
  const nextModel = immutable({
    ...model,
    status: "visible",
    activeView: plan.view,
    resumeView: plan.view,
    entries: { ...baseEntries(model), [plan.view]: restoredEntry },
    sequence: Number(model?.sequence || 0) + 1,
    lastRestore: { view: plan.view, at: restoredAt, contextVersion: currentEntry.contextVersion },
    lastEvent: eventRecord("restored", restoredAt, null, { view: plan.view }),
  });
  return immutable({ model: nextModel, stage: snapshotClone(plan.stage), plan });
}

function scopeViews({ views, scope }, activeView) {
  const requested = views === undefined || views === null
    ? []
    : Array.isArray(views) ? views : [views];
  const explicit = requested.map(normalizeRichJourneyView).filter(Boolean);
  const scoped = scope ? INVALIDATION_SCOPE_VIEWS[String(scope).toLowerCase()] : null;
  if (explicit.length || scoped?.length) return [...new Set([...explicit, ...(scoped || [])])];
  const active = normalizeRichJourneyView(activeView);
  return active ? [active] : [];
}

export function invalidatePausedRichStage(model, {
  views,
  scope,
  now,
  reason = "context_changed",
} = {}) {
  const invalidatedAt = toIso(now);
  const affected = scopeViews({ views, scope }, model?.activeView)
    .filter((view) => baseEntries(model)[view]);
  if (!affected.length) return model;
  const entries = { ...baseEntries(model) };
  for (const view of affected) {
    entries[view] = immutable({
      ...entries[view],
      snapshot: null,
      restorable: false,
      invalidatedAt,
      invalidationReason: reason,
    });
  }
  const activeWasInvalidated = affected.includes(normalizeRichJourneyView(model?.activeView));
  const resumeWasInvalidated = affected.includes(normalizeRichJourneyView(model?.resumeView));
  const candidateModel = { ...model, entries, resumeView: resumeWasInvalidated ? null : model?.resumeView };
  const fallback = selectRestorableRichStage(candidateModel);
  const hasRestorable = Object.values(entries).some((entry) => entry?.restorable && entry.snapshot);
  return immutable({
    ...model,
    status: activeWasInvalidated ? (hasRestorable ? "paused" : "invalidated") : model.status,
    activeView: activeWasInvalidated ? null : model.activeView,
    resumeView: resumeWasInvalidated ? fallback?.view || null : model.resumeView,
    entries,
    sequence: Number(model?.sequence || 0) + 1,
    lastRestore: null,
    lastEvent: eventRecord("invalidated", invalidatedAt, reason, { views: affected }),
  });
}

export function completePausedRichJourney(model, { now, reason = "booking_completed" } = {}) {
  return terminalModel(model, "completed", "completed", { now, reason });
}

export function cancelPausedRichJourney(model, { now, reason = "explicit_customer_cancel" } = {}) {
  return terminalModel(model, "cancelled", "explicit_cancel", { now, reason });
}

export function expirePausedRichJourney(model, { now, reason = "session_expired" } = {}) {
  return terminalModel(model, "expired", "session_expired", { now, reason });
}

export function endPausedRichJourney(model, { now, reason = "conversation_ended" } = {}) {
  return terminalModel(model, "ended", "conversation_end", { now, reason });
}

export function replacePausedRichJourney(model, {
  sessionId = model?.sessionId ?? null,
  journeyId,
  expiresAt = model?.expiresAt ?? null,
  stage = null,
  contextVersion = null,
  now,
  reason = "new_booking_started",
} = {}) {
  const replacedAt = toIso(now);
  const previousJourneyId = model?.journeyId ?? null;
  let next = createPausedRichJourney({ sessionId, journeyId, expiresAt, now: replacedAt });
  if (stage) next = capturePausedRichStage(next, stage, { now: replacedAt, sessionId, journeyId, contextVersion });
  return immutable({
    ...next,
    previousJourneyId,
    status: stage ? "visible" : "replaced",
    lastEvent: eventRecord("booking_replaced", replacedAt, reason, {
      previousJourneyId,
      journeyId: journeyId === null || journeyId === undefined ? null : String(journeyId),
      initialView: stage ? richJourneyViewFromStage(stage) : null,
    }),
  });
}

export function visiblePausedRichStage(model) {
  const activeView = normalizeRichJourneyView(model?.activeView);
  const entry = activeView ? validEntry(model, activeView) : null;
  return entry ? snapshotClone(entry.snapshot) : null;
}

export function pausedRichJourneyReducer(model, event = {}) {
  const current = model || createPausedRichJourney();
  switch (String(event.type || "").toUpperCase()) {
    case "CAPTURE":
      return capturePausedRichStage(current, event.stage, event);
    case "HIDE":
      return hidePausedRichStage(current, event);
    case "RESTORE":
      return restorePausedRichStage(current, event).model;
    case "INVALIDATE":
      return invalidatePausedRichStage(current, event);
    case "COMPLETE":
      return completePausedRichJourney(current, event);
    case "EXPLICIT_CANCEL":
      return cancelPausedRichJourney(current, event);
    case "SESSION_EXPIRED":
      return expirePausedRichJourney(current, event);
    case "CONVERSATION_END":
      return endPausedRichJourney(current, event);
    case "REPLACE_BOOKING":
      return replacePausedRichJourney(current, event);
    default:
      return current;
  }
}
