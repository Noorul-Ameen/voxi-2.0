import assert from "node:assert/strict";
import {
  CANCELLATION_TARGET_SELECTION_PURPOSE,
  bookingHistoryAgentContext,
  classifyBookingHistoryRequest,
  isCurrentBooking,
  isDirectCancellationRequest,
  resolveCancellationContinuation,
  resolveCancellationTarget,
  sortBookingsForDisplay,
} from "../src/lib/cancellationRouting.js";

const activeA = Object.freeze({
  ref: "WLACTIVE1",
  movieTitle: "Active One",
  performanceDate: "2026-07-15",
  cancelled: false,
  bookingStatus: "confirmed_demo",
  email: "guest@example.com",
  cardNumber: "4111111111111111",
});
const activeB = Object.freeze({
  ref: "WLACTIVE2",
  movieTitle: "Active Two",
  performanceDate: "2026-07-16",
  cancelled: false,
  bookingStatus: "confirmed_demo",
});
const cancelled = Object.freeze({
  ref: "WLCANCELLED",
  movieTitle: "Cancelled",
  performanceDate: "2026-07-14",
  cancelled: true,
  bookingStatus: "cancelled_demo",
});
const dubaiNoon = new Date("2026-07-13T08:00:00.000Z");
const resolveAtFixtureTime = (input) => resolveCancellationTarget({
  ...input,
  now: dubaiNoon,
});
const elapsed = Object.freeze({
  ref: "WLELAPSED",
  movieTitle: "Past Show",
  performanceDate: "2026-07-13",
  showtime: "11:30",
  cancelled: false,
  bookingStatus: "confirmed_demo",
});
const laterToday = Object.freeze({
  ref: "WLLATERTODAY",
  movieTitle: "Later Today",
  performanceDate: "2026-07-13",
  showtime: "12:30",
  cancelled: false,
  bookingStatus: "confirmed_demo",
});

assert.equal(isCurrentBooking(activeA, { now: dubaiNoon }), true, "a future non-cancelled booking must be current");
assert.equal(isCurrentBooking(laterToday, { now: dubaiNoon }), true, "a later show today must remain current");
assert.equal(isCurrentBooking(elapsed, { now: dubaiNoon }), false, "an elapsed showtime must not appear under current bookings");
assert.equal(isCurrentBooking(cancelled, { now: dubaiNoon }), false, "a cancelled record must not be current");
assert.equal(isCurrentBooking({ ...activeA, bookingStatus: "expired" }, { now: dubaiNoon }), false, "an explicitly inactive status must not be current");

for (const [text, activeOnly] of [
  ["Show my current bookings", true],
  ["What are my current bookings?", true],
  ["Show my active booking", true],
  ["Show my upcoming bookings", true],
  ["اعرض حجوزاتي الحالية", true],
  ["ما هي حجوزاتي الحالية؟", true],
  ["اعرض حجوزاتي النشطة", true],
  ["Show my booking history", false],
  ["My previous bookings", false],
  ["اعرض سجل الحجوزات", false],
]) {
  assert.deepEqual(
    classifyBookingHistoryRequest(text),
    { requested: true, activeOnly },
    `${text}: booking-history scope must be classified deterministically`,
  );
}
for (const text of ["What movies are showing?", "What is my current cinema?", "ما هي الأفلام الحالية؟"]) {
  assert.deepEqual(
    classifyBookingHistoryRequest(text),
    { requested: false, activeOnly: false },
    `${text}: unrelated discovery must not open booking history`,
  );
}

for (const text of [
  "Cancel my booking",
  "Cancel this booking",
  "Cancel a booking",
  "Cancel Mission Impossible",
  "Cancel the booking for the 18th",
  "Cancel the evening booking",
  "Cancel the second booking",
  "Cancel booking for tomorrow",
  "Please cancel one reservation",
  "Please cancel booking WLACTIVE1",
  "Cancel my The Odyssey booking",
  "I want to cancel my reservation",
  "ألغي حجزي",
  "الغي هذا الحجز",
  "أريد إلغاء حجزي",
]) {
  assert.equal(isDirectCancellationRequest(text), true, `${text}: direct cancellation must bypass FAQ rendering`);
}
for (const text of ["Cancel it", "Please cancel it", "ألغه", "ألغيها"]) {
  assert.equal(isDirectCancellationRequest(text), false, `${text}: a pronoun alone must not cancel without booking context`);
  assert.equal(
    isDirectCancellationRequest(text, { hasBookingContext: true }),
    true,
    `${text}: the same pronoun must continue a visible booking journey`,
  );
}
for (const text of [
  "Can I cancel a booking?",
  "Can I cancel my booking?",
  "Can I please cancel booking for tomorrow?",
  "Could I cancel Mission Impossible?",
  "When can I cancel the evening booking?",
  "What happens if I cancel the second booking?",
  "What is the cancellation policy?",
  "How do refunds work?",
  "هل يمكنني إلغاء الحجز؟",
  "ما هي سياسة الإلغاء؟",
  "كيف يعمل الاسترداد؟",
]) {
  assert.equal(
    isDirectCancellationRequest(text, { hasBookingContext: true }),
    false,
    `${text}: a policy question must remain informational even with visible booking context`,
  );
}
for (const text of ["Do not cancel my booking", "Please don't cancel Mission Impossible"]) {
  assert.equal(isDirectCancellationRequest(text, { hasBookingContext: true }), false, `${text}: a negated request must not begin cancellation`);
}

