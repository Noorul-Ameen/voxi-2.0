import assert from "node:assert/strict";
import { resolveConversationalCancellation } from "../src/lib/conversationalCancellationResolver.js";

const now = new Date("2026-07-17T08:00:00.000Z");
const booking = (value) => Object.freeze({
  cancelled: false,
  bookingStatus: "confirmed",
  providerEligibilityVerified: true,
  ...value,
});

const missionEarly = booking({
  ref: "ABC123",
  movieTitle: "Mission Impossible",
  cinemaName: "VOX Cinemas Mall of the Emirates",
  performanceDate: "2026-07-18",
  showtime: "18:00",
});
const missionLate = booking({
  ref: "XYZ789",
  movieTitle: "Mission Impossible",
  cinemaName: "VOX Cinemas City Centre Mirdif",
  performanceDate: "2026-07-20",
  showtime: "20:30",
});
const toyStory = booking({
  ref: "TOY555",
  movieTitle: "Toy Story 5",
  cinemaName: "VOX Cinemas Mall of the Emirates",
  performanceDate: "2026-07-18",
  showtime: "17:00",
});
const arabicMovie = booking({
  ref: "AR7788",
  movieTitle: "رحلة القمر",
  cinemaName: "VOX Cinemas Yas Mall",
  performanceDate: "2026-07-21",
  showtime: "19:15",
});
const ineligible = booking({
  ref: "NOREFUND",
  movieTitle: "Moana",
  cinemaName: "VOX Cinemas City Centre Deira",
  performanceDate: "2026-07-19",
  showtime: "10:00",
  cancellationEligible: false,
});
const cancelled = booking({
  ref: "CANCELLED1",
  movieTitle: "Sonic",
  cinemaName: "VOX Cinemas Mall of the Emirates",
  performanceDate: "2026-07-18",
  showtime: "21:30",
  cancelled: true,
  bookingStatus: "cancelled",
});

const bookings = [missionEarly, missionLate, toyStory, arabicMovie, ineligible, cancelled];
const displayedBookingRefs = bookings.map((item) => item.ref);
const resolve = (text, extra = {}) => resolveConversationalCancellation({
  text,
  bookings,
  displayedBookingRefs,
  now,
  ...extra,
});

const passed = [];
const scenario = (number, label, check) => {
  check();
  passed.push(`${number}. ${label}`);
};

scenario(1, "Cancel by exact booking reference", () => {
  const result = resolve("Cancel booking reference ABC123");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, missionEarly.ref);
  assert.deepEqual(result.matchedBy, ["reference"]);
});

scenario(2, "Cancel by movie name with one matching booking", () => {
  const result = resolve("Cancel the booking for Toy Story five");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, toyStory.ref);
  assert.ok(result.matchedBy.includes("movie"));
});

scenario(3, "Cancel by movie name with multiple matching bookings", () => {
  const result = resolve("Cancel Mission Impossible");
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidateRefs, [missionEarly.ref, missionLate.ref]);
  assert.deepEqual(result.differentiators, ["date"]);
});

scenario(4, "Cancel by date with one matching booking", () => {
  const result = resolve("Cancel my booking for the 21st");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, arabicMovie.ref);
});

scenario(5, "Cancel by date with multiple matching bookings", () => {
  const result = resolve("Cancel the booking I made for tomorrow");
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidateRefs, [missionEarly.ref, toyStory.ref]);
  assert.deepEqual(result.differentiators, ["movie"]);
});

scenario(6, "Cancel by cinema", () => {
  const result = resolve("Cancel the City Centre Mirdif booking");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, missionLate.ref);
  assert.ok(result.matchedBy.includes("cinema"));
});

scenario(7, "Cancel by displayed list position", () => {
  const result = resolve("Cancel the second booking");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, missionLate.ref);
  assert.deepEqual(result.matchedBy, ["ordinal"]);
});

scenario(8, "Resolve a voice transcript", () => {
  const result = resolve("Please cancel the booking at 8:30 PM");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, missionLate.ref);
  assert.ok(result.matchedBy.includes("showtime"));
});

scenario(9, "Resolve a text request", () => {
  const result = resolve("Cancel the Yas Mall booking on 21 July");
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, arabicMovie.ref);
  assert.ok(result.matchedBy.includes("date"));
  assert.ok(result.matchedBy.includes("cinema"));
});

scenario(10, "Reject at confirmation without mutating the target", () => {
  const before = JSON.stringify(bookings);
  const result = resolve("Cancel reference ABC123");
  assert.equal(result.status, "unique");
  assert.equal(JSON.stringify(bookings), before);
  const afterRejection = resolve("Cancel reference ABC123");
  assert.equal(afterRejection.status, "unique");
});

