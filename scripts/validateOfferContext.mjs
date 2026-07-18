import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  OFFER_CONTEXT_SOURCE,
  buildOfferEvaluationContext,
  offerContextFingerprint,
  sameOfferContext,
  shouldInvalidateOfferResult,
} from "../src/offers/offerContext.js";

const checkout = {
  checkoutId: "checkout-A",
  cinemaId: "cinema-A",
  cinemaName: "Cinema A",
  movieId: "movie-A",
  movieTitle: "Movie A",
  sessionId: "session-A",
  performanceDate: "2026-07-18",
  programmingDate: "2026-07-18",
  showtime: "18:00",
  showtimeAt: "2026-07-18T18:00:00+04:00",
  experience: "IMAX",
  format: "2D",
  screen: "Screen A",
  seatType: "REGULAR",
  seats: ["E3", "E1"],
  ticketQuantity: 99,
  ticketCount: 99,
  subtotal: 80,
  feeTotal: 4,
  total: 84,
  currency: "AED",
};

const session = {
  cinema: { id: "cinema-B", name: "Cinema B" },
  movie: { id: "movie-B", title: "Movie B" },
  session: {
    sessionId: "session-B",
    date: "2026-07-19",
    time: "20:15",
    exp: "4DX",
    format: "3D",
    screen: "Screen B",
  },
  selectedSeats: ["F1"],
  requestedTicketCount: 12,
  total: 42,
};

const booking = {
  ref: "BOOKING-C",
  cinemaId: "cinema-C",
  cinemaName: "Cinema C",
  movieId: "movie-C",
  movieTitle: "Movie C",
  sessionId: "session-C",
  performanceDate: "2026-07-20",
  showtime: "21:30",
  experience: "THEATRE",
  format: "2D",
  screen: "Screen C",
  seats: ["G1", "G2", "G2"],
  ticketQuantity: 50,
  total: 160,
  currency: "AED",
};

const browse = {
  id: "browse-D",
  cinemaId: "cinema-D",
  cinemaName: "Cinema D",
  movieId: "movie-D",
  movieTitle: "Movie D",
  sessionId: "must-not-ground-browse",
  date: "2026-07-21",
  preferredTime: "19:00",
  experience: "STANDARD",
  format: "2D",
  seats: [],
  ticketCount: 30,
};

const eligibility = {
  isMember: true,
  channel: "web",
  monthlyTicketsUsed: 1,
  monthlySpend: 5000,
};

const checkoutContext = buildOfferEvaluationContext({
  source: OFFER_CONTEXT_SOURCE.CHECKOUT,
  checkout,
  session,
  booking,
  browse,
  eligibility,
});
assert.equal(checkoutContext.source, "checkout");
assert.equal(checkoutContext.cinemaId, "cinema-A");
assert.equal(checkoutContext.movieId, "movie-A");
assert.equal(checkoutContext.sessionId, "session-A");
assert.deepEqual(checkoutContext.selectedSeats, ["E1", "E3"]);
assert.equal(checkoutContext.ticketCount, 2, "ticket count must come only from unique selected seats");
assert.equal(checkoutContext.orderTotal, 84);
assert.equal(checkoutContext.isSessionGrounded, true);
assert.equal(checkoutContext.selectedShowtime.sessionId, "session-A");
assert.equal(checkoutContext.selectedShowtime.cinemaId, "cinema-A");
assert.equal(checkoutContext.cinemaName.includes("Cinema B"), false, "checkout context must not leak from the session source");
assert.equal(checkoutContext.bookingRef, null, "checkout context must not leak from the booking source");

const sparseCheckoutContext = buildOfferEvaluationContext({
  source: OFFER_CONTEXT_SOURCE.CHECKOUT,
  checkout: { checkoutId: "checkout-sparse", sessionId: "session-sparse", seats: [] },
  session,
  booking,
  browse,
});
assert.equal(sparseCheckoutContext.cinemaId, null, "a missing checkout cinema must not be filled from another source");
assert.equal(sparseCheckoutContext.movieId, null, "a missing checkout movie must not be filled from another source");
assert.equal(sparseCheckoutContext.orderTotal, null, "a missing checkout total must not be filled from another source");

const sessionContext = buildOfferEvaluationContext({
  source: OFFER_CONTEXT_SOURCE.SESSION,
  checkout,
  session,
  booking,
  browse,
  eligibility,
});
assert.equal(sessionContext.source, "session");
assert.equal(sessionContext.cinemaId, "cinema-B");
assert.equal(sessionContext.movieId, "movie-B");
assert.equal(sessionContext.sessionId, "session-B");
assert.deepEqual(sessionContext.selectedSeats, ["F1"]);
assert.equal(sessionContext.ticketCount, 1);
assert.equal(sessionContext.orderTotal, 42);
assert.equal(sessionContext.checkoutId, null);
assert.equal(sessionContext.bookingRef, null);