const newestBooking = Object.freeze({ ...activeA, ref: "WLNEWEST", createdAt: "2026-07-13T11:00:00.000Z", showtime: "20:30", cinemaName: "VOX Mall of the Emirates" });
const olderBooking = Object.freeze({ ...activeB, ref: "WLOLDER", createdAt: "2026-07-12T11:00:00.000Z", showtime: "18:00", cinemaName: "VOX City Centre Mirdif" });
const unsortedBookings = [olderBooking, newestBooking];
assert.deepEqual(
  sortBookingsForDisplay(unsortedBookings).map((booking) => booking.ref),
  [newestBooking.ref, olderBooking.ref],
  "booking display order must be newest first",
);
assert.deepEqual(unsortedBookings.map((booking) => booking.ref), [olderBooking.ref, newestBooking.ref], "display sorting must not mutate stored history");

const explicitRequested = resolveAtFixtureTime({
  requestedRef: "wlactive2",
  text: "Cancel it",
  visibleBooking: activeA,
  storedBookings: [activeA, activeB, cancelled],
});
assert.equal(explicitRequested.bookingRef, activeB.ref, "an explicit requested reference must beat the visible booking");
assert.equal(explicitRequested.booking, activeB);
assert.match(explicitRequested.source, /explicit|requested|reference/i);
assert.equal(explicitRequested.reason, null);

const explicitInText = resolveAtFixtureTime({
  text: "Please cancel booking wlactive2",
  visibleBooking: activeA,
  storedBookings: [activeA, activeB, cancelled],
});
assert.equal(explicitInText.bookingRef, activeB.ref, "a reference in the utterance must beat the visible booking");
assert.equal(explicitInText.booking, activeB);
assert.match(explicitInText.source, /explicit|text|spoken|reference/i);

const namedMovieBooking = Object.freeze({ ...activeB, ref: "WLODYSS5Y", movieTitle: "The Odyssey" });
const namedMovieTarget = resolveAtFixtureTime({
  text: "Cancel my The Odyssey booking",
  storedBookings: [activeA, namedMovieBooking, cancelled],
});
assert.equal(namedMovieTarget.bookingRef, namedMovieBooking.ref, "a direct cancellation naming one stored movie must not enter movie discovery");
assert.equal(namedMovieTarget.source, "spoken_title");
assert.equal(namedMovieTarget.reason, null);
const cancelledNamedDuplicate = Object.freeze({ ...cancelled, ref: "WLODYOLD", movieTitle: "The Odyssey" });
const namedMovieWithCancelledHistory = resolveAtFixtureTime({
  text: "Cancel my The Odyssey booking",
  storedBookings: [activeA, namedMovieBooking, cancelledNamedDuplicate],
});
assert.equal(namedMovieWithCancelledHistory.bookingRef, namedMovieBooking.ref, "one current title match must beat an older cancelled record for the same movie");

const visibleSelection = resolveAtFixtureTime({
  text: "Cancel it",
  visibleBooking: activeA,
  storedBookings: [activeA, activeB, cancelled],
});
assert.equal(visibleSelection.bookingRef, activeA.ref, "the selected visible booking must beat sole-active inference");
assert.equal(visibleSelection.booking, activeA);
assert.match(visibleSelection.source, /visible|selected/i);

