import { normalizeCustomerFacingText } from "./lib/customerFacingText.js";

export const BOOKING_STORAGE_KEY = "vox_bookings";
export const BOOKING_STORAGE_VERSION = 2;
export const BOOKING_STORAGE_NAMESPACE = "voxi";

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const refKey = (value) => String(value || "").trim().toUpperCase();
const scopeValue = (value) => String(value || "").trim();
const CUSTOMER_TEXT_FIELDS = [
  "movieTitle",
  "cinemaName",
  "experience",
  "screen",
  "currency",
  "status",
  "transactionWarning",
  "refundRoute",
  "refundReference",
];

export class BookingStorageError extends Error {
  constructor(message, { code = "BOOKING_STORAGE_ERROR", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "BookingStorageError";
    this.code = code;
  }
}

function getStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeSeats(value) {
  return Array.isArray(value)
    ? value.map(String).map((seat) => seat.trim()).filter(Boolean)
    : String(value || "").split(/[,\s]+/).map((seat) => seat.trim()).filter(Boolean);
}

function normalizeBooking(value, { partial = false } = {}) {
  if (!value || typeof value !== "object" || !refKey(value.ref)) return null;
  const result = { ...value, ref: String(value.ref).trim() };

  if (own(value, "seats")) result.seats = normalizeSeats(value.seats);
  else if (!partial) result.seats = [];

  if (own(value, "currency")) result.currency = value.currency || "AED";
  else if (!partial) result.currency = "AED";

  if (own(value, "cancelled")) result.cancelled = Boolean(value.cancelled);
  else if (!partial) result.cancelled = false;

  if (own(value, "createdAt")) result.createdAt = value.createdAt || null;
  else if (!partial) result.createdAt = null;

  for (const field of CUSTOMER_TEXT_FIELDS) {
    if (own(value, field) && typeof value[field] === "string") {
      result[field] = normalizeCustomerFacingText(value[field]);
    }
  }
  if (own(value, "fees") && Array.isArray(value.fees)) {
    result.fees = value.fees.map((fee) => fee && typeof fee === "object"
      ? {
          ...fee,
          ...(typeof fee.name === "string" ? { name: normalizeCustomerFacingText(fee.name) } : {}),
          ...(typeof fee.label === "string" ? { label: normalizeCustomerFacingText(fee.label) } : {}),
          ...(typeof fee.description === "string" ? { description: normalizeCustomerFacingText(fee.description) } : {}),
        }
      : fee);
  }

  if (result.cancelled) {
    if (own(value, "cancelledAt")) result.cancelledAt = value.cancelledAt || null;
    else if (!partial) result.cancelledAt = null;
  } else if (!partial || own(value, "cancelled") || own(value, "cancelledAt")) {
    result.cancelledAt = null;
  }

  if (own(value, "ownerId")) result.ownerId = scopeValue(value.ownerId) || null;
  if (own(value, "sessionId")) result.sessionId = scopeValue(value.sessionId) || null;
  return result;
}

function mergeBooking(existing, incoming) {
  const safeExisting = normalizeBooking(existing);
  const patch = normalizeBooking(incoming, { partial: true });
  if (!safeExisting) return normalizeBooking(incoming);
  if (!patch) return safeExisting;

  const merged = { ...safeExisting, ...patch };
  // A duplicate write must never silently resurrect a cancelled booking.
  if (safeExisting.cancelled) {
    merged.cancelled = true;
    merged.cancelledAt = safeExisting.cancelledAt || patch.cancelledAt || null;
  }
  return normalizeBooking(merged);
}

function bookingIdentity(booking) {
  return [scopeValue(booking.ownerId), scopeValue(booking.sessionId), refKey(booking.ref)].join("|");
}

function coalesceBookings(bookings) {
  const order = [];
  const byRef = new Map();
  for (const value of Array.isArray(bookings) ? bookings : []) {
    const booking = normalizeBooking(value);
    if (!booking) continue;
    const key = bookingIdentity(booking);
    if (!byRef.has(key)) order.push(key);
    byRef.set(key, byRef.has(key) ? mergeBooking(byRef.get(key), booking) : booking);
  }
  return order.map((key) => byRef.get(key));
}

function decodeStoredValue(raw) {
  const parsed = JSON.parse(raw || "[]");
  if (Array.isArray(parsed)) return { bookings: parsed, legacy: true };
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.bookings)) {
    return {
      bookings: parsed.bookings,
      legacy: parsed.version !== BOOKING_STORAGE_VERSION || parsed.namespace !== BOOKING_STORAGE_NAMESPACE,
    };
  }
  throw new TypeError("Booking storage must contain a booking array or envelope.");
}

