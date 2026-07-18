export const HANDOVER_SCHEMA_VERSION = "voxi.oneview-handover.v1";

export const HANDOVER_TRIGGER = Object.freeze({
  EXPLICIT_REQUEST: "explicit_request",
  FAILED_CLARIFICATIONS: "failed_clarifications",
});

export const HANDOVER_REASON = Object.freeze({
  EXPLICIT_REQUEST: "explicit_request",
  CLARIFICATION_FAILURE: "clarification_failure",
  FALLBACK: "fallback",
});

export const HANDOVER_CLARIFICATION_FAILURE_LIMIT = 2;

export const HANDOVER_STATUS = Object.freeze({
  CONNECTING: "connecting",
  QUEUE_READY: "queue_ready",
});

export const DEFAULT_HANDOVER_QUEUE = "VOX UAE Digital Concierge";

const PAYMENT_KEY = /(?:^|_)(?:payment|payment_method|card|cardholder|pan|cvv|cvc|expiry|expiration|billing|iban|account_number|security_code|checkout_token|payment_token)(?:$|_)/i;
const PAYMENT_KEY_COMPACT = /(?:payment|cardnumber|cardholder|cvv|cvc|expiry|expiration|billing|iban|accountnumber|securitycode|checkouttoken|paymenttoken)/i;
const TRANSCRIPT_KEY = /(?:message|transcript|summary|intent|reason|utterance|text)/i;
const REDACTED_PAYMENT = "[redacted payment data]";
const REDACTED_NUMERIC = "[redacted numeric data]";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, maxLength = 240) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function isClarificationFailureReason(value) {
  const reason = safeString(value, 80).toLowerCase();
  return reason === HANDOVER_REASON.CLARIFICATION_FAILURE || reason === HANDOVER_REASON.FALLBACK;
}

export function isSupportedHandoverReason(value) {
  return Object.values(HANDOVER_REASON).includes(safeString(value, 80).toLowerCase());
}

function nullableString(value, maxLength) {
  return safeString(value, maxLength) || null;
}

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return null;
}

function firstString(source, keys, maxLength) {
  return nullableString(firstValue(source, keys), maxLength);
}

function normalizeIso(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = safeString(value, 48);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0");
}

/**
 * Redacts card-like, phone-like, OTP-like and labelled payment values while
 * retaining enough prose for an agent to understand the customer's intent.
 */
export function sanitizeTranscriptText(value, maxLength = 600) {
  let text = safeString(value, maxLength);
  if (!text) return "";

  // Labelled values can be sensitive even when they contain only three or four digits.
  text = text
    .replace(/\b((?:cvv|cvc|security\s*code)\s*(?::|is)?\s*)[\d\s-]{2,7}\d\b/gi, `$1${REDACTED_PAYMENT}`)
    .replace(/\b((?:exp(?:iry|iration)?(?:\s*date)?)\s*(?::|is)?\s*)\d{1,2}\s*[\/-]\s*\d{2,4}\b/gi, `$1${REDACTED_PAYMENT}`)
    .replace(/\b((?:card|account|iban|phone|mobile)(?:\s*(?:number|no\.?))?\s*(?::|is)?\s*)(?:\d[\s.-]*){3,}\d\b/gi, `$1${REDACTED_PAYMENT}`);

  // Six or more possibly separated digits covers OTPs, phone numbers and PANs.
  text = text.replace(/\b(?:\d[\s.-]*){5,}\d\b/g, REDACTED_NUMERIC);

  // Catch a long run embedded in an identifier without redacting ordinary
  // showtime/date combinations such as "20:30 on 08/15".
  text = text.replace(/\d{6,}/g, REDACTED_NUMERIC);

  return text.replace(/(?:\[redacted numeric data\]\s*){2,}/gi, `${REDACTED_NUMERIC} `).trim();
}

/**
 * Removes payment-bearing properties from arbitrary data before it reaches a
 * handover payload or debug view. Circular references are safely ignored.
 */
export function stripPaymentFields(value) {
  const seen = new WeakSet();

  function visit(current, key = "") {
    if (current === null || current === undefined) return current;
    if (typeof current === "string") {
      return TRANSCRIPT_KEY.test(key) ? sanitizeTranscriptText(current) : safeString(current, 1000);
    }
    if (typeof current === "number" || typeof current === "boolean") return current;
    if (current instanceof Date) return normalizeIso(current);
    if (Array.isArray(current)) return current.map((item) => visit(item, key)).filter((item) => item !== undefined);
    if (!isPlainObject(current) || seen.has(current)) return undefined;

    seen.add(current);
    const output = {};
    for (const objectKey of Object.keys(current).sort()) {
      const compactKey = objectKey.replace(/[^a-z0-9]/gi, "");
      const isSafeDisclosureFlag = compactKey.toLowerCase() === "paymentdataincluded" && current[objectKey] === false;
      if (!isSafeDisclosureFlag && (PAYMENT_KEY.test(objectKey) || PAYMENT_KEY_COMPACT.test(compactKey))) continue;
      const next = visit(current[objectKey], objectKey);
      if (next !== undefined) output[objectKey] = next;
    }
    seen.delete(current);
    return output;
  }

  return visit(value);
}

