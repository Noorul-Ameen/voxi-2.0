import assert from "node:assert/strict";
import fs from "node:fs";
import { guardAgentStateClaim } from "../src/lib/agentStateTruth.js";
import { resolveCinemaCandidate } from "../src/lib/cinemaRouting.js";
import { isCheckoutSeatEditTurn } from "../src/lib/checkoutConversationRouting.js";
import { STRINGS } from "../src/i18n/strings.js";
import * as vista from "../src/vistaClient.js";
import { installPublicAssetFetch } from "./lib/installPublicAssetFetch.mjs";

installPublicAssetFetch();

function readNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must remain a named function for behavioral validation`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] !== ")") continue;
    parameterDepth -= 1;
    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.notEqual(parametersEnd, -1, `${name} must have balanced parameters`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const prompt = fs.readFileSync(new URL("../src/lib/voxiSession.js", import.meta.url), "utf8");
const richMedia = fs.readFileSync(new URL("../src/components/RichMedia.jsx", import.meta.url), "utf8");

const cinemas = vista.getCinemas();
const dcc = resolveCinemaCandidate(cinemas, "dcc");
assert.equal(dcc?.id, "0001", "DCC must resolve locally to City Centre Deira instead of leaving the cinema picker open");
assert.equal(resolveCinemaCandidate(cinemas, "dcc tonight")?.id, "0001", "DCC must remain resolvable inside a natural discovery turn");
assert.match(app, /replace\(\/\\bdcc\\b\/giu, cinema\.name\)/, "DCC must be expanded before the agent receives the turn");

const movieGuardSource = readNamedFunction(app, "guardMovieDisplayClaim");
const guardMovieDisplayClaim = Function(`${movieGuardSource}; return guardMovieDisplayClaim;`)();
const falseCinemaMovieClaim = "Great choice! Let's see what's playing at City Centre Deira tonight. Please have a look at the options on your screen.";
assert.equal(
  guardMovieDisplayClaim(falseCinemaMovieClaim, { view: "cinemas", notice: "Which VOX Cinemas UAE location would you like?" }, "en"),
  "Which VOX Cinemas UAE location would you like?",
  "a movie-options claim must be replaced while the cinema picker is the authoritative panel",
);

assert.equal(
  guardAgentStateClaim("What movie would you like to watch?", {
    stage: { view: "discovery", missing: ["date"], question: "What date would you like to go?" },
    locale: "en",
  }),
  "What date would you like to go?",
  "the agent must ask the first locally missing criterion",
);

const checkoutStage = { view: "checkout", order: { checkoutId: "checkout-1", seats: ["E1"], movieTitle: "The Odyssey" } };
const pendingOrder = { checkoutId: "checkout-1", seats: ["E1"], movieTitle: "The Odyssey" };
assert.match(
  guardAgentStateClaim("Your booking for The Odyssey with seat E1 is confirmed. The total is 50 AED.", { stage: checkoutStage, pendingOrder, locale: "en" }),
  /booking is not confirmed yet/i,
  "checkout must never be described as a confirmed booking",
);
assert.match(
  guardAgentStateClaim("Your current booking is confirmed and shown.", { stage: { view: "history" }, locale: "en" }),
  /on-device booking summaries are shown/i,
  "a history response must stay grounded in the visible saved summaries instead of falling back to checkout guidance",
);
assert.match(
  guardAgentStateClaim("I can't change the seats after the booking is confirmed. You'll need a new booking.", { stage: checkoutStage, pendingOrder, locale: "en" }),
  /can change seats before completing checkout/i,
  "seat editing must not be refused while checkout is pending",
);
assert.match(
  guardAgentStateClaim("I've displayed the seat map for The Odyssey.", { stage: checkoutStage, pendingOrder, locale: "en" }),
  /shown in checkout/i,
  "a stale seat-map claim must be aligned with the visible checkout",
);

const savedBooking = {
  view: "booking",
  booking: {
    movieTitle: "The Odyssey",
    ref: "WLTEST1",
    verified: false,
    demo: true,
    paymentStatus: "simulated_not_charged",
    bookingStatus: "summary_saved",
  },
};
for (const claim of [
  "Your booking for The Odyssey is confirmed. The total is 84 AED.",
  "You've selected seats E1 and E3. Please complete your booking on the screen.",
  "Your tickets are ready.",
  "Your reservation is ready.",
  "Use the QR code on screen for admission.",
]) {
  const guarded = guardAgentStateClaim(claim, { stage: savedBooking, locale: "en" });
  assert.match(guarded, /booking summary.*saved on this device/i, "saved summaries must use saved-summary language");
  assert.match(guarded, /no payment was charged/i, "saved summaries must preserve the no-charge boundary");
}
assert.match(
  guardAgentStateClaim("Checkout is displayed. Complete payment.", {
    stage: { view: "seatmap", selectedSeats: ["E1"] },
    locale: "en",
  }),
  /seat map is open/i,
  "checkout must not be claimed while the seat map is authoritative",
);
for (const claim of [
  "To cancel a booking, I need the booking reference. Do you have it?",
  "What is the booking reference you would like to cancel?",
]) {
  assert.equal(
    guardAgentStateClaim(claim, {
      stage: { view: "history", purpose: "cancellation_target_selection", candidateRefs: ["WL1", "WL2"] },
      locale: "en",
    }),
    "Choose one of the current bookings shown, by movie title or booking reference.",
    "multiple displayed cancellation targets must be selectable by title as well as reference",
  );
}
assert.match(
  guardAgentStateClaim("Your selected seats are A1 and A2. The total is AED 50.", {
    stage: checkoutStage,
    pendingOrder,
    locale: "en",
  }),
  /selected seats E1 are shown in checkout/i,
  "claimed checkout seats and totals must match the authoritative order",
);
assert.match(
  guardAgentStateClaim("Your reservation is ready.", {
    stage: { ...savedBooking, booking: { ...savedBooking.booking, cancelled: true, bookingStatus: "cancelled_demo" } },
    locale: "en",
  }),
  /marked cancelled on this device.*no refund was processed/i,
  "a cancelled device summary must retain its cancellation and no-refund boundary",
);
const verifiedClaim = "Your booking is confirmed.";
assert.equal(
  guardAgentStateClaim(verifiedClaim, { stage: { view: "booking", booking: { verified: true, bookingStatus: "confirmed" } }, locale: "en" }),
  verifiedClaim,
  "a provider-verified booking confirmation may pass through unchanged",
);

for (const turn of [
  "edit seats",
  "change my seats",
  "go back",
  "return to the seat map",
  "I want to change seats",
  "Can I edit my seats?",
  "Please change the seats",
  "add one more seat",
  "Change my seats to E1 and E3",
  "remove E3",
  "تعديل المقاعد",
  "ارجع إلى المقاعد",
  "أريد تغيير المقاعد",
]) {
  assert.equal(isCheckoutSeatEditTurn(turn), true, `${turn} must return an active checkout to seat editing`);
}
assert.equal(isCheckoutSeatEditTurn("return to checkout"), false, "return-to-checkout language must remain distinct from edit-seat language");

const ticketSource = readNamedFunction(app, "extractTicketQuantity");
const extractTicketQuantity = Function("MAX_TICKETS", `${ticketSource}; return extractTicketQuantity;`)(10);
assert.equal(extractTicketQuantity("make seat to 2"), 2, "the annotated seat-target wording must resolve to a target of two seats");
assert.equal(extractTicketQuantity("change the number of seats to three"), 3, "a natural seat-count adjustment must remain a conversational target");
assert.equal(extractTicketQuantity("three tickets"), 3, "the original ticket-target wording must remain supported");

const voiceStart = Math.max(app.indexOf("onMessage: async (message) =>"), app.indexOf("onMessage: (message) =>"));
const voiceFlow = app.slice(voiceStart, app.indexOf("onError: (error)", voiceStart));
const textFlow = app.slice(app.indexOf("const sendText"), app.indexOf("const sendUiTurn"));
for (const [name, flow] of [["voice", voiceFlow], ["text", textFlow]]) {
  assert.match(flow, /const checkoutSeatEditTurn =/, `${name} must classify checkout seat-edit turns locally`);
  assert.match(flow, /stageRef\.current\.view !== "checkout"\) restoreActiveCheckout\(\)/, `${name} must restore a hidden checkout before editing seats`);
  assert.ok(flow.indexOf("checkoutSeatEditTurn") < flow.indexOf("resolveVisibleSeatTurn"), `${name} must return to the seat map before resolving a visible seat confirmation`);
}
const checkoutBack = app.slice(app.indexOf("const backToSeatMapFromCheckout"), app.indexOf("const executeCancellationMutation"));
assert.match(checkoutBack, /activeCheckoutStage\(\)\) restoreActiveCheckout\(\)/, "edit seats must also work when another panel temporarily covers checkout");
assert.match(checkoutBack, /requestedSeatTargetRef\.current = requestedTarget[\s\S]*setRequestedSeatTarget\(requestedTarget\)/, "a requested seat target must appear on the restored seat map");

const paymentCompletion = app.slice(app.indexOf("const handlePaid"), app.indexOf("CLIENT TOOLS"));
assert.match(paymentCompletion, /\["stale_checkout", "stale_device_session"\][\s\S]*checkoutPaymentActiveRef\.current = false/, "stale checkout outcomes must release the payment navigation lock");
assert.match(paymentCompletion, /checkout session changed[\s\S]*No payment was taken/i, "stale checkout outcomes must display a no-charge recovery message");
assert.doesNotMatch(paymentCompletion, /sendUiTurn\(`Booking summary/, "completion must not trigger a duplicate agent response after the deterministic summary notice");
const cancellationRouting = app.slice(app.indexOf("const routeCancellationTurn"), app.indexOf("const cancellationResultContext"));
assert.match(cancellationRouting, /const explicitLifecycleTarget = resolution\.matchedBy\?\.length > 0/, "a cancelled or ineligible summary must require an explicit conversational selector");
assert.match(cancellationRouting, /explicitLifecycleTarget && \["ineligible", "already_cancelled"\]/, "generic cancellation must not target a cancelled or ineligible summary");
assert.equal((app.match(/visibleBooking: stageRef\.current\.view === "booking" && isCurrentBooking\(bookingRef\.current\)/g) || []).length, 1, "the exact-reference cancellation tool must ignore a cancelled or past visible summary");
const cancellationCompletion = app.slice(app.indexOf("const executeCancellationMutation"), app.indexOf("const completeCancellation"));
assert.match(cancellationCompletion, /if \(isDemoSimulation\) \{[\s\S]*deterministic system notice already states this outcome/, "device-only cancellation must not elicit a duplicate agent completion after its deterministic notice");

assert.match(prompt, /never describe the pending checkout as confirmed/i, "the voice prompt must prohibit premature checkout confirmation");
assert.match(prompt, /Never call it a confirmed booking, successful payment, reservation, admission ticket, or ready QR/i, "the voice prompt must distinguish a saved summary from a verified booking");
assert.match(prompt, /DCC/i, "the voice prompt must recognize the DCC alias grounding");

assert.match(app, /const VISIBLE_TRANSCRIPT_MESSAGES = 8/, "long transcripts must use a bounded recent-message view");
assert.match(app, /const RICH_STAGE_TRANSCRIPT_MESSAGES = 4/, "rich panels must reserve space by showing a shorter recent transcript");
assert.match(app, /messages\.slice\(-transcriptMessageLimit\)/, "older messages must be collapsed without deleting the full transcript");
assert.match(app, /aria-expanded=\{showFullTranscript\}/, "the full transcript must remain accessible through an explicit control");
assert.match(richMedia, /const visibleMovies = showAll \? movies : movies\.slice\(0, 4\)/, "movie results must begin with a compact progressive list");
assert.match(richMedia, /const visible = key \|\| showAll \? matching : matching\.slice\(0, 6\)/, "the cinema picker must begin with a compact progressive list while retaining search");
for (const locale of ["en", "ar"]) {
  assert.ok(STRINGS[locale]["app.showEarlierMessages"], `${locale} must label the earlier-message control`);
  assert.ok(STRINGS[locale]["app.showRecentMessages"], `${locale} must label the recent-message control`);
}

assert.doesNotMatch(STRINGS.en["app.paymentSimulated"], /environment|prototype|demo|simulation/i, "the saved-summary notice must remain leadership-ready");
assert.match(STRINGS.en["app.paymentSimulated"], /No payment was charged/, "the saved-summary notice must remain transactionally truthful");
assert.doesNotMatch(STRINGS.en["checkout.demoDisclaimer"], /environment|prototype|demo|simulation/i, "checkout safety copy must avoid product-wide implementation labels");

console.log("Validated annotated DCC discovery, transcript truth, checkout seat editing, saved-summary wording, and full-history access for text and voice.");
