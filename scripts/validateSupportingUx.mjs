import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEMO_CARD_STORAGE_KEY,
  isLuhnValid,
  isValidDemoExpiry,
  sanitizeStoredCardMetadata,
  toStoredCardMetadata,
} from "../src/checkoutSafety.js";
import {
  FALLBACK_EXPERIENCE_MEDIA,
  getExperienceMedia,
  getSupportedImageUrl,
} from "../src/mediaData.js";
import { STRINGS } from "../src/i18n/strings.js";

assert.equal(isLuhnValid("4111 1111 1111 1111"), true, "the documented preview card must pass Luhn validation");
assert.equal(isLuhnValid("4111 1111 1111 1112"), false, "invalid test PAN must fail Luhn validation");
const july2026 = new Date(2026, 6, 13, 12, 0, 0);
assert.equal(isValidDemoExpiry("12/30", july2026), true);
assert.equal(isValidDemoExpiry("07/26", july2026), true, "cards remain valid through the stated expiry month");
assert.equal(isValidDemoExpiry("06/26", july2026), false, "expiry validation must reject an elapsed month");
assert.equal(isValidDemoExpiry("12/25", july2026), false, "expiry validation must reject an elapsed year");
assert.equal(isValidDemoExpiry("13/30", july2026), false, "expiry validation must reject invalid months");

const metadata = toStoredCardMetadata({ pan: "4111 1111 1111 1111", cvv: "123", name: "Test Guest", exp: "12/30" }, "demo-test");
assert.deepEqual(Object.keys(metadata).sort(), ["brand", "exp", "id", "last4", "name"], "stored cards may contain display metadata only");
assert.equal(metadata.last4, "1111");
assert.doesNotMatch(JSON.stringify(metadata), /4111111111111111|"cvv"|"pan"/i, "PAN and security code must not survive metadata conversion");
assert.deepEqual(
  Object.keys(sanitizeStoredCardMetadata({ ...metadata, pan: "4111111111111111", cvv: "123" })).sort(),
  ["brand", "exp", "id", "last4", "name"],
  "storage hydration must strip injected sensitive fields",
);
assert.match(DEMO_CARD_STORAGE_KEY, /demo/i);

