const DEFAULT_CUTOFF_MINUTES = 30;

const INELIGIBLE_FLAGS = Object.freeze([
  ["ticketScanned", "ticket_scanned"],
  ["ticketCollected", "ticket_collected"],
  ["foodOrderActivated", "food_order_activated"],
  ["promotionApplied", "promotion_applied"],
  ["bankOfferApplied", "bank_offer_applied"],
  ["telcoOfferApplied", "telco_offer_applied"],
]);

function finiteDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function bookingShowtimeDate(booking) {
  if (!booking || typeof booking !== "object") return null;
  const explicit = finiteDate(
    booking.showtimeAt
      || booking.sessionStart
      || booking.sessionStartAt
      || booking.showtimeIso,
  );
  if (explicit) return explicit;

  const date = String(booking.sourceDate || booking.date || "").trim();
  const time = String(booking.showtime || booking.time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  return finiteDate(`${date}T${time.length === 5 ? `${time}:00` : time}+04:00`);
}

export function assessCancellationEligibility(booking, {
  now = new Date(),
  cutoffMinutes = DEFAULT_CUTOFF_MINUTES,
} = {}) {
  const currentTime = finiteDate(now) || new Date();
  const safeCutoff = Number.isFinite(Number(cutoffMinutes))
    ? Math.max(0, Number(cutoffMinutes))
    : DEFAULT_CUTOFF_MINUTES;
  const base = {
    eligible: false,
    requiresReview: false,
    cutoffMinutes: safeCutoff,
    showtimeAt: null,
    demoOnly: Boolean(booking?.demo || booking?.dataMode === "snapshot_demo" || booking?.dataMode === "local_demo"),
  };

  if (!booking || typeof booking !== "object" || !String(booking.ref || booking.BookingId || "").trim()) {
    return Object.freeze({ ...base, status: "ineligible", reason: "booking_reference_required" });
  }
  if (booking.cancelled) return Object.freeze({ ...base, status: "ineligible", reason: "already_cancelled" });
  if (booking.refundEligible === false || booking.cancellationEligible === false) {
    return Object.freeze({ ...base, status: "ineligible", reason: "provider_marked_ineligible" });
  }

  const failedFlag = INELIGIBLE_FLAGS.find(([field]) => booking[field] === true);
  if (failedFlag) return Object.freeze({ ...base, status: "ineligible", reason: failedFlag[1] });

  const showtime = bookingShowtimeDate(booking);
  if (!showtime) {
    return Object.freeze({
      ...base,
      status: "review_required",
      reason: "showtime_unavailable",
      requiresReview: true,
    });
  }

  const cutoffAt = new Date(showtime.getTime() - safeCutoff * 60_000);
  const timing = { showtimeAt: showtime.toISOString(), cutoffAt: cutoffAt.toISOString() };
  if (currentTime.getTime() >= cutoffAt.getTime()) {
    return Object.freeze({ ...base, ...timing, status: "ineligible", reason: "cutoff_passed" });
  }

  if (booking.guestBooking === true || booking.providerEligibilityVerified !== true) {
    return Object.freeze({
      ...base,
      ...timing,
      status: "review_required",
      reason: booking.guestBooking === true ? "guest_booking_requires_review" : "provider_verification_required",
      requiresReview: true,
    });
  }

  return Object.freeze({
    ...base,
    ...timing,
    status: "eligible",
    reason: "eligible_pending_refund_submission",
    eligible: true,
  });
}

export const CANCELLATION_CUTOFF_MINUTES = DEFAULT_CUTOFF_MINUTES;
