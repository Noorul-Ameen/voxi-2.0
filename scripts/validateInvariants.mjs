import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const transport = fs.readFileSync(new URL("../src/components/ElevenLabsTransport.jsx", import.meta.url), "utf8");
const rich = fs.readFileSync(new URL("../src/components/RichMedia.jsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const fuzzy = fs.readFileSync(new URL("../src/lib/fuzzyResolvers.js", import.meta.url), "utf8");
const vista = fs.readFileSync(new URL("../src/vistaClient.js", import.meta.url), "utf8");

const originalTools = [
  "show_movie_selection",
  "show_showtimes",
  "show_seat_map",
  "select_seats",
  "show_booking_summary",
  "show_booking_for_cancellation",
];
for (const name of [...originalTools, "show_offers", "handover_to_agent"]) {
  assert.match(app, new RegExp(`^\\s{4}${name}:`, "m"), `${name} must remain registered`);
}

assert.match(transport, /serverLocation:\s*"eu-residency"/);
assert.match(app, /connectionType:\s*"webrtc"/);
assert.match(app, /agentId:\s*import\.meta\.env\.VITE_AGENT_ID/);
assert.match(app, /maxWidth:\s*420/);
assert.match(app, /resolveFilm/);
assert.match(app, /resolveSession/);
assert.match(fuzzy, /firstWord/);
assert.match(app, /showtimeRequired/);

const seatMapSegment = app.slice(app.indexOf("show_seat_map:"), app.indexOf("select_seats:"));
assert.doesNotMatch(seatMapSegment, /new Promise/, "show_seat_map must remain non-blocking");
const cancellationSegment = app.slice(app.indexOf("show_booking_for_cancellation:"), app.indexOf("show_offers:"));
assert.doesNotMatch(cancellationSegment, /new Promise/, "cancellation tools must return phase state promptly so text, voice, and touch can share one confirmation UI");
assert.match(cancellationSegment, /confirmationRequired:\s*true[\s\S]*phase:\s*"final_confirmation"/, "device cancellation must return an explicit final-confirmation phase");
assert.match(cancellationSegment, /confirmationRequired:\s*true[\s\S]*phase:\s*"route_confirmation"/, "verified cancellation must return an explicit refund-route phase");
const cinemaPickerSegment = app.slice(app.indexOf("const openCinemaPicker"), app.indexOf("const chooseCinema"));
const historyPickerSegment = app.slice(app.indexOf("const openHistory"), app.indexOf("const openOffers"));
assert.doesNotMatch(cinemaPickerSegment, /clearPendingOrder/, "opening the cinema picker must preserve an in-progress checkout");
assert.doesNotMatch(historyPickerSegment, /clearPendingOrder/, "opening booking history must preserve an in-progress checkout");
assert.match(app.slice(app.indexOf("const chooseCinema"), app.indexOf("const openHistory")), /clearSeatSelection/, "choosing a new cinema must abandon the previous seats, quote, and checkout");
assert.doesNotMatch(app.slice(app.indexOf("const selectHistoryBooking"), app.indexOf("const toggleSeat")), /clearPendingOrder/, "opening a historical booking must preserve a resumable checkout");
assert.match(rich, /dir="ltr"/);
assert.match(main, /class ErrorBoundary/);
assert.match(main, /<I18nProvider>/);
assert.match(vista, /requestedRef\.toUpperCase\(\) !== String\(BOOKING\.BookingId\)\.toUpperCase\(\)/, "unknown demo booking references must not resolve to the fixture");

console.log("Validated protected ElevenLabs, tool, fuzzy-resolution, error-boundary, RTL-seat, and 420px invariants.");
