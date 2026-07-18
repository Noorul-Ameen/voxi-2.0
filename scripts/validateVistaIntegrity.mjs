import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CINEMAS, DATA_DATES, SESSIONS } from "../src/mockVistaData.js";
import { assessCancellationEligibility } from "../src/lib/cancellationEligibility.js";
import { addCalendarDays } from "../src/lib/demoDates.js";
import { installPublicAssetFetch } from "./lib/installPublicAssetFetch.mjs";
import {
  VISTA_MODE,
  VistaClientError,
  buildSeatPricingPreview,
  buildProgrammingDateFilter,
  deduplicateSessionPresentation,
  demoDate,
  getPricingQuote,
  getLiveProgrammingDates,
  getProgrammingDates,
  getResultMeta,
  getScheduleStatus,
  getScheduledFilms,
  getSeatPlan,
  getSessions,
  getVistaCapabilities,
  parseVistaResultCode,
  parseVistaRefundReference,
  refundBooking,
  reserveSeats,
  searchBooking,
  sourceDateForDemoDate,
} from "../src/vistaClient.js";

installPublicAssetFetch();

const snapshotNow = new Date(`${addCalendarDays(DATA_DATES[0], -1)}T12:00:00Z`);
const expiredDate = addCalendarDays(DATA_DATES.at(-1), 1);
const expiredNow = new Date(`${expiredDate}T12:00:00Z`);
const vistaSource = await readFile(new URL("../src/vistaClient.js", import.meta.url), "utf8");
assert.doesNotMatch(vistaSource, /VITE_VISTA_API_KEY/, "browser source must not read or emit an upstream Vista API key");
assert.doesNotMatch(vistaSource, /RESTBooking\.svc\/booking\/refund/, "refund writes must not use a hard-coded Vista route");
assert.match(vistaSource, /configuredUrl\(ENV\.VITE_VISTA_REFUND_PATH/, "refund writes require an explicit configured proxy path");
for (const malformed of [null, undefined, "", "   ", false, true, {}, [], "0x0", "0e999", "1e-9999", "0.0", 0.5]) {
  assert.equal(parseVistaResultCode(malformed), null, `malformed Vista Result ${JSON.stringify(malformed)} must not be interpreted as success`);
}
assert.equal(parseVistaResultCode(0), 0);
assert.equal(parseVistaResultCode("0"), 0);
assert.equal(parseVistaResultCode(-1), -1);
for (const malformed of [null, undefined, "", "   ", false, true, {}, []]) {
  assert.equal(parseVistaRefundReference(malformed), null, `malformed refund reference ${JSON.stringify(malformed)} must not be accepted`);
}
assert.equal(parseVistaRefundReference("  RF-123  "), "RF-123");
assert.equal(parseVistaRefundReference(123), "123");

assert.equal(VISTA_MODE, "snapshot");
assert.deepEqual(getProgrammingDates({ now: snapshotNow }), DATA_DATES, "fresh snapshot dates remain available");
assert.deepEqual(getProgrammingDates({ now: expiredNow }), [], "expired snapshot dates are not presented as current");
assert.equal(demoDate(expiredNow), expiredDate, "expired demo date stays honest instead of cycling into the past");
assert.equal(sourceDateForDemoDate(expiredDate), null);
assert.equal(getScheduleStatus({ now: expiredNow }).reason, "snapshot_expired");

assert.deepEqual(
  getLiveProgrammingDates({ now: new Date("2026-07-13T20:30:00Z"), days: 3 }),
  ["2026-07-13", "2026-07-14", "2026-07-15"],
  "before 06:00 UAE, the prior programming day remains available for after-midnight sessions",
);
assert.deepEqual(
  getLiveProgrammingDates({ now: new Date("2026-07-14T03:00:00Z"), days: 3 }),
  ["2026-07-14", "2026-07-15", "2026-07-16"],
  "after 06:00 UAE, the availability window starts from the current calendar date",
);

const capabilities = getVistaCapabilities({ now: snapshotNow });
assert.equal(capabilities.demo, true);
assert.equal(capabilities.seats.verified, false);
assert.equal(capabilities.pricing.mode, "static_demo");
assert.equal(capabilities.reservation.mode, "not_applied_demo");
assert.equal(capabilities.refund.verified, false);
assert.equal(capabilities.refund.mode, "not_applied_demo");

const snapshotPricingPreview = buildSeatPricingPreview({ mode: "snapshot" });
assert.deepEqual(snapshotPricingPreview.tiers, { standard: 42, premium: 63 });
assert.equal(snapshotPricingPreview.demo, true, "snapshot prices must be explicitly marked as demo estimates");
assert.equal(snapshotPricingPreview.verified, false);
const liveDemoPricingPreview = buildSeatPricingPreview({ mode: "live", pricingConfigured: false });
assert.equal(liveDemoPricingPreview.mode, "static_demo", "live reads without a pricing adapter retain only the explicit demo estimate");
assert.equal(liveDemoPricingPreview.demo, true);
const liveQuotePreview = buildSeatPricingPreview({ mode: "live", pricingConfigured: true });
assert.equal(liveQuotePreview.mode, "quote_required");
assert.equal(liveQuotePreview.demo, false);
assert.deepEqual(liveQuotePreview.tiers, { standard: null, premium: null }, "configured live pricing must not fabricate pre-quote tier amounts");

const filter = buildProgrammingDateFilter("00'1", "2026-07-14");
assert.match(filter, /CinemaId eq '00''1'/, "OData string values are escaped");
assert.match(filter, /2026-07-14T06:00:00Z/);
assert.match(filter, /2026-07-15T06:00:00Z/);

const fixtureCinema = CINEMAS.find((cinema) => SESSIONS.some((session) => session.CinemaId === cinema.ID));
assert.ok(fixtureCinema, "the snapshot needs at least one cinema with sessions");
const unpublishedDate = addCalendarDays(DATA_DATES.at(-1), 1);
const noFilms = await getScheduledFilms(fixtureCinema.ID, unpublishedDate);
assert.deepEqual(noFilms, []);
assert.equal(getResultMeta(noFilms).empty, true);
assert.equal(getResultMeta(noFilms).reason, "date_not_published");
const expectedCinemaDates = DATA_DATES.filter((date) => SESSIONS.some((session) => (
  session.CinemaId === fixtureCinema.ID && session.SourceProgrammingDate === date
)));
assert.deepEqual(
  getProgrammingDates({ cinemaId: fixtureCinema.ID, now: snapshotNow, includePast: true }),
  expectedCinemaDates,
  "per-cinema dates exactly match the cinema's published programming days",
);

const sourceSession = SESSIONS[0];
assert.ok(sourceSession, "the snapshot needs at least one source session");
const sessionGroup = await getSessions(sourceSession.CinemaId, sourceSession.ScheduledFilmId, sourceSession.SourceProgrammingDate);
const selectableSession = sessionGroup.find((session) => session.sessionIds.includes(String(sourceSession.SessionId)));
assert.ok(selectableSession, "a source session remains selectable after presentation grouping");
assert.equal(selectableSession.isAvailableForOffer, sourceSession.IsAvailableForOffer !== false, "session-level offer availability is retained");
const syntheticAlternate = {
  ...selectableSession,
  sessionId: `${selectableSession.sessionId}-alternate`,
  sessionIds: [`${selectableSession.sessionId}-alternate`],
  alternateSessionIds: [],
  duplicateCount: 0,
};
const duplicateGroup = deduplicateSessionPresentation([selectableSession, syntheticAlternate]);
assert.equal(duplicateGroup.length, 1, "indistinguishable presentation rows are grouped");
assert.deepEqual(duplicateGroup[0].sessionIds, [selectableSession.sessionId, syntheticAlternate.sessionId], "every authoritative source ID remains available");
assert.equal(duplicateGroup[0].sessionId, selectableSession.sessionId, "the stable first source ID remains the selectable ID");
assert.equal(duplicateGroup[0].duplicateCount, 1);

const plan = await getSeatPlan(sourceSession.CinemaId, selectableSession.sessionId);
assert.ok(plan.length > 0);
assert.equal(getResultMeta(plan).mode, "generated_demo");
assert.equal(getResultMeta(plan).verified, false);
assert.match(getResultMeta(plan).warning, /not reserved/i);

const quote = await getPricingQuote(sourceSession.CinemaId, selectableSession.sessionId, [{ id: "A1" }, { id: "G1", premium: true }]);
assert.equal(quote.total, 105);
assert.equal(quote.demo, true);
assert.equal(quote.verified, false);

const reservation = await reserveSeats({ cinemaId: sourceSession.CinemaId, sessionId: selectableSession.sessionId, seats: ["A1", "A2"] });
assert.equal(reservation.reserved, false);
assert.equal(reservation.applied, false);
assert.equal(reservation.reason, "demo_inventory_not_reserved");

const fixture = await searchBooking("wl59lfj");
assert.equal(fixture.ref, "WL59LFJ");
assert.equal(fixture.dataMode, "snapshot_demo");
assert.equal(fixture.verified, false);
const demoRefund = await refundBooking(fixture.ref);
assert.equal(demoRefund.applied, false);
assert.equal(demoRefund.demo, true);
assert.equal(demoRefund.verified, false);
assert.match(demoRefund.ErrorDescription, /DEMO_ONLY/);
const unverifiedIneligibleRefund = await refundBooking("LOCAL-DEMO", {
  booking: { ref: "LOCAL-DEMO", demo: true, verified: false, date: "2026-07-01", showtime: "10:00" },
  now: snapshotNow,
  requireLocalEligibility: true,
});
assert.equal(unverifiedIneligibleRefund.applied, false, "an unverified local booking can never reach a refund write");
assert.equal(unverifiedIneligibleRefund.verified, false);

await assert.rejects(
  () => getScheduledFilms("0002", "not-a-date"),
  (error) => error instanceof VistaClientError && error.code === "INVALID_PROGRAMMING_DATE",
);

const eligibleBooking = {
  ref: "FUTURE",
  date: "2026-07-15",
  showtime: "20:00",
  providerEligibilityVerified: true,
};
assert.equal(assessCancellationEligibility(eligibleBooking, { now: new Date("2026-07-15T12:00:00+04:00") }).status, "eligible");
assert.equal(assessCancellationEligibility({ ...eligibleBooking, providerEligibilityVerified: false }, { now: new Date("2026-07-15T12:00:00+04:00") }).status, "review_required");
assert.equal(assessCancellationEligibility(eligibleBooking, { now: new Date("2026-07-15T19:30:00+04:00") }).reason, "cutoff_passed");
assert.equal(assessCancellationEligibility({ ...eligibleBooking, ticketScanned: true }, { now: new Date("2026-07-15T12:00:00+04:00") }).reason, "ticket_scanned");

console.log("Validated honest snapshot expiry, date-scoped Vista filters, empty-result metadata, session presentation grouping, explicit demo capabilities, verified-mutation contracts, and cancellation policy checks.");
