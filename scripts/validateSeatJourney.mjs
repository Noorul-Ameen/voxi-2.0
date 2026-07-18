import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeSeatIds, resolveSeatSelectionTurn, resolveSeatToolInput } from "../src/lib/seatRouting.js";

const available = ["A1", "A2", "E1", "E2", "H12"];

assert.deepEqual(normalizeSeatIds("A1 and A2", available), ["A1", "A2"]);
assert.deepEqual(normalizeSeatIds("E one and E two", available), ["E1", "E2"], "voice number words must resolve against real seat IDs");
assert.deepEqual(normalizeSeatIds("H twelve", available), ["H12"]);
assert.deepEqual(normalizeSeatIds(["A one", "A two"], available), ["A1", "A2"]);
assert.deepEqual(resolveSeatToolInput(undefined, { availableSeatIds: available, currentSeats: ["A1"] }).seats, ["A1"], "an omitted tool argument must use the tapped seat");
assert.deepEqual(resolveSeatToolInput(["Z99"], { availableSeatIds: available, currentSeats: ["A1"] }), { provided: true, seats: [], invalidSeats: ["Z99"] }, "an explicit invalid seat must never silently confirm a tapped seat");
assert.deepEqual(resolveSeatToolInput(["A9"], { availableSeatIds: available, currentSeats: ["A1"] }), { provided: true, seats: [], invalidSeats: ["A9"] }, "an explicit unavailable seat must never silently confirm a tapped seat");
assert.deepEqual(resolveSeatToolInput(["A1", "Z99"], { availableSeatIds: available, currentSeats: [] }), { provided: true, seats: ["A1"], invalidSeats: ["Z99"] }, "mixed valid and invalid labels must preserve the invalid label for rejection");

assert.deepEqual(
  resolveSeatSelectionTurn("These are the seats I want", { availableSeatIds: available, currentSeats: ["A1"] }),
  {
    requested: true,
    confirmation: true,
    explicitSeats: [],
    invalidSeats: [],
    seats: ["A1"],
    reason: null,
  },
  "a natural confirmation must use the seats already tapped in the widget",
);