export function sanitizeTranscript(messages, { maxMessages = 16, maxMessageLength = 600 } = {}) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-Math.max(0, maxMessages))
    .map((message) => {
      const roleValue = safeString(message?.role ?? message?.source, 24).toLowerCase();
      const role = ["assistant", "ai", "agent", "bot"].includes(roleValue)
        ? "assistant"
        : ["user", "customer", "guest"].includes(roleValue)
          ? "user"
          : "system";
      const text = sanitizeTranscriptText(message?.text ?? message?.message ?? message?.content, maxMessageLength);
      const at = normalizeIso(message?.at ?? message?.timestamp ?? message?.createdAt);
      return text ? { role, text, ...(at ? { at } : {}) } : null;
    })
    .filter(Boolean);
}

function latestUserTurnKey(messages) {
  if (!Array.isArray(messages)) return "missing_user_turn";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role = safeString(message?.role ?? message?.source, 24).toLowerCase();
    if (!["user", "customer", "guest"].includes(role)) continue;
    const id = safeString(message?.id, 120);
    if (id) return `id:${id}`;
    const at = normalizeIso(message?.at ?? message?.timestamp ?? message?.createdAt);
    if (at) return `at:${at}`;
    return `index:${index}`;
  }
  return "missing_user_turn";
}

export function registerClarificationFailureAttempt({ attempts = [], messages = [], detail = "", at = null } = {}) {
  const retainedAttempts = Array.isArray(attempts)
    ? attempts.filter((attempt) => isPlainObject(attempt) && safeString(attempt.turnKey, 160))
    : [];
  const turnKey = latestUserTurnKey(messages);
  const duplicate = retainedAttempts.some((attempt) => attempt.turnKey === turnKey);
  if (duplicate) {
    const count = retainedAttempts.length;
    return {
      accepted: false,
      thresholdReached: count >= HANDOVER_CLARIFICATION_FAILURE_LIMIT,
      count,
      remaining: Math.max(0, HANDOVER_CLARIFICATION_FAILURE_LIMIT - count),
      attempts: retainedAttempts,
    };
  }

  const nextAttempts = [...retainedAttempts, {
    turnKey,
    detail: sanitizeTranscriptText(detail, 240) || null,
    at: normalizeIso(at),
  }];
  const count = nextAttempts.length;
  return {
    accepted: true,
    thresholdReached: count >= HANDOVER_CLARIFICATION_FAILURE_LIMIT,
    count,
    remaining: Math.max(0, HANDOVER_CLARIFICATION_FAILURE_LIMIT - count),
    attempts: nextAttempts,
  };
}

function normalizeTrigger(trigger, clarificationFailures) {
  const value = safeString(trigger, 64).toLowerCase();
  if (clarificationFailures >= 2 || isClarificationFailureReason(value)) {
    return HANDOVER_TRIGGER.FAILED_CLARIFICATIONS;
  }
  return HANDOVER_TRIGGER.EXPLICIT_REQUEST;
}

function normalizeSeats(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.map((seat) => safeString(seat?.id ?? seat, 12)).filter(Boolean).slice(0, 20);
}

function normalizeContext(input) {
  const cinema = input.cinema ?? input.selectedCinema ?? {};
  const movie = input.movie ?? input.selectedMovie ?? {};
  const session = input.session ?? input.selectedSession ?? {};
  const booking = input.booking ?? input.completedBooking ?? input.pendingOrder ?? input.order ?? {};
  const offer = input.offer ?? input.selectedOffer ?? {};
  const directSeats = normalizeSeats(input.seats);
  const selectedSeats = normalizeSeats(input.selectedSeats);
  const bookingSeats = normalizeSeats(booking.seats);
  const seats = directSeats.length ? directSeats : selectedSeats.length ? selectedSeats : bookingSeats;
  const bookingReference = firstString(booking, ["ref", "reference", "bookingReference"], 80);
  const bookingStatus = firstString(booking, ["status"], 40)
    ?? (booking.cancelled === true ? "cancelled" : bookingReference ? "active" : null);

  return {
    stage: nullableString(input.stage ?? input.journeyStage, 64) ?? "unknown",
    cinema: {
      id: firstString(cinema, ["id", "cinemaId", "siteId"], 80),
      name: firstString(cinema, ["name", "cinemaName", "siteName"], 160),
    },
    movie: {
      id: firstString(movie, ["id", "filmId", "scheduledFilmId"], 80),
      title: firstString(movie, ["title", "movieTitle", "name"], 180),
    },
    session: {
      id: firstString(session, ["id", "sessionId"], 80),
      date: firstString(session, ["date", "showDate", "sourceDate"], 32),
      time: firstString(session, ["time", "showtime", "showTime"], 32),
      experience: firstString(session, ["experience", "exp", "format"], 80),
      screen: firstString(session, ["screen", "screenName"], 80),
    },
    seats,
    booking: {
      reference: bookingReference,
      status: bookingStatus,
      total: finiteNumber(firstValue(booking, ["total", "refundAmount", "amount"])),
      currency: firstString(booking, ["currency"], 8) ?? "AED",
    },
    offer: {
      id: firstString(offer, ["id", "offerId"], 80),
      bank: firstString(offer, ["bank", "bankName", "issuer"], 120),
      title: firstString(offer, ["title", "name"], 180),
      eligibility: firstString(offer, ["eligibility", "eligibilityStatus"], 80),
    },
  };
}

