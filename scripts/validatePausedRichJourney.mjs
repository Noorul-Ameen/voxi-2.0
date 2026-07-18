import assert from "node:assert/strict";
import {
  INVALIDATION_SCOPE_VIEWS,
  RESTORE_POLICY,
  RESTORE_PRIORITY,
  RICH_JOURNEY_VIEWS,
  cancelPausedRichJourney,
  capturePausedRichStage,
  completePausedRichJourney,
  createPausedRichJourney,
  endPausedRichJourney,
  expirePausedRichJourney,
  hidePausedRichStage,
  invalidatePausedRichStage,
  isPausedRichJourneyExpired,
  planPausedRichRestore,
  replacePausedRichJourney,
  restorePausedRichStage,
  richJourneyViewFromStage,
  selectRestorableRichStage,
  visiblePausedRichStage,
} from "../src/lib/pausedRichJourney.js";

const times = {
  start: "2026-07-17T08:00:00.000Z",
  hidden: "2026-07-17T08:01:00.000Z",
  restored: "2026-07-17T08:02:00.000Z",
  terminal: "2026-07-17T08:03:00.000Z",
  expiry: "2026-07-17T09:00:00.000Z",
};

const stages = {
  movies: { view: "movies", movies: [{ id: "m1", title: "Movie One" }], preferences: { cinemaId: "c1" } },
  showtimes: { view: "showtimes", movie: { id: "m1", title: "Movie One" }, sessions: [{ id: "s1", time: "18:00" }] },
  seatmap: { view: "seatmap", session: { id: "s1" }, selectedSeats: ["E1", "E2"], pricing: { total: 84 } },
  checkout: { view: "checkout", order: { checkoutId: "co1", sessionId: "s1", seats: ["E1", "E2"], total: 84 } },
  history: { view: "history", bookings: [{ ref: "VOX1", movieTitle: "Movie One" }] },
  booking: { view: "booking", booking: { ref: "VOX1", movieTitle: "Movie One" } },
  cancellation: { view: "history", purpose: "cancellation_target_selection", candidateRefs: ["VOX1"] },
};

const validationFor = (view) => ({
  session: ["showtimes", "seatmap", "checkout"].includes(view),
  availability: ["seatmap", "checkout"].includes(view),
  pricing: view === "checkout",
  booking: ["history", "booking", "cancellation"].includes(view),
});

assert.deepEqual(Object.keys(RESTORE_PRIORITY).sort(), [...RICH_JOURNEY_VIEWS].sort(), "every rich view needs a restoration priority");
assert.deepEqual(Object.keys(RESTORE_POLICY).sort(), [...RICH_JOURNEY_VIEWS].sort(), "every rich view needs a restoration policy");
assert.ok(RESTORE_PRIORITY.checkout > RESTORE_PRIORITY.seatmap, "checkout must outrank the earlier seat stage");
assert.ok(RESTORE_PRIORITY.seatmap > RESTORE_PRIORITY.showtimes, "seat selection must outrank showtimes");
assert.ok(RESTORE_POLICY.checkout.requiresSessionRevalidation, "checkout restoration must revalidate its session");
assert.ok(RESTORE_POLICY.checkout.requiresAvailabilityRevalidation, "checkout restoration must revalidate availability");
assert.ok(RESTORE_POLICY.checkout.requiresPricingRevalidation, "checkout restoration must revalidate pricing");
assert.deepEqual(INVALIDATION_SCOPE_VIEWS.pricing, ["checkout"], "a pricing change must invalidate checkout only");
assert.equal(richJourneyViewFromStage(stages.cancellation), "cancellation", "a cancellation history stage needs its own restoration slot");