scenario(11, "Return a stable unique target for confirmation", () => {
  const first = resolve("Cancel reference ABC123");
  const second = resolve("Cancel reference ABC123");
  assert.equal(first.bookingRef, second.bookingRef);
  assert.equal(first.status, "unique");
  assert.equal(second.status, "unique");
});

scenario(12, "Attempt to cancel an ineligible booking", () => {
  const result = resolve("Cancel Moana");
  assert.equal(result.status, "ineligible");
  assert.equal(result.bookingRef, ineligible.ref);
  assert.equal(result.reason, "provider_marked_ineligible");
});

scenario(13, "Attempt to cancel an already cancelled booking", () => {
  const result = resolve("Cancel booking reference CANCELLED1");
  assert.equal(result.status, "already_cancelled");
  assert.equal(result.bookingRef, cancelled.ref);
});

scenario(14, "Cancel from booking history order", () => {
  const historyOrder = [toyStory.ref, missionEarly.ref, missionLate.ref];
  const result = resolveConversationalCancellation({
    text: "Cancel the first one",
    bookings,
    displayedBookingRefs: historyOrder,
    now,
  });
  assert.equal(result.status, "unique");
  assert.equal(result.bookingRef, toyStory.ref);
  assert.equal(result.candidates[0].position, 1);
});

scenario(15, "Change topic and resume without resolver state loss", () => {
  const first = resolve("Cancel Mission Impossible");
  const unrelated = resolve("What bank offers are available?");
  const resumed = resolve("Cancel Mission Impossible");
  assert.equal(first.status, "ambiguous");
  assert.equal(unrelated.status, "none", "An unrelated request must not select a cancellation target");
  assert.deepEqual(resumed.candidateRefs, first.candidateRefs);
  assert.equal(JSON.stringify(bookings), JSON.stringify([missionEarly, missionLate, toyStory, arabicMovie, ineligible, cancelled]));
});

scenario(16, "Recognize history after a confirmed cancellation update", () => {
  const updated = bookings.map((item) => item.ref === missionEarly.ref
    ? { ...item, cancelled: true, bookingStatus: "cancelled", cancelledAt: "2026-07-17T08:05:00.000Z" }
    : item);
  const result = resolveConversationalCancellation({
    text: "Cancel reference ABC123",
    bookings: updated,
    displayedBookingRefs: updated.map((item) => item.ref),
    now,
  });
  assert.equal(result.status, "already_cancelled");
  assert.equal(result.bookingRef, missionEarly.ref);
});

const exactTime = resolve("Cancel the booking at 6 PM");
assert.equal(exactTime.status, "unique");
assert.equal(exactTime.bookingRef, missionEarly.ref);

const evening = resolve("Cancel the evening booking");
assert.equal(evening.status, "ambiguous");
assert.deepEqual(evening.candidateRefs, [missionEarly.ref, missionLate.ref, toyStory.ref, arabicMovie.ref]);
assert.ok(evening.matchedBy.includes("time_band"));

const contextual = resolve("Cancel my booking for this movie", {
  conversationContext: { currentMovie: { title: "Toy Story 5" } },
});
assert.equal(contextual.status, "unique");
assert.equal(contextual.bookingRef, toyStory.ref);
assert.ok(contextual.matchedBy.includes("context_movie"));

const missingContext = resolve("Cancel my booking for this movie");
assert.equal(missingContext.status, "none");
assert.equal(missingContext.reason, "context_movie_unavailable");

const unknownReference = resolve("Cancel booking reference UNKNOWN99");
assert.equal(unknownReference.status, "none");
assert.equal(unknownReference.reason, "unknown_reference");

const unknownMovie = resolve("Cancel Avatar");
assert.equal(unknownMovie.status, "none");
assert.equal(unknownMovie.reason, "unrecognized_selector");

const displayedAmbiguityOrder = resolveConversationalCancellation({
  text: "Cancel Mission Impossible",
  bookings,
  displayedBookingRefs: [missionLate.ref, missionEarly.ref],
  now,
});
assert.deepEqual(displayedAmbiguityOrder.candidateRefs, [missionLate.ref, missionEarly.ref]);

const arabicReference = resolve("الغ الحجز رقم ABC123");
assert.equal(arabicReference.status, "unique");
assert.equal(arabicReference.bookingRef, missionEarly.ref);

const arabicMovieResult = resolve("الغ حجز فيلم رحلة القمر");
assert.equal(arabicMovieResult.status, "unique");
assert.equal(arabicMovieResult.bookingRef, arabicMovie.ref);

const arabicOrdinal = resolve("الغ الحجز الثاني");
assert.equal(arabicOrdinal.status, "unique");
assert.equal(arabicOrdinal.bookingRef, missionLate.ref);

assert.equal(passed.length, 16);
console.log(`Validated ${passed.length} required conversational cancellation scenarios plus English and Arabic date, time, cinema, context, ambiguity, and safety coverage.`);