const visibleCancelledSelection = resolveAtFixtureTime({
  text: "Cancel it",
  visibleBooking: cancelled,
  storedBookings: [cancelled, activeA],
});
assert.equal(visibleCancelledSelection.bookingRef, cancelled.ref, "a contextual request on a visible cancelled booking must not jump to a different active booking");
assert.equal(visibleCancelledSelection.booking, cancelled);
assert.equal(visibleCancelledSelection.reason, "already_cancelled");
assert.match(visibleCancelledSelection.source, /visible|selected/i);

const soleActive = resolveAtFixtureTime({
  text: "Cancel my current booking",
  storedBookings: [cancelled, activeA],
});
assert.equal(soleActive.bookingRef, activeA.ref, "one non-cancelled stored booking may be selected deterministically");
assert.equal(soleActive.booking, activeA);
assert.match(soleActive.source, /sole|single|active/i);
assert.deepEqual(soleActive.candidates, [activeA.ref], "cancelled records must be excluded from active candidates");

const noActive = resolveAtFixtureTime({
  text: "Cancel my current booking",
  storedBookings: [cancelled],
});
assert.equal(noActive.bookingRef, null);
assert.equal(noActive.booking, null);
assert.equal(noActive.reason, "no_active_booking");
assert.deepEqual(noActive.candidates, [], "a cancelled record must never be offered for cancellation again");

const multipleActive = resolveAtFixtureTime({
  text: "Cancel my current booking",
  storedBookings: [cancelled, activeA, activeB],
});
assert.equal(multipleActive.bookingRef, null, "multiple active bookings must never be resolved arbitrarily");
assert.equal(multipleActive.booking, null);
assert.equal(multipleActive.reason, "multiple_active_bookings");
assert.deepEqual(
  multipleActive.candidates,
  [activeA.ref, activeB.ref],
  "selection-required results must expose only active booking candidates",
);

const elapsedOnly = resolveAtFixtureTime({
  text: "Cancel my current booking",
  storedBookings: [cancelled, elapsed],
});
assert.equal(elapsedOnly.bookingRef, null, "an elapsed booking must not be auto-selected as the current booking");
assert.equal(elapsedOnly.reason, "no_active_booking");

const visibleElapsed = resolveAtFixtureTime({
  text: "Cancel it",
  visibleBooking: elapsed,
  storedBookings: [elapsed, activeA],
});
assert.equal(visibleElapsed.bookingRef, elapsed.ref, "a contextual request must stay attached to the visible elapsed booking");
assert.equal(visibleElapsed.reason, "not_current_booking", "the visible elapsed booking must be identified without falling through to another record");

const alreadyCancelled = resolveAtFixtureTime({
  requestedRef: cancelled.ref,
  visibleBooking: activeA,
  storedBookings: [activeA, cancelled],
});
assert.equal(alreadyCancelled.bookingRef, cancelled.ref, "an explicit cancelled reference must not silently fall back to another booking");
assert.equal(alreadyCancelled.booking, cancelled);
assert.equal(alreadyCancelled.reason, "already_cancelled");

const unknownReference = resolveAtFixtureTime({
  requestedRef: "WLMISSING",
  visibleBooking: activeA,
  storedBookings: [activeA],
});
assert.equal(unknownReference.bookingRef, "WLMISSING", "an unknown explicit reference must be preserved for provider lookup instead of falling back to the selected booking");
assert.equal(unknownReference.booking, null);
assert.equal(unknownReference.source, "requested_ref");
assert.equal(unknownReference.reason, null);

const selectionStage = Object.freeze({
  view: "history",
  purpose: CANCELLATION_TARGET_SELECTION_PURPOSE,
  candidateRefs: [activeA.ref, activeB.ref],
});
const uniqueTitleContinuation = resolveCancellationContinuation({
  text: activeB.movieTitle,
  stage: selectionStage,
  storedBookings: [activeA, activeB, cancelled],
});
assert.equal(uniqueTitleContinuation.handled, true, "a displayed movie title must remain in cancellation routing");
assert.equal(uniqueTitleContinuation.bookingRef, activeB.ref, "one exact displayed title must resolve its booking reference");
assert.equal(uniqueTitleContinuation.reason, "matched_unique_title");

const spokenNumberContinuation = resolveCancellationContinuation({
  text: "Please cancel Active two",
  stage: selectionStage,
  storedBookings: [activeA, activeB, cancelled],
});
assert.equal(spokenNumberContinuation.bookingRef, activeB.ref, "voice number words and a tightly scoped cancellation prefix must match the displayed title exactly");