for (const view of RICH_JOURNEY_VIEWS) {
  const original = structuredClone(stages[view]);
  let model = createPausedRichJourney({
    sessionId: "session-1",
    journeyId: "journey-1",
    expiresAt: times.expiry,
    now: times.start,
  });
  model = capturePausedRichStage(model, original, { now: times.start, contextVersion: "data-v1" });
  assert.equal(model.activeView, view, `${view}: capture must make only that rich stage visible`);
  assert.deepEqual(visiblePausedRichStage(model), original, `${view}: capture must preserve the complete snapshot`);

  model = hidePausedRichStage(model, { now: times.hidden, reason: "general_enquiry" });
  assert.equal(model.activeView, null, `${view}: a topic change must hide stale rendering immediately`);
  assert.equal(visiblePausedRichStage(model), null, `${view}: hidden rendering must not remain visible`);
  assert.equal(model.resumeView, view, `${view}: the hidden stage must be the default resume target`);

  const initialPlan = planPausedRichRestore(model, { now: times.restored });
  const expectedRequirements = Object.entries(RESTORE_POLICY[view])
    .filter(([, required]) => required)
    .map(([key]) => ({
      requiresSessionRevalidation: "session",
      requiresAvailabilityRevalidation: "availability",
      requiresPricingRevalidation: "pricing",
      requiresBookingRevalidation: "booking",
    })[key]);
  assert.deepEqual(initialPlan.requirements, expectedRequirements, `${view}: restore plan must expose its revalidation contract`);
  assert.equal(
    initialPlan.outcome,
    expectedRequirements.length ? "revalidation_required" : "ready",
    `${view}: unvalidated restore must never bypass its policy`,
  );

  const restored = restorePausedRichStage(model, {
    now: times.restored,
    validation: validationFor(view),
  });
  assert.equal(restored.plan.outcome, "ready", `${view}: valid current data must allow restoration`);
  assert.equal(restored.model.activeView, view, `${view}: restore must reopen the correct rich stage`);
  assert.deepEqual(restored.stage, original, `${view}: restore must return the saved rendering input`);
}

const mutableStage = structuredClone(stages.checkout);
let immutableModel = createPausedRichJourney({ sessionId: "s", journeyId: "j", now: times.start });
immutableModel = capturePausedRichStage(immutableModel, mutableStage, { now: times.start });
mutableStage.order.seats.push("E3");
mutableStage.order.total = 126;
assert.deepEqual(selectRestorableRichStage(immutableModel, { view: "checkout" }).snapshot.order.seats, ["E1", "E2"], "caller mutation must not change a captured snapshot");
const exposed = selectRestorableRichStage(immutableModel, { view: "checkout" });
exposed.snapshot.order.seats.push("E4");
assert.deepEqual(selectRestorableRichStage(immutableModel, { view: "checkout" }).snapshot.order.seats, ["E1", "E2"], "selector results must not mutate stored snapshots");

let priorityModel = createPausedRichJourney({ sessionId: "s", journeyId: "j", now: times.start });
priorityModel = capturePausedRichStage(priorityModel, stages.movies, { now: times.start });
priorityModel = capturePausedRichStage(priorityModel, stages.showtimes, { now: "2026-07-17T08:00:10.000Z" });
priorityModel = capturePausedRichStage(priorityModel, stages.seatmap, { now: "2026-07-17T08:00:20.000Z" });
priorityModel = capturePausedRichStage(priorityModel, stages.checkout, { now: "2026-07-17T08:00:30.000Z" });
priorityModel = hidePausedRichStage(priorityModel, { now: times.hidden });
assert.equal(selectRestorableRichStage(priorityModel).view, "checkout", "generic continue must prefer the most relevant hidden stage");
assert.equal(selectRestorableRichStage(priorityModel, { view: "showtimes" }).view, "showtimes", "an explicit showtime request must override generic priority");

const missingCheckout = planPausedRichRestore(priorityModel, {
  view: "checkout",
  now: times.restored,
  validation: { session: true, availability: true },
});
assert.equal(missingCheckout.outcome, "revalidation_required", "checkout must wait for current pricing");
assert.deepEqual(missingCheckout.missing, ["pricing"], "checkout must report the exact missing check");
const failedCheckout = restorePausedRichStage(priorityModel, {
  view: "checkout",
  now: times.restored,
  validation: { session: true, availability: false, pricing: true },
});
assert.equal(failedCheckout.plan.outcome, "revalidation_failed", "unavailable seats must reject checkout restoration");
assert.equal(selectRestorableRichStage(failedCheckout.model, { view: "checkout" }), null, "failed revalidation must invalidate the stale checkout");
assert.equal(failedCheckout.model.activeView, null, "failed revalidation must not leave stale checkout visible");