assert.deepEqual(
  resolveSeatSelectionTurn("هذه هي المقاعد التي أريدها", { availableSeatIds: available, currentSeats: ["E1", "E2"] }).seats,
  ["E1", "E2"],
  "Arabic confirmation must use the same visible seat selection",
);
assert.deepEqual(resolveSeatSelectionTurn("yes", { availableSeatIds: available, currentSeats: ["A1"] }).seats, ["A1"], "a short affirmative must confirm tapped seats while the seat map is active");
assert.deepEqual(resolveSeatSelectionTurn("Yes.", { availableSeatIds: available, currentSeats: ["A1"] }).seats, ["A1"], "voice transcript punctuation must not block a short confirmation");
assert.deepEqual(resolveSeatSelectionTurn("continue, please", { availableSeatIds: available, currentSeats: ["A1"] }).seats, ["A1"], "a narrow polite suffix must remain a seat confirmation");
assert.deepEqual(resolveSeatSelectionTurn("متابعة", { availableSeatIds: available, currentSeats: ["E1"] }).seats, ["E1"], "an Arabic continue command must confirm tapped seats");
assert.deepEqual(resolveSeatSelectionTurn("نعم، من فضلك.", { availableSeatIds: available, currentSeats: ["E1"] }).seats, ["E1"], "Arabic transcript punctuation and a polite suffix must remain a seat confirmation");
assert.deepEqual(resolveSeatSelectionTurn("A1 and Z99", { availableSeatIds: available }).invalidSeats, ["Z99"], "local text/voice routing must reject mixed unavailable labels instead of silently dropping them");
assert.equal(resolveSeatSelectionTurn("yes", { availableSeatIds: available }).requested, false, "a global yes without a visible selection must not be intercepted");
assert.equal(resolveSeatSelectionTurn("Is A1 available?", { availableSeatIds: available }).requested, false, "an availability question must not confirm a seat");
assert.equal(resolveSeatSelectionTurn("confirm seats", { availableSeatIds: available }).reason, "no_selected_seats");

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const prompt = fs.readFileSync(new URL("../src/lib/voxiSession.js", import.meta.url), "utf8");
const voiceStart = Math.max(app.indexOf("onMessage: async (message) =>"), app.indexOf("onMessage: (message) =>"));
const voiceFlow = app.slice(voiceStart, app.indexOf("onError:", voiceStart));
const typedFlow = app.slice(app.indexOf("const sendText"), app.indexOf("const sendUiTurn"));
for (const [label, flow] of [["voice", voiceFlow], ["typed", typedFlow]]) {
  assert.match(flow, /resolveVisibleSeatTurn\(/, `${label} must recognize seat labels and visible-seat confirmation locally`);
  assert.match(flow, /routeSeatSelectionTurn\(/, `${label} must advance through the protected select_seats tool`);
  assert.match(flow, /seatSelectionResultContext\(/, `${label} must tell the agent which stage is actually rendered`);
}

const finalizeSeats = app.slice(app.indexOf("const finalizeSeats"), app.indexOf("const handlePaid"));
const clearSeatSelection = app.slice(app.indexOf("const clearSeatSelection"), app.indexOf("const refreshSeatQuote"));
assert.match(clearSeatSelection, /clearPendingOrder\(\)[\s\S]*seatsRef\.current = \[\][\s\S]*setSelectedSeats\(\[\]\)[\s\S]*setSeatQuote\(null\)/, "the central upstream invalidator must clear actual seats, checkout, and pricing");
assert.match(finalizeSeats, /seatsRef\.current = \[\.\.\.valid\][\s\S]*setSelectedSeats\(\[\.\.\.valid\]\)/, "confirmed seat state must stay synchronized with checkout and Back navigation");
assert.match(finalizeSeats, /sameSeatSelection\(seatsRef\.current, valid\)/, "a stale quote must not commit changed seats");
assert.doesNotMatch(finalizeSeats, /expectedQuantity|quantity_mismatch|ticketQuantityRef/, "a requested target must never gate pricing or confirmation");
assert.match(finalizeSeats, /ticketQuantity:\s*valid\.length/, "checkout ticket count must be derived from confirmed seats");
assert.match(finalizeSeats, /catch \(error\) \{[\s\S]{0,180}!selectionIsCurrent\(\)[\s\S]{0,100}stale: true/, "an abandoned pricing error must be treated as stale rather than rendered on a newer panel");

const selectSeats = app.slice(app.indexOf("select_seats: async"), app.indexOf("show_booking_summary:"));
const sharedSeatConfirmation = app.slice(app.indexOf("const priceSeatSelection"), app.indexOf("const handlePaid"));
const touchSeatConfirmation = app.slice(app.indexOf("const confirmSeats"), app.indexOf("const completeCancellation"));
assert.match(selectSeats, /resolveSeatToolInput\(seats, \{ availableSeatIds, currentSeats: seatsRef\.current \}\)/, "the client tool must use the tested invalid-seat/fallback resolver");
assert.match(selectSeats, /invalidSeats\.length[\s\S]*invalid or unavailable/, "explicit invalid or unavailable seats must fail before pricing");
assert.match(sharedSeatConfirmation, /seatConfirmationInFlightRef\.current\.get\(key\)[\s\S]*seatConfirmationInFlightRef\.current\.set\(key, trackedPromise\)/, "identical confirmations must share one pricing operation");
assert.match(selectSeats, /await priceSeatSelection\(ids\)/, "text and voice confirmations must use the shared pricing operation");
assert.match(touchSeatConfirmation, /await priceSeatSelection\(seats\)/, "touch confirmation must share the same pricing operation as text and voice");
assert.match(touchSeatConfirmation, /const backFromSeatMap[\s\S]*clearSeatSelection\(\)[\s\S]*showStage\(\{ view: "showtimes"/, "seat-map Back must synchronously clear seats, pricing, checkout, and leave the seat map");
assert.match(touchSeatConfirmation, /used Back from the seat map[\s\S]*no seat confirmation or checkout is active/, "seat-map Back must synchronize the rendered showtime state with the voice agent");
assert.match(selectSeats, /completedOrder\?\.checkoutId && sameSeatSelection\(ids, completedOrder\.seats/, "a duplicate confirmation completing behind another quote must reuse the rendered checkout result");
assert.match(app, /result\.currentView === "seatmap"[\s\S]*do not say the seat map remains visible/, "stale confirmation messaging must reflect the panel actually rendered after Back");
assert.match(selectSeats, /stageRef\.current\.view === "checkout"[\s\S]*alreadyConfirmed:\s*true/, "duplicate seat tools must be idempotent once checkout is visible");
assert.match(app, /visibleStageView === "checkout" && stage\.order && pendingOrder\?\.checkoutId === stage\.order\.checkoutId/, "a checkout may render only while its matching order is active and visible");
assert.match(prompt, /confirmed select_seats result means checkout is displayed; it does not mean payment or booking confirmation/, "the agent must not turn seat confirmation into a fake booking or reference");
assert.doesNotMatch(app, /TicketQuantityControl|ticketQuantityRef|quantity_mismatch/, "the separate ticket quantity stage and exact-count gate must be removed");
assert.match(app, /current\.length >= MAX_TICKETS/, "seat selection must be limited only by the booking maximum");
assert.match(app, /const backToSeatMapFromCheckout[\s\S]*restoredSeats[\s\S]*view:\s*"seatmap"/, "checkout Back must restore the editable seat map and its selected seats");

console.log("Validated deterministic text/voice seat routing, short and tapped-seat confirmation, invalid-seat rejection, quote-race idempotency, and truthful booking progression.");