function parseScope(options = {}) {
  const source = options?.scope && typeof options.scope === "object" ? options.scope : options;
  return {
    ownerId: scopeValue(source?.ownerId || source?.userId),
    sessionId: scopeValue(source?.sessionId),
    includeLegacy: Boolean(source?.includeLegacy),
  };
}

function hasScope(scope) {
  return Boolean(scope.ownerId || scope.sessionId);
}

function matchesScope(booking, scope) {
  if (!hasScope(scope)) return true;
  const bookingOwner = scopeValue(booking.ownerId);
  const bookingSession = scopeValue(booking.sessionId);
  if (!bookingOwner && !bookingSession) return scope.includeLegacy;
  if (scope.ownerId && bookingOwner !== scope.ownerId) return false;
  if (scope.sessionId && bookingSession !== scope.sessionId) return false;
  return true;
}

function readAllBookings({ strict = false } = {}) {
  const storage = getStorage();
  if (!storage) {
    if (strict) throw new BookingStorageError("Booking storage is unavailable.", { code: "STORAGE_UNAVAILABLE" });
    return [];
  }
  try {
    return coalesceBookings(decodeStoredValue(storage.getItem(BOOKING_STORAGE_KEY)).bookings);
  } catch (cause) {
    if (strict) throw new BookingStorageError("Stored bookings could not be read.", { code: "STORAGE_CORRUPT", cause });
    return [];
  }
}

function persistAllBookings(bookings) {
  const storage = getStorage();
  if (!storage) throw new BookingStorageError("Booking storage is unavailable.", { code: "STORAGE_UNAVAILABLE" });
  const safe = coalesceBookings(bookings);
  const serialized = JSON.stringify({
    version: BOOKING_STORAGE_VERSION,
    namespace: BOOKING_STORAGE_NAMESPACE,
    bookings: safe,
  });
  try {
    storage.setItem(BOOKING_STORAGE_KEY, serialized);
    if (storage.getItem(BOOKING_STORAGE_KEY) !== serialized) {
      throw new Error("Booking storage did not retain the written value.");
    }
  } catch (cause) {
    throw new BookingStorageError("The booking could not be saved on this device.", { code: "STORAGE_WRITE_FAILED", cause });
  }
  return safe;
}

export function readBookings(options = {}) {
  const scope = parseScope(options);
  return readAllBookings({ strict: Boolean(options?.strict) }).filter((booking) => matchesScope(booking, scope));
}

export function writeBookings(bookings, options = {}) {
  const scope = parseScope(options);
  const safe = coalesceBookings(bookings);
  if (!hasScope(scope)) return persistAllBookings(safe);

  const retained = readAllBookings({ strict: true }).filter((booking) => !matchesScope(booking, scope));
  const scoped = safe.map((booking) => normalizeBooking({
    ...booking,
    ownerId: scope.ownerId || booking.ownerId,
    sessionId: scope.sessionId || booking.sessionId,
  })).filter(Boolean);
  persistAllBookings([...retained, ...scoped]);
  return scoped;
}