const bookingContext = buildOfferEvaluationContext({
  source: OFFER_CONTEXT_SOURCE.BOOKING,
  checkout,
  session,
  booking,
  browse,
  eligibility,
});
assert.equal(bookingContext.source, "booking");
assert.equal(bookingContext.cinemaId, "cinema-C");
assert.equal(bookingContext.movieId, "movie-C");
assert.equal(bookingContext.sessionId, "session-C");
assert.equal(bookingContext.bookingRef, "BOOKING-C");
assert.deepEqual(bookingContext.selectedSeats, ["G1", "G2"]);
assert.equal(bookingContext.ticketCount, 2);
assert.equal(bookingContext.orderTotal, 160);
assert.equal(bookingContext.checkoutId, null);

const browseContext = buildOfferEvaluationContext({
  source: OFFER_CONTEXT_SOURCE.BROWSE,
  checkout,
  session,
  booking,
  browse,
  eligibility,
});
assert.equal(browseContext.source, "browse");
assert.equal(browseContext.cinemaId, "cinema-D");
assert.equal(browseContext.sessionId, null, "browse criteria must not masquerade as a selected session");
assert.equal(browseContext.isSessionGrounded, false);
assert.equal(browseContext.selectedShowtime, null);
assert.equal(browseContext.ticketCount, 0, "an explicit empty seat selection must derive a zero ticket count");

assert.equal(buildOfferEvaluationContext({ view: "checkout", checkout, session, booking, browse }).source, "checkout");
assert.equal(buildOfferEvaluationContext({ view: "booking", checkout, session, booking, browse }).source, "booking");
assert.equal(buildOfferEvaluationContext({ view: "seatmap", checkout, session, booking, browse }).source, "session");
assert.equal(buildOfferEvaluationContext({ view: "offers", originView: "checkout", checkout, session, booking, browse }).source, "checkout");
assert.equal(buildOfferEvaluationContext({ view: "offers", originView: "booking", checkout, session, booking, browse }).source, "booking");

const sameCheckoutDifferentNoise = buildOfferEvaluationContext({
  source: "checkout",
  checkout: { ...checkout, seats: ["E1", "E3"] },
  session: { ...session, cinema: { id: "changed-ignored-session", name: "Ignored" } },
  booking: { ...booking, cinemaId: "changed-ignored-booking" },
  browse: { ...browse, cinemaId: "changed-ignored-browse" },
  eligibility,
});
assert.equal(sameOfferContext(checkoutContext, sameCheckoutDifferentNoise), true, "ignored sources must not affect the canonical fingerprint");
assert.equal(offerContextFingerprint(checkoutContext), checkoutContext.fingerprint, "stored fingerprint must be reproducible");

const changedCinema = buildOfferEvaluationContext({ source: "checkout", checkout: { ...checkout, cinemaId: "cinema-A2" }, eligibility });
const changedSession = buildOfferEvaluationContext({ source: "checkout", checkout: { ...checkout, sessionId: "session-A2" }, eligibility });
const changedSeats = buildOfferEvaluationContext({ source: "checkout", checkout: { ...checkout, seats: ["E1", "E2", "E3"] }, eligibility });
const changedTotal = buildOfferEvaluationContext({ source: "checkout", checkout: { ...checkout, total: 90 }, eligibility });
for (const changed of [changedCinema, changedSession, changedSeats, changedTotal]) {
  assert.equal(sameOfferContext(checkoutContext, changed), false, "transactional context changes must produce a new fingerprint");
  assert.equal(shouldInvalidateOfferResult({ contextFingerprint: checkoutContext.fingerprint }, changed), true, "a cached offer result must be invalidated after context changes");
}
assert.equal(shouldInvalidateOfferResult({ contextFingerprint: checkoutContext.fingerprint }, sameCheckoutDifferentNoise), false);
assert.equal(shouldInvalidateOfferResult(null, changedSeats), false, "there is no cached result to invalidate");

const changedEligibility = buildOfferEvaluationContext({
  source: "checkout",
  checkout,
  eligibility: { ...eligibility, monthlyTicketsUsed: 2 },
});
assert.equal(shouldInvalidateOfferResult({ contextFingerprint: checkoutContext.fingerprint }, changedEligibility), true, "eligibility facts must participate in stale-result detection");

const missingSeats = buildOfferEvaluationContext({
  source: "session",
  session: { session: { sessionId: "session-no-seats", exp: "STANDARD" } },
});
assert.equal(missingSeats.ticketCount, null, "missing seats must not use a requested or legacy ticket quantity");

const moduleSource = await readFile(new URL("../src/offers/offerContext.js", import.meta.url), "utf8");
const validatorSource = await readFile(new URL(import.meta.url), "utf8");
assert.doesNotMatch(moduleSource, /[\u2013\u2014]/u, "offer context source must not introduce dash characters");
assert.doesNotMatch(validatorSource, /[\u2013\u2014]/u, "offer context validator must not introduce dash characters");

console.log("Validated canonical checkout, session, booking and browse offer contexts, stable fingerprints, and stale-result invalidation.");