let invalidationModel = createPausedRichJourney({ sessionId: "s", journeyId: "j", now: times.start });
invalidationModel = capturePausedRichStage(invalidationModel, stages.showtimes, { now: times.start });
invalidationModel = capturePausedRichStage(invalidationModel, stages.seatmap, { now: times.hidden });
invalidationModel = capturePausedRichStage(invalidationModel, stages.checkout, { now: times.restored });
invalidationModel = invalidatePausedRichStage(invalidationModel, { scope: "seats", now: times.terminal, reason: "seat_selection_changed" });
assert.equal(selectRestorableRichStage(invalidationModel, { view: "seatmap" }), null, "seat changes must invalidate the saved seat map");
assert.equal(selectRestorableRichStage(invalidationModel, { view: "checkout" }), null, "seat changes must invalidate saved checkout pricing");
assert.equal(selectRestorableRichStage(invalidationModel, { view: "showtimes" }).view, "showtimes", "seat changes must retain compatible showtimes");
assert.equal(invalidationModel.activeView, null, "invalidating the visible checkout must clear its rendering");

const terminalCases = [
  ["completion", completePausedRichJourney, "completed"],
  ["explicit cancellation", cancelPausedRichJourney, "cancelled"],
  ["session expiration", expirePausedRichJourney, "expired"],
  ["conversation end", endPausedRichJourney, "ended"],
];
for (const [label, transition, expectedStatus] of terminalCases) {
  const terminal = transition(priorityModel, { now: times.terminal });
  assert.equal(terminal.status, expectedStatus, `${label}: terminal status must be recorded`);
  assert.equal(terminal.activeView, null, `${label}: no rich rendering may remain visible`);
  assert.equal(terminal.resumeView, null, `${label}: no stale resume target may remain`);
  assert.deepEqual(terminal.entries, {}, `${label}: saved rich snapshots must be cleared`);
  assert.equal(selectRestorableRichStage(terminal), null, `${label}: stale stages must not restore`);
}

const newConversation = createPausedRichJourney({
  sessionId: "session-2",
  journeyId: "conversation-2",
  now: times.terminal,
});
assert.equal(newConversation.status, "empty", "a new conversation must begin without inherited rendering");
assert.equal(newConversation.activeView, null, "a new conversation must not inherit the previous active panel");
assert.equal(newConversation.resumeView, null, "a new conversation must not inherit a resume target");
assert.deepEqual(newConversation.entries, {}, "a new conversation must not inherit saved snapshots");

let expiring = createPausedRichJourney({
  sessionId: "s",
  journeyId: "old",
  expiresAt: times.hidden,
  now: times.start,
});
expiring = capturePausedRichStage(expiring, stages.checkout, { now: times.start });
assert.equal(isPausedRichJourneyExpired(expiring, times.restored), true, "expiry must use the configured absolute time");
const expiredRestore = restorePausedRichStage(expiring, {
  now: times.restored,
  validation: { session: true, availability: true, pricing: true },
});
assert.equal(expiredRestore.plan.outcome, "session_expired", "restore must detect an expired session before rendering");
assert.equal(expiredRestore.model.status, "expired", "an expired restore request must terminally clear snapshots");
assert.deepEqual(expiredRestore.model.entries, {}, "expiration must remove every stale snapshot");

const replaced = replacePausedRichJourney(priorityModel, {
  sessionId: "s",
  journeyId: "new-journey",
  stage: { view: "movies", movies: [{ id: "m2", title: "Movie Two" }] },
  now: times.terminal,
});
assert.equal(replaced.previousJourneyId, "j", "replacement must retain only the previous journey identifier for audit");
assert.equal(replaced.journeyId, "new-journey", "replacement must use the new booking identity");
assert.equal(replaced.activeView, "movies", "a replacement may begin by rendering the new booking stage");
assert.equal(selectRestorableRichStage(replaced, { view: "checkout" }), null, "a new booking must not restore the previous checkout");
assert.equal(selectRestorableRichStage(replaced, { view: "seatmap" }), null, "a new booking must not restore the previous seats");
assert.equal(selectRestorableRichStage(replaced, { view: "movies" }).snapshot.movies[0].id, "m2", "replacement must retain only the new booking snapshot");

console.log("Validated paused rich rendering for movies, showtimes, seats, checkout, history, booking, and cancellation, including immutable capture, topic hiding, prioritized restore, revalidation, invalidation, terminal cleanup, expiry, and booking replacement.");
