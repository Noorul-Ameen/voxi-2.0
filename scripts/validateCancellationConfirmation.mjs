import assert from "node:assert/strict";
import { resolveCancellationDecision } from "../src/lib/cancellationConfirmation.js";

for (const phrase of [
  "Yes",
  "Yes, cancel it",
  "Yes please cancel it",
  "Go ahead and cancel it",
  "Confirm the cancellation",
  "Okay, proceed with the cancellation",
  "Do it now",
  "نعم",
  "نعم، ألغي الحجز",
  "أكيد، تابع الإلغاء",
]) {
  assert.equal(resolveCancellationDecision(phrase), true, `${phrase}: must confirm the pending cancellation`);
}

for (const phrase of [
  "No",
  "No, thank you",
  "Do not cancel it",
  "Don't cancel my booking",
  "Keep the booking",
  "Not now",
  "لا",
  "لا تلغي الحجز",
  "احتفظ بالحجز",
]) {
  assert.equal(resolveCancellationDecision(phrase), false, `${phrase}: must decline the pending cancellation`);
}

for (const phrase of [
  "Show my bookings",
  "What is the cancellation policy?",
  "Cancel Toy Story 5",
  "I need help",
  "",
]) {
  assert.equal(resolveCancellationDecision(phrase), null, `${phrase}: must remain a non-decision turn`);
}

console.log("Validated natural English and Arabic cancellation confirmation, decline, punctuation, and non-decision phrases.");