function derivedSummary(context, trigger) {
  const parts = [];
  const movieAtCinema = [context.movie.title, context.cinema.name].filter(Boolean).join(" at ");
  if (movieAtCinema) parts.push(`Customer journey: ${movieAtCinema}.`);
  if (context.session.time) {
    const format = [context.session.experience, context.session.screen].filter(Boolean).join(", ");
    parts.push(`Selected showtime: ${context.session.time}${format ? ` (${format})` : ""}.`);
  }
  if (context.seats.length) parts.push(`Selected seats: ${context.seats.join(", ")}.`);
  if (context.booking.reference) parts.push(`Booking status: ${context.booking.status || "available"}; reference ${context.booking.reference}.`);
  parts.push(trigger === HANDOVER_TRIGGER.FAILED_CLARIFICATIONS
    ? "Handover requested after two failed clarification attempts."
    : "Customer asked to speak with a human agent.");
  return parts.join(" ");
}

/**
 * Creates the allowlist-only payload that the prototype presents as the
 * OneView handover event. The function has no clock or random-number side
 * effects: callers supply requestedAt/conversationId when those are available.
 */
export function buildHandoverPayload(input = {}) {
  const clarificationFailures = Math.max(0, Math.floor(finiteNumber(
    input.clarificationFailures ?? input.failureCount ?? input.failedClarifications,
  ) ?? 0));
  const trigger = normalizeTrigger(input.trigger ?? input.reasonCode, clarificationFailures);
  const context = normalizeContext(input);
  const transcript = sanitizeTranscript(input.messages ?? input.transcript);
  const lastUserMessage = [...transcript].reverse().find((message) => message.role === "user")?.text ?? null;
  const conversationId = nullableString(input.conversationId ?? input.sessionId, 120);
  const reason = sanitizeTranscriptText(
    input.reason ?? (trigger === HANDOVER_TRIGGER.FAILED_CLARIFICATIONS
      ? "Two failed clarification attempts"
      : "Customer requested a human agent"),
    240,
  );
  const summary = sanitizeTranscriptText(input.summary ?? derivedSummary(context, trigger), 800);
  const requestedAt = normalizeIso(input.requestedAt ?? input.createdAt);
  const seed = JSON.stringify({ conversationId, trigger, reason, context, transcript });
  const handoverId = nullableString(input.handoverId, 120) ?? `VOXI-HO-${stableHash(seed)}`;
  const locale = nullableString(input.locale ?? input.language, 16) ?? "en-AE";

  return stripPaymentFields({
    schemaVersion: HANDOVER_SCHEMA_VERSION,
    event: {
      type: "human_handover_requested",
      handoverId,
      requestedAt,
      trigger,
      reason,
      clarificationFailures,
    },
    routing: {
      provider: "Genesys",
      queue: nullableString(input.queue, 120) ?? DEFAULT_HANDOVER_QUEUE,
      channel: "voxi_web_widget",
      mode: "simulation",
    },
    customer: {
      identityStatus: input.customer?.authenticated || input.authenticated ? "authenticated" : "guest",
      locale,
      customerReference: firstString(input.customer ?? {}, ["reference", "customerReference", "id"], 120),
    },
    journey: context,
    conversation: {
      conversationId,
      summary,
      lastUserIntent: sanitizeTranscriptText(input.lastUserIntent ?? lastUserMessage, 300) || null,
      transcript,
    },
    integration: {
      destination: "OneView",
      payloadMode: "prototype",
      paymentDataIncluded: false,
      transcriptSanitization: "digit-heavy-redaction.v1",
    },
  });
}

export const createHandoverSummary = buildHandoverPayload;