const toyStoryBooking = Object.freeze({ ...activeB, ref: "WLTOYSTORY5", movieTitle: "Toy Story 5" });
const toyStoryVoiceContinuation = resolveCancellationContinuation({
  text: "Toy Story five",
  stage: { ...selectionStage, candidateRefs: [activeA.ref, toyStoryBooking.ref] },
  storedBookings: [activeA, toyStoryBooking],
});
assert.equal(toyStoryVoiceContinuation.bookingRef, toyStoryBooking.ref, "Toy Story five from speech recognition must match the displayed Toy Story 5 booking");

const movieFieldBooking = Object.freeze({ ...activeA, ref: "WLMOVIEFIELD", movieTitle: undefined, movie: "Movie Field Title" });
const movieFieldContinuation = resolveCancellationContinuation({
  text: "Movie Field Title",
  stage: { ...selectionStage, candidateRefs: [movieFieldBooking.ref] },
  storedBookings: [movieFieldBooking],
});
assert.equal(movieFieldContinuation.bookingRef, movieFieldBooking.ref, "completed records using the movie field must resolve by displayed title");

const explicitReferenceContinuation = resolveCancellationContinuation({
  text: `Cancel booking ${activeA.ref}`,
  stage: selectionStage,
  storedBookings: [activeA, activeB, cancelled],
});
assert.equal(explicitReferenceContinuation.bookingRef, activeA.ref, "an exact displayed reference token must select that booking");
assert.equal(explicitReferenceContinuation.reason, "matched_reference");

const duplicateTitleA = Object.freeze({ ...activeA, ref: "WLDUPLICATE1", movieTitle: "Same Film" });
const duplicateTitleB = Object.freeze({ ...activeB, ref: "WLDUPLICATE2", movieTitle: "Same Film" });
const duplicateTitleContinuation = resolveCancellationContinuation({
  text: "Same Film",
  stage: { ...selectionStage, candidateRefs: [duplicateTitleA.ref, duplicateTitleB.ref] },
  storedBookings: [duplicateTitleA, duplicateTitleB],
});
assert.equal(duplicateTitleContinuation.handled, true, "an ambiguous title must stay inside cancellation target selection");
assert.equal(duplicateTitleContinuation.bookingRef, null, "duplicate titles must never select a booking arbitrarily");
assert.equal(duplicateTitleContinuation.reason, "ambiguous_movie_title");
assert.deepEqual(duplicateTitleContinuation.candidates, [duplicateTitleA.ref, duplicateTitleB.ref]);

const unrelatedStage = resolveCancellationContinuation({
  text: activeA.movieTitle,
  stage: { view: "movies", purpose: CANCELLATION_TARGET_SELECTION_PURPOSE, candidateRefs: [activeA.ref] },
  storedBookings: [activeA],
});
assert.equal(unrelatedStage.handled, false, "candidate matching must require the explicit cancellation history purpose");

for (const contextChange of ["Go back", "Show me movies", "Show my current bookings", "What is the cancellation policy?"]) {
  const continuation = resolveCancellationContinuation({
    text: contextChange,
    stage: selectionStage,
    storedBookings: [activeA, activeB],
  });
  assert.equal(continuation.handled, false, `${contextChange}: an explicit task change or FAQ must not trap the guest in cancellation target selection`);
}

const agentContext = bookingHistoryAgentContext([olderBooking, newestBooking, cancelled]);
const agentSummaries = JSON.parse(agentContext.match(/summaries: (\[.*\])\. These are/)?.[1] || "[]");
assert.deepEqual(agentSummaries.map((booking) => booking.bookingRef), [newestBooking.ref, olderBooking.ref, cancelled.ref], "agent history context must use the visible newest-first order");
assert.deepEqual(agentSummaries.map((booking) => booking.listPosition), [1, 2, 3], "agent history context must expose one-based visible list positions");
assert.equal(agentSummaries[0].showtime, newestBooking.showtime, "agent history context must expose the visible showtime");
assert.equal(agentSummaries[0].cinema, newestBooking.cinemaName, "agent history context must expose the visible cinema");
assert.match(agentContext, new RegExp(newestBooking.ref), "agent history context must include the active reference needed for cancellation");
assert.match(agentContext, new RegExp(cancelled.ref), "agent history context must include cancelled status for disambiguation");
assert.match(agentContext, /cancelled/i, "agent history context must label cancellation state explicitly");
assert.doesNotMatch(agentContext, /guest@example\.com|4111111111111111/, "agent history context must serialize an allowlist, not private booking fields");

console.log("Validated bilingual cancellation intent, deterministic targets, exact displayed-candidate continuation, duplicate-title safety, and safe booking-history context.");