const checkoutSource = await readFile(new URL("../src/components/Checkout.jsx", import.meta.url), "utf8");
assert.doesNotMatch(checkoutSource, /Noorul|DEFAULT_CARDS|["']vox_cards["']/, "checkout must not seed personal or legacy default cards");
assert.doesNotMatch(checkoutSource, /VITE_VISTA_BASE/, "Vista read-data configuration must not change checkout behavior");
assert.match(checkoutSource, /return "demo";/, "checkout must default explicitly to simulation mode");
assert.match(checkoutSource, /checkoutMode !== "demo"/, "simulated authorization must be gated to demo mode");
assert.match(checkoutSource, /paymentStartedRef\.current/, "checkout must guard against duplicate payment attempts");
assert.match(checkoutSource, /clearSensitiveForm\(false\)/, "checkout must clear sensitive form data during unmount cleanup");
assert.match(checkoutSource, /clearTimers\(\)/, "checkout must clear pending authorization timers");
assert.match(checkoutSource, /onPaid\?\.\(\{ method, label, checkoutId \}\)/, "payment completion may expose only a safe method label and checkout id");
assert.doesNotMatch(checkoutSource, /\bfetch\s*\(|axios|sendText|sendContextualUpdate|clientTools/, "payment fields must never be sent from the checkout component");
assert.match(checkoutSource, /clearSensitiveForm\(\)/, "sensitive form state must be cleared after use");

assert.ok(getSupportedImageUrl(FALLBACK_EXPERIENCE_MEDIA), "experience fallback artwork must have a renderable URL");
assert.equal(getExperienceMedia("UNKNOWN EXPERIENCE"), FALLBACK_EXPERIENCE_MEDIA, "unknown experiences must use fallback artwork");
assert.equal(getExperienceMedia("UNKNOWN EXPERIENCE", "javascript:alert(1)"), FALLBACK_EXPERIENCE_MEDIA, "invalid session artwork must fall back safely");

const richMediaSource = await readFile(new URL("../src/components/RichMedia.jsx", import.meta.url), "utf8");
const historySource = await readFile(new URL("../src/components/BookingHistory.jsx", import.meta.url), "utf8");
const qrSource = await readFile(new URL("../src/components/BookingQRCode.jsx", import.meta.url), "utf8");
const handoverSource = await readFile(new URL("../src/components/HandoverPanel.jsx", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const key of ["booking.cinema", "booking.performance", "booking.status"]) assert.match(richMediaSource, new RegExp(key.replace(".", "\\.")), `${key} must be shown on booking confirmation`);
for (const field of ["cinemaName", "booking.date", "history.cancelled", "history.active"]) assert.match(historySource, new RegExp(field.replace(".", "\\.")), `${field} must be represented in booking history`);
assert.match(historySource, /const current = isCurrentBooking\(booking\)/, "booking history must classify each record using the shared current-booking rules");
assert.match(historySource, /: !current\s*\? t\("history\.past"\)/, "elapsed records must be labelled as past shows");
assert.match(historySource, /\{current && cancelBooking && \(/, "only current bookings may expose the cancellation action");
assert.match(richMediaSource, /booking\.performanceDate\s*\|\|\s*booking\.sourceDate\s*\|\|\s*booking\.date/, "booking cards must prefer the actual performance date and retain after-midnight source dates");
assert.match(historySource, /booking\.performanceDate\s*\|\|\s*booking\.sourceDate\s*\|\|\s*booking\.date/, "booking history must use the actual performance date fallback chain");
assert.match(richMediaSource, /m\.language\s*\|\|\s*""/, "movie cards must show language even when runtime is present");
assert.match(qrSource, /booking\.qrDemoHint/, "reference QR codes must direct guests to their official VOX ticket for entry");
assert.match(qrSource, /const providerQrValue =/, "verified bookings must require an explicit provider admission QR payload");
assert.match(qrSource, /if \(!qrValue\)/, "a verified booking without a provider QR payload must not encode its bare reference as an entry ticket");
assert.match(richMediaSource, /booking\.noRefundProcessed/, "device-only cancellation must not claim that a refund was initiated");
assert.match(richMediaSource, /pricing\?\.tiers\?\.standard/, "seat prices must come from pricing metadata");
assert.match(richMediaSource, /seats\.demoEstimateLabel/, "estimated seat totals must defer final pricing to checkout");
assert.match(richMediaSource, /seats\.quoteRequiredLabel/, "live pricing must remain pending until a quote is returned");
assert.doesNotMatch(richMediaSource, /\?\s*63\s*:\s*42/, "the seat map must not hard-code pre-quote tier prices");
assert.match(richMediaSource, /s\.availabilityVerified === true[\s\S]*showtimes\.seats[\s\S]*showtimes\.previewAvailability/, "snapshot showtimes must not present generated seat counts as live inventory");
assert.match(appSource, /<Showtimes[^>]+error=\{stage\.error\}[^>]+onRetry=/, "a failed showtime request must render a scoped retry action");
assert.doesNotMatch(appSource, /app\.(?:text|voice)Connected/, "transport readiness must not be added to customer chat");
for (const key of [
  "common.retry", "movies.empty", "movies.error", "showtimes.empty", "showtimes.error", "showtimes.previewAvailability",
  "seats.empty", "seats.error", "seats.demoNotice", "seats.standardEstimate", "seats.premiumEstimate",
  "seats.standardQuoteRequired", "seats.premiumQuoteRequired", "seats.demoPricingNotice",
  "seats.quoteRequiredNotice", "seats.demoEstimateLabel", "seats.quoteRequiredLabel", "checkout.testOnly", "checkout.liveUnavailable",
  "booking.demoConfirmed", "booking.cancelledLocal", "booking.noRefundProcessed", "booking.qrDemoHint", "booking.qrReferenceOnly",
  "history.demo", "history.cancelledLocal", "history.past", "app.paymentSimulated", "app.dateUnavailable",
]) {
  assert.ok(STRINGS.en[key], `${key}: English copy missing`);
  assert.ok(STRINGS.ar[key], `${key}: Arabic copy missing`);
}

for (const locale of ["en", "ar"]) {
  const visibleCopy = Object.values(STRINGS[locale]).join("\n");
  assert.doesNotMatch(
    visibleCopy,
    /\bprototype\b|\bdemo only\b|\bprototype simulation\b|تجريبي|محاكاة|نموذج أولي/i,
    `${locale}: leadership-facing UI must not repeat internal prototype terminology`,
  );
}
assert.match(STRINGS.en["checkout.demoDisclaimer"], /does not charge a card or reserve cinema inventory/i, "checkout must keep its transaction-boundary disclosure");
assert.match(STRINGS.en["checkout.demoDisclaimer"], /Never enter real payment details/i, "checkout must keep its payment-data warning");
assert.match(STRINGS.en["booking.cancelDemoQuestion"], /Mark booking .* as cancelled on this device/, "device-only cancellation must describe the persisted cancelled state");
assert.match(STRINGS.en["booking.cancelDemoQuestion"], /will not contact VOX or issue a refund/, "device-only cancellation must keep its transaction-boundary disclosure");
assert.match(STRINGS.en["booking.cancelledLocal"], /Marked cancelled on this device/, "device-only cancellation must not claim the stored record was removed");
assert.equal(STRINGS.en["history.cancelledLocal"], "Cancelled", "history must show the persisted record as cancelled");
assert.match(STRINGS.en["booking.qrDemoHint"], /official VOX ticket/, "reference QR must direct guests to an official admission ticket");
assert.match(handoverSource, /showDebug\s*=\s*false/, "leadership view must hide handover diagnostics by default");
assert.match(STRINGS.en["handover.readyBody"], /No external support connection has been started/, "handover must state that it only prepares a summary");
assert.doesNotMatch(handoverSource, /agent queue|pick up this conversation|UserRound|Headphones/i, "handover presentation must not imply a live agent or queue");
assert.match(appSource, /connectingStep:\s*t\("handover\.preparingStep"\)/, "handover progress must say preparing rather than connecting");
assert.doesNotMatch(appSource, /booking (?:was|is) removed from this device|Booking summary [^\n]+ removed only from this device/i, "persisted cancellations must not be described as removed records");
assert.doesNotMatch(checkoutSource, /Apple Pay \(demo\)|Samsung Pay \(demo\)|last4} \(demo\)/, "payment labels must not leak internal demo suffixes");
assert.doesNotMatch(appSource, /\bPrototype (?:checkout|booking|only)\b|الحجز التجريبي|نموذج تجريبي/i, "conversation copy must not label the overall experience as a prototype");
assert.match(qrSource, /size\s*=\s*104/, "booking QR should remain compact inside the mobile widget");

console.log("Validated supporting UX: safe checkout preview, leadership-ready copy, compact booking details, retry states, and experience-art fallback.");
