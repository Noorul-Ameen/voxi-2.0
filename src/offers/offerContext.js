export const OFFER_CONTEXT_SOURCE = Object.freeze({
  AUTO: "auto",
  CHECKOUT: "checkout",
  SESSION: "session",
  BOOKING: "booking",
  BROWSE: "browse",
});

const KNOWN_SOURCES = new Set(Object.values(OFFER_CONTEXT_SOURCE));
const SESSION_VIEWS = new Set(["movies", "showtimes", "seatmap"]);

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const normalized = finiteNumber(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function seatId(value) {
  if (value && typeof value === "object") {
    return firstText(value.id, value.seatId, value.name, value.label);
  }
  return text(value);
}

function normalizedSeats(value) {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value.map(seatId).filter(Boolean))];
  return unique.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function sourceSeats(record, keys) {
  for (const key of keys) {
    if (hasOwn(record, key)) return normalizedSeats(record[key]);
  }
  return null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (key !== "fingerprint") result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableHash(value) {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0");
}

function normalizeSource(value) {
  const normalized = String(value || OFFER_CONTEXT_SOURCE.AUTO).trim().toLowerCase();
  if (normalized === "selected_session" || normalized === "selected-showtime") return OFFER_CONTEXT_SOURCE.SESSION;
  return KNOWN_SOURCES.has(normalized) ? normalized : OFFER_CONTEXT_SOURCE.AUTO;
}

function sourceForView(value) {
  const view = String(value || "").trim().toLowerCase();
  if (view === "checkout") return OFFER_CONTEXT_SOURCE.CHECKOUT;
  if (view === "booking") return OFFER_CONTEXT_SOURCE.BOOKING;
  if (SESSION_VIEWS.has(view)) return OFFER_CONTEXT_SOURCE.SESSION;
  return null;
}

function chooseSource({ source, view, originView, checkout, session, booking, browse }) {
  const requested = normalizeSource(source);
  if (requested !== OFFER_CONTEXT_SOURCE.AUTO) return requested;

  const routed = sourceForView(String(view || "").toLowerCase() === "offers" ? originView : view);
  if (routed) return routed;
  if (checkout && typeof checkout === "object") return OFFER_CONTEXT_SOURCE.CHECKOUT;
  if (session && typeof session === "object") return OFFER_CONTEXT_SOURCE.SESSION;
  if (booking && typeof booking === "object") return OFFER_CONTEXT_SOURCE.BOOKING;
  if (browse && typeof browse === "object") return OFFER_CONTEXT_SOURCE.BROWSE;
  return OFFER_CONTEXT_SOURCE.BROWSE;
}

function canonicalCheckout(checkout) {
  const order = checkout?.order && typeof checkout.order === "object" ? checkout.order : checkout || {};
  return {
    sourceId: firstText(order.checkoutId, order.id),
    checkoutId: firstText(order.checkoutId),
    bookingRef: null,
    cinemaId: firstText(order.cinemaId),
    cinemaName: firstText(order.cinemaName),
    movieId: firstText(order.movieId),
    movieTitle: firstText(order.movieTitle),
    sessionId: firstText(order.sessionId),
    performanceDate: firstText(order.performanceDate, order.date, order.sourceDate),
    programmingDate: firstText(order.programmingDate, order.sourceDate),
    showtime: firstText(order.showtime, order.time),
    showtimeAt: firstText(order.showtimeAt),
    experience: firstText(order.experience, order.exp),
    format: firstText(order.format, order.presentationFormat),
    screen: firstText(order.screen, order.screenName),
    seatType: firstText(order.seatType, order.seatCategory),
    seats: sourceSeats(order, ["seats", "selectedSeats"]),
    subtotal: firstNumber(order.subtotal),
    feeTotal: firstNumber(order.feeTotal),
    orderTotal: firstNumber(order.total, order.orderTotal),
    currency: firstText(order.currency),
    channel: firstText(order.channel),
  };
}

function canonicalSession(input) {
  const bundle = input || {};
  const selected = bundle.session && typeof bundle.session === "object" ? bundle.session : bundle;
  const cinema = bundle.cinema && typeof bundle.cinema === "object" ? bundle.cinema : selected.cinema || {};
  const movie = bundle.movie && typeof bundle.movie === "object" ? bundle.movie : selected.movie || {};
  const seats = sourceSeats(bundle, ["selectedSeats", "seats"])
    ?? sourceSeats(selected, ["selectedSeats", "seats"]);
  return {
    sourceId: firstText(selected.sessionId, selected.id),
    checkoutId: null,
    bookingRef: null,
    cinemaId: firstText(bundle.cinemaId, cinema.id, selected.cinemaId),
    cinemaName: firstText(bundle.cinemaName, cinema.name, selected.cinemaName),
    movieId: firstText(bundle.movieId, movie.id, selected.movieId),
    movieTitle: firstText(bundle.movieTitle, movie.title, selected.movieTitle),
    sessionId: firstText(selected.sessionId, selected.id),
    performanceDate: firstText(selected.performanceDate, selected.date, bundle.performanceDate, bundle.date),
    programmingDate: firstText(selected.programmingDate, selected.sourceDate, bundle.programmingDate, bundle.sourceDate),
    showtime: firstText(selected.showtime, selected.time),
    showtimeAt: firstText(selected.showtimeAt),
    experience: firstText(selected.experience, selected.exp),
    format: firstText(selected.format, selected.presentationFormat),
    screen: firstText(selected.screen, selected.screenName),
    seatType: firstText(bundle.seatType, selected.seatType, bundle.seatCategory, selected.seatCategory),
    seats,
    subtotal: firstNumber(bundle.subtotal, selected.subtotal),
    feeTotal: firstNumber(bundle.feeTotal, selected.feeTotal),
    orderTotal: firstNumber(bundle.orderTotal, bundle.total, selected.orderTotal, selected.total),
    currency: firstText(bundle.currency, selected.currency),
    channel: firstText(bundle.channel, selected.channel),
  };
}

function canonicalBooking(input) {
  const record = input?.booking && typeof input.booking === "object" ? input.booking : input || {};
  return {
    sourceId: firstText(record.ref, record.bookingRef, record.id),
    checkoutId: null,
    bookingRef: firstText(record.ref, record.bookingRef),
    cinemaId: firstText(record.cinemaId),
    cinemaName: firstText(record.cinemaName),
    movieId: firstText(record.movieId),
    movieTitle: firstText(record.movieTitle),
    sessionId: firstText(record.sessionId),
    performanceDate: firstText(record.performanceDate, record.date, record.sourceDate),
    programmingDate: firstText(record.programmingDate, record.sourceDate),
    showtime: firstText(record.showtime, record.time),
    showtimeAt: firstText(record.showtimeAt),
    experience: firstText(record.experience, record.exp),
    format: firstText(record.format, record.presentationFormat),
    screen: firstText(record.screen, record.screenName),
    seatType: firstText(record.seatType, record.seatCategory),
    seats: sourceSeats(record, ["seats", "selectedSeats"]),
    subtotal: firstNumber(record.subtotal),
    feeTotal: firstNumber(record.feeTotal),
    orderTotal: firstNumber(record.total, record.orderTotal),
    currency: firstText(record.currency),
    channel: firstText(record.channel),
  };
}

function canonicalBrowse(input) {
  const record = input || {};
  return {
    sourceId: firstText(record.id),
    checkoutId: null,
    bookingRef: null,
    cinemaId: firstText(record.cinemaId),
    cinemaName: firstText(record.cinemaName, record.cinema),
    movieId: firstText(record.movieId),
    movieTitle: firstText(record.movieTitle, record.movie),
    sessionId: null,
    performanceDate: firstText(record.performanceDate, record.date),
    programmingDate: firstText(record.programmingDate),
    showtime: firstText(record.showtime, record.preferredTime),
    showtimeAt: null,
    experience: firstText(record.experience),
    format: firstText(record.format),
    screen: null,
    seatType: firstText(record.seatType, record.seatCategory),
    seats: sourceSeats(record, ["selectedSeats", "seats"]),
    subtotal: null,
    feeTotal: null,
    orderTotal: firstNumber(record.orderTotal, record.total),
    currency: firstText(record.currency),
    channel: firstText(record.channel),
  };
}

function canonicalForSource(source, candidates) {
  if (source === OFFER_CONTEXT_SOURCE.CHECKOUT) return canonicalCheckout(candidates.checkout);
  if (source === OFFER_CONTEXT_SOURCE.SESSION) return canonicalSession(candidates.session);
  if (source === OFFER_CONTEXT_SOURCE.BOOKING) return canonicalBooking(candidates.booking);
  return canonicalBrowse(candidates.browse);
}

function fingerprintBasis(context) {
  return {
    schemaVersion: "1.0",
    source: context?.source || null,
    sourceId: context?.sourceId || null,
    checkoutId: context?.checkoutId || null,
    bookingRef: context?.bookingRef || null,
    cinemaId: context?.cinemaId || null,
    cinemaName: context?.cinemaName || null,
    movieId: context?.movieId || null,
    movieTitle: context?.movieTitle || null,
    sessionId: context?.sessionId || null,
    performanceDate: context?.performanceDate || null,
    programmingDate: context?.programmingDate || null,
    showtime: context?.showtime || null,
    showtimeAt: context?.showtimeAt || null,
    experience: context?.experience || null,
    format: context?.format || null,
    screen: context?.screen || null,
    seatType: context?.seatType || null,
    selectedSeats: normalizedSeats(context?.selectedSeats) || [],
    ticketCount: finiteNumber(context?.ticketCount),
    subtotal: finiteNumber(context?.subtotal),
    feeTotal: finiteNumber(context?.feeTotal),
    orderTotal: finiteNumber(context?.orderTotal),
    currency: context?.currency || null,
    channel: context?.channel || null,
    isMember: booleanOrNull(context?.isMember),
    monthlyTicketsUsed: finiteNumber(context?.monthlyTicketsUsed),
    monthlySpend: finiteNumber(context?.monthlySpend),
    isSessionGrounded: context?.isSessionGrounded === true,
  };
}

export function offerContextFingerprint(context = {}) {
  return `offer-context-v1-${stableHash(stableJson(fingerprintBasis(context)))}`;
}

export function sameOfferContext(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return offerContextFingerprint(left) === offerContextFingerprint(right);
}

function resultFingerprint(value) {
  return text(value?.contextFingerprint)
    || text(value?.fingerprint)
    || text(value?.context?.fingerprint)
    || (value?.context ? offerContextFingerprint(value.context) : null);
}

export function shouldInvalidateOfferResult(resultOrContext, nextContext) {
  if (!resultOrContext) return false;
  if (!nextContext) return true;
  const previous = resultFingerprint(resultOrContext) || offerContextFingerprint(resultOrContext);
  return previous !== offerContextFingerprint(nextContext);
}

export function buildOfferEvaluationContext({
  source = OFFER_CONTEXT_SOURCE.AUTO,
  view = "",
  originView = "",
  checkout = null,
  session = null,
  booking = null,
  browse = null,
  eligibility = {},
  defaultChannel = "web",
} = {}) {
  const selectedSource = chooseSource({ source, view, originView, checkout, session, booking, browse });
  const canonical = canonicalForSource(selectedSource, { checkout, session, booking, browse });
  const selectedSeats = Object.freeze([...(canonical.seats || [])]);
  const hasSeatSelection = canonical.seats !== null;
  const isSessionGrounded = selectedSource !== OFFER_CONTEXT_SOURCE.BROWSE && Boolean(canonical.sessionId);
  const selectedShowtime = isSessionGrounded
    ? Object.freeze({
      source: selectedSource,
      sessionId: canonical.sessionId,
      cinemaId: canonical.cinemaId,
      movieId: canonical.movieId,
      performanceDate: canonical.performanceDate,
      programmingDate: canonical.programmingDate,
      showtime: canonical.showtime,
      showtimeAt: canonical.showtimeAt,
      experience: canonical.experience,
      format: canonical.format,
      screen: canonical.screen,
    })
    : null;

  const context = {
    schemaVersion: "1.0",
    source: selectedSource,
    sourceId: canonical.sourceId,
    contextMode: selectedSource === OFFER_CONTEXT_SOURCE.BROWSE
      ? "browse"
      : selectedSource === OFFER_CONTEXT_SOURCE.BOOKING
        ? "booking"
        : "selected_session",
    checkoutId: canonical.checkoutId,
    bookingRef: canonical.bookingRef,
    cinemaId: canonical.cinemaId,
    cinemaName: canonical.cinemaName,
    movieId: canonical.movieId,
    movieTitle: canonical.movieTitle,
    sessionId: canonical.sessionId,
    performanceDate: canonical.performanceDate,
    programmingDate: canonical.programmingDate,
    showtime: canonical.showtime,
    showtimeAt: canonical.showtimeAt,
    experience: canonical.experience,
    format: canonical.format || firstText(eligibility.format),
    screen: canonical.screen,
    seatType: canonical.seatType || firstText(eligibility.seatType),
    selectedSeats,
    ticketCount: hasSeatSelection ? selectedSeats.length : null,
    subtotal: canonical.subtotal,
    feeTotal: canonical.feeTotal,
    orderTotal: canonical.orderTotal,
    currency: canonical.currency,
    channel: canonical.channel || firstText(eligibility.channel, defaultChannel),
    isMember: booleanOrNull(eligibility.isMember),
    monthlyTicketsUsed: finiteNumber(eligibility.monthlyTicketsUsed),
    monthlySpend: finiteNumber(eligibility.monthlySpend),
    isSessionGrounded,
    selectedShowtime,
  };
  return Object.freeze({ ...context, fingerprint: offerContextFingerprint(context) });
}
