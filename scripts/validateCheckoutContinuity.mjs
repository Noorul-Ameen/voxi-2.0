import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STRINGS } from "../src/i18n/strings.js";
import { isResumeCheckoutTurn } from "../src/lib/pausedJourneyRouting.js";
import {
  createDiscoveryPreferences,
  extractDiscoveryPreferencePatch,
  mergeDiscoveryPreferences,
  shouldTreatAsDiscoveryFilterTurn,
} from "../src/lib/discoveryPreferences.js";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const checkout = await readFile(new URL("../src/components/Checkout.jsx", import.meta.url), "utf8");

function sliceBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${label}: missing start marker ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `${label}: missing end marker ${endNeedle}`);
  return source.slice(start, end);
}

function sliceConstDeclaration(source, name, label) {
  const startNeedle = `const ${name}`;
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${label}: missing declaration ${startNeedle}`);
  const lineStart = source.lastIndexOf("\n", start) + 1;
  const indentation = source.slice(lineStart, start);
  const escapedIndentation = indentation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextDeclaration = new RegExp(`\\n${escapedIndentation}const\\s+`, "g");
  nextDeclaration.lastIndex = start + startNeedle.length;
  const match = nextDeclaration.exec(source);
  assert.ok(match, `${label}: missing following declaration boundary`);
  return source.slice(start, match.index);
}

for (const phrase of [
  "Return to checkout",
  "Back to payment",
  "Continue checkout",
  "Checkout again",
  "العودة إلى الدفع",
  "متابعة عملية الدفع",
  "صفحة الدفع مرة أخرى",
]) {
  assert.equal(isResumeCheckoutTurn(phrase), true, `must resume checkout for: ${phrase}`);
}
for (const phrase of [
  "Continue",
  "What payment offers are available?",
  "Can I get a refund?",
  "Change the cinema",
]) {
  assert.equal(isResumeCheckoutTurn(phrase), false, `must not resume checkout for: ${phrase}`);
}

const restoreCheckout = sliceConstDeclaration(app, "restoreActiveCheckout", "active checkout restoration");
const activeCheckout = sliceConstDeclaration(app, "activeCheckoutStage", "active checkout identity");
assert.match(activeCheckout, /pendingOrderRef\.current/, "checkout restoration must use the current pending order");
assert.match(activeCheckout, /checkoutId/, "checkout restoration must verify the exact checkout identity");
assert.match(activeCheckout, /snapshot\.order\?\.checkoutId\s*!==\s*order\.checkoutId/, "checkout restoration must reject a stale saved stage");
assert.match(restoreCheckout, /activeCheckoutStage\(\)/, "checkout restoration must pass through the exact-order identity guard");
assert.match(activeCheckout, /view:\s*["']checkout["']/, "the verified saved stage must be normalized back to checkout");
assert.match(restoreCheckout, /showStage\(checkout\)/, "checkout restoration must reopen the verified checkout stage");
assert.match(restoreCheckout, /return (?:true|false)/, "checkout restoration must report whether restoration succeeded");

const resumableCheckoutRefs = [...`${activeCheckout}\n${restoreCheckout}`.matchAll(/\b([\w$]*checkout[\w$]*Ref)\.current/gi)]
  .map((match) => match[1])
  .filter((name) => name !== "pendingOrderRef" && !/payment|authoriz/i.test(name));
assert.ok(resumableCheckoutRefs.length > 0, "checkout restoration must use a saved checkout-stage reference, not reconstruct unrelated state");
const resumableCheckoutRef = resumableCheckoutRefs[0];

const clearPendingOrder = sliceBetween(app, "const clearPendingOrder", "const clearSeatSelection", "pending checkout cleanup");
assert.match(clearPendingOrder, /checkoutPaymentActiveRef\.current[\s\S]*return false/, "active payment authorization must prevent any route from clearing its pending order");
assert.match(clearPendingOrder, /pendingOrderRef\.current\s*=\s*null[\s\S]*setPendingOrder\(null\)/, "pending checkout cleanup must clear ref and React state");
assert.match(clearPendingOrder, new RegExp(`${resumableCheckoutRef}\\.current\\s*=\\s*null`), "pending checkout cleanup must also clear the saved checkout stage");

const finalizeSeats = sliceBetween(app, "const finalizeSeats", "const seatConfirmationKey", "seat checkout creation");
assert.match(finalizeSeats, new RegExp(`${resumableCheckoutRef}\\.current\\s*=`), "confirmed seat pricing must save the exact checkout stage for later restoration");
assert.match(finalizeSeats, /checkoutId[\s\S]*showStage\(/, "saved checkout restoration must be tied to the newly priced order");

const voicePath = sliceBetween(app, "onMessage: async (message) =>", "onError: (error)", "voice transcript route");
const textPath = sliceBetween(app, "const sendText", "const sendUiTurn", "typed transcript route");
for (const [label, source, messageVariable] of [
  ["voice", voicePath, "safeMessage"],
  ["text", textPath, "value"],
]) {
  assert.match(source, new RegExp(`pausedResumeTarget\\(${messageVariable}\\)`), `${label} routing must classify explicit paused-step restoration`);
  assert.match(source, /restorePausedJourney\(/, `${label} routing must restore and revalidate the exact paused checkout`);
  assert.ok(
    source.indexOf("restorePausedJourney(") < source.indexOf("routeDiscoveryTurn"),
    `${label} checkout restoration must happen before discovery can replace the panel`,
  );
}

const faqPreparation = sliceBetween(app, "const prepareFaqContext", "useEffect(() =>", "FAQ preparation");
assert.doesNotMatch(faqPreparation, /showStage\(/, "FAQ retrieval must not mutate the stored rich step");
assert.match(faqPreparation, /preserveBookingIntent[\s\S]*["']checkout["']/, "FAQ handling must preserve checkout booking intent");
assert.doesNotMatch(app, /function FaqPanel|stage\.view === ["']faq["']/, "FAQ answers must remain in the transcript instead of replacing checkout");
assert.match(app, /pauseRenderingForUnrelatedTurn[\s\S]*pauseRichRenderingForTopicChange/, "an unrelated FAQ must hide the old rich panel while preserving it for restoration");

const faqSignal = extractDiscoveryPreferencePatch("Is IMAX wheelchair accessible?");
assert.equal(
  shouldTreatAsDiscoveryFilterTurn("Is IMAX wheelchair accessible?", { view: "checkout", signal: faqSignal }),
  false,
  "an experience FAQ during checkout must not become a booking criteria change",
);

const mainRender = sliceBetween(app, "<main ref={scrollRef}", "</main>", "main checkout rendering");
assert.match(mainRender, /pendingOrder[\s\S]{0,2400}checkout\.resume|checkout\.resume[\s\S]{0,2400}pendingOrder/, "a pending checkout must expose a persistent resume affordance outside checkout");
assert.match(mainRender, /role=["']region["']/, "the pending checkout affordance must be a named region");
assert.match(mainRender, /aria-label=\{t\(["']checkout\.resume["']\)\}/, "the pending checkout region must have a localized accessible name");
assert.match(mainRender, /onClick=\{\(\) => \{ void restorePausedJourney\(\{ target: "checkout", source: "ui" \}\); \}\}/, "the visible resume action must use revalidated paused-checkout restoration");
assert.match(mainRender, /<button\b[\s\S]{0,900}t\(["']checkout\.resume["']\)/, "the pending checkout affordance must include a visible localized action");

for (const locale of ["en", "ar"]) {
  const resumeCopy = STRINGS[locale]["checkout.resume"];
  assert.equal(typeof resumeCopy, "string", `${locale}: checkout.resume must exist`);
  assert.ok(resumeCopy.trim(), `${locale}: checkout.resume must not be empty`);
  assert.doesNotMatch(resumeCopy, /[\u2013\u2014]/u, `${locale}: checkout.resume must not contain an en dash or em dash`);
}

const basePreferences = createDiscoveryPreferences({
  cinemaId: "0002",
  cinemaName: "Mall of the Emirates",
  date: "2026-07-17",
  preferredTime: "18:00",
  movieId: "movie-a",
  movieTitle: "Movie A",
  experience: "STANDARD",
});
for (const [criterion, patch] of [
  ["cinema", { cinemaId: "0012", cinemaName: "Yas Mall" }],
  ["date", { date: "2026-07-18" }],
  ["preferred time", { preferredTime: "20:00" }],
  ["movie", { movieId: "movie-b", movieTitle: "Movie B" }],
  ["experience", { experience: "IMAX" }],
]) {
  const changed = mergeDiscoveryPreferences(basePreferences, { patch });
  assert.equal(changed.invalidates.sessionSelection, true, `${criterion} changes must invalidate the selected showtime`);
  assert.equal(changed.invalidates.seatSelection, true, `${criterion} changes must invalidate selected seats`);
  assert.equal(changed.invalidates.pricing, true, `${criterion} changes must invalidate checkout pricing`);
}

const preferenceCommit = sliceBetween(app, "const commitDiscoveryPreferences", "const applyDiscoveryPreferencesFromText", "criteria invalidation integration");
assert.match(preferenceCommit, /invalidates\.seatSelection[\s\S]*clearSeatSelection\(\)/, "criteria invalidation must clear seats, pricing, and the resumable checkout");
const sessionSelection = sliceBetween(app, "const pickSession", "const openCinemaPicker", "showtime selection");
assert.match(sessionSelection, /clearSeatSelection\(\)/, "choosing a showtime must clear any previous checkout before building a new seat map");
const movieSelection = sliceBetween(app, "const pickMovie", "const pickSession", "movie selection");
assert.match(movieSelection, /clearSeatSelection\(\)/, "choosing a movie must clear any previous checkout before loading showtimes");
const cinemaSelection = sliceBetween(app, "const chooseCinema", "const chooseDate", "cinema selection");
assert.match(cinemaSelection, /clearSeatSelection\(\)/, "choosing a different cinema must invalidate the previous checkout");
const dateSelection = sliceBetween(app, "const chooseDate", "const restoreHistoryReturn", "date selection");
assert.match(dateSelection, /(?:applyProgrammingDate|clearSeatSelection)\(/, "choosing a date must invalidate the previous checkout");

for (const [label, source] of [
  ["cinema picker", sliceBetween(app, "const openCinemaPicker", "const chooseCinema", "cinema picker")],
  ["booking history", sliceBetween(app, "const openHistory", "const openOffers", "booking history")],
  ["offer panel", sliceBetween(app, "show_offers: async", "handover_to_agent:", "offer panel")],
  ["booking detail", sliceBetween(app, "const selectHistoryBooking", "const cancelHistoryBooking", "booking detail")],
]) {
  assert.doesNotMatch(source, /clearPendingOrder\(\)|clearSeatSelection\(\)/, `${label} is a temporary side panel and must retain a valid checkout for resume`);
}

const editSeats = sliceBetween(app, "const backToSeatMapFromCheckout", "const executeCancellationMutation", "checkout edit seats");
assert.match(editSeats, /restoredSeats\s*=\s*\[\.\.\.\(order\.seats/, "Edit seats must restore the exact checkout seats");
assert.match(editSeats, /clearPendingOrder\(\)/, "editing seats must invalidate the old checkout total before repricing");
assert.match(editSeats, /view:\s*["']seatmap["']/, "Edit seats must return to the seat map");

const paymentCompletion = sliceBetween(app, "const handlePaid", "CLIENT TOOLS", "payment completion");
const successfulPayment = paymentCompletion.slice(paymentCompletion.indexOf("setBookings(readBookings())"));
assert.match(successfulPayment, /clearPendingOrder\(\)/, "successful payment must remove the resumable checkout");

assert.match(checkout, /onPaymentStateChange/, "checkout must report active authorization state to its parent");
assert.match(checkout, /onPaymentStateChange\?\.\(true\)/, "checkout must lock panel navigation when authorization starts");
assert.match(checkout, /onPaymentStateChange\?\.\(false\)/, "checkout must release the navigation lock when authorization settles or is cancelled");
assert.ok((checkout.match(/onPaymentStateChange\?\.\(false\)/g) || []).length >= 2, "checkout must release its payment lock on both completion and cancellation or cleanup");
const stageTransition = sliceBetween(app, "const showStage", "const commitDiscoveryPreferences", "stage transition guard");
assert.match(stageTransition, /checkoutPaymentActiveRef\.current/, "stage transitions must inspect active payment authorization");
assert.match(stageTransition, /stageRef\.current\??\.view\s*===\s*["']checkout["'][\s\S]*next\.view\s*!==\s*["']checkout["']/, "active authorization must block displacement from checkout");
assert.match(mainRender, /<Checkout\b[\s\S]{0,1200}onPaymentStateChange=/, "App must connect checkout authorization state to the displacement guard");

console.log("Validated checkout continuity: FAQ hiding with preserved state, exact EN/AR text and voice resume, checkout revalidation, intentional invalidation, edit-seat repricing, payment lock, and completion cleanup.");