export function appendBooking(booking, options = {}) {
  const scope = parseScope(options);
  const withScope = {
    ...booking,
    ...(scope.ownerId ? { ownerId: scope.ownerId } : {}),
    ...(scope.sessionId ? { sessionId: scope.sessionId } : {}),
  };
  const safe = normalizeBooking(withScope);
  if (!safe) throw new Error("A booking reference is required.");

  const existing = readAllBookings({ strict: true });
  const key = refKey(safe.ref);
  const index = existing.findIndex((item) => refKey(item.ref) === key && matchesScope(item, scope));
  const next = [...existing];
  const persisted = index >= 0 ? mergeBooking(existing[index], withScope) : safe;
  if (index >= 0) next[index] = persisted;
  else next.push(persisted);
  persistAllBookings(next);
  return persisted;
}

export function findBooking(ref, options = {}) {
  const key = refKey(ref);
  if (!key) return null;
  const scope = parseScope(options);
  return readAllBookings({ strict: Boolean(options?.strict) })
    .find((booking) => refKey(booking.ref) === key && matchesScope(booking, scope)) || null;
}

export function markCancelled(ref, cancelledAt = new Date().toISOString(), options = {}) {
  const key = refKey(ref);
  if (!key) return null;
  const scope = parseScope(options);
  let updated = null;
  const next = readAllBookings({ strict: true }).map((booking) => {
    if (refKey(booking.ref) !== key || !matchesScope(booking, scope)) return booking;
    updated = {
      ...booking,
      cancelled: true,
      cancelledAt: booking.cancelledAt || cancelledAt,
    };
    return updated;
  });
  if (updated) persistAllBookings(next);
  return updated;
}

export function getBookingStorageStatus() {
  const storage = getStorage();
  if (!storage) return Object.freeze({ available: false, valid: false, count: 0, error: "storage_unavailable" });
  try {
    const raw = storage.getItem(BOOKING_STORAGE_KEY);
    if (raw === null) {
      return Object.freeze({
        available: true,
        valid: true,
        count: 0,
        legacy: false,
        version: BOOKING_STORAGE_VERSION,
        namespace: BOOKING_STORAGE_NAMESPACE,
        error: null,
      });
    }
    const value = decodeStoredValue(raw);
    return Object.freeze({
      available: true,
      valid: true,
      count: coalesceBookings(value.bookings).length,
      legacy: value.legacy,
      version: value.legacy ? 1 : BOOKING_STORAGE_VERSION,
      namespace: value.legacy ? null : BOOKING_STORAGE_NAMESPACE,
      error: null,
    });
  } catch {
    return Object.freeze({ available: true, valid: false, count: 0, error: "storage_corrupt" });
  }
}

export function clearBookings(options = {}) {
  const storage = getStorage();
  if (!storage) throw new BookingStorageError("Booking storage is unavailable.", { code: "STORAGE_UNAVAILABLE" });
  const scope = parseScope(options);
  if (!hasScope(scope)) {
    const count = readAllBookings({ strict: true }).length;
    try {
      storage.removeItem(BOOKING_STORAGE_KEY);
      if (storage.getItem(BOOKING_STORAGE_KEY) !== null) throw new Error("Booking storage did not clear the value.");
    }
    catch (cause) {
      throw new BookingStorageError("Stored bookings could not be cleared.", { code: "STORAGE_WRITE_FAILED", cause });
    }
    return count;
  }
  const all = readAllBookings({ strict: true });
  const retained = all.filter((booking) => !matchesScope(booking, scope));
  const removed = all.length - retained.length;
  persistAllBookings(retained);
  return removed;
}

export function createBookingStoreScope(scope) {
  const parsed = parseScope({ scope });
  if (!hasScope(parsed)) throw new Error("A userId/ownerId or sessionId is required for scoped booking storage.");
  const options = { scope: parsed };
  return Object.freeze({
    read: () => readBookings(options),
    find: (ref) => findBooking(ref, options),
    append: (booking) => appendBooking(booking, options),
    markCancelled: (ref, cancelledAt) => markCancelled(ref, cancelledAt, options),
    clear: () => clearBookings(options),
  });
}
