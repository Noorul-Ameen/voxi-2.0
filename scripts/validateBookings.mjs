import assert from "node:assert/strict";

const memory = new Map();
let failWrites = false;
globalThis.window = {
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error("quota exceeded");
      memory.set(key, String(value));
    },
    removeItem: (key) => memory.delete(key),
  },
};

const {
  BOOKING_STORAGE_KEY,
  BOOKING_STORAGE_NAMESPACE,
  BOOKING_STORAGE_VERSION,
  BookingStorageError,
  appendBooking,
  clearBookings,
  createBookingStoreScope,
  findBooking,
  getBookingStorageStatus,
  markCancelled,
  readBookings,
} = await import("../src/bookingStore.js");

window.localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify([{
  ref: "OLD123",
  movieTitle: "Legacy booking",
  cinemaName: `VOX ${String.fromCodePoint(0x2014)} City Centre Deira`,
  seats: "C5, C6",
  total: 84,
}]));

assert.equal(readBookings()[0].currency, "AED", "legacy booking gets default currency");
assert.deepEqual(readBookings()[0].seats, ["C5", "C6"], "legacy seat string normalizes");
assert.equal(readBookings()[0].cinemaName, "VOX - City Centre Deira", "legacy customer-facing punctuation normalizes on hydration");
assert.equal(getBookingStorageStatus().legacy, true, "legacy arrays are detected before migration");

appendBooking({ ref: "WLTEST", movieTitle: "New booking", seats: ["E1", "E2"], total: 126, createdAt: "2026-07-12T10:00:00.000Z" });
assert.equal(findBooking("wltest")?.movieTitle, "New booking", "lookup is case-insensitive");
const envelope = JSON.parse(window.localStorage.getItem(BOOKING_STORAGE_KEY));
assert.equal(envelope.version, BOOKING_STORAGE_VERSION, "writes migrate storage to the current envelope");
assert.equal(envelope.namespace, BOOKING_STORAGE_NAMESPACE);

const cancelled = markCancelled("WlTeSt", "2026-07-12T11:00:00.000Z");
assert.equal(cancelled.cancelled, true);
assert.equal(cancelled.cancelledAt, "2026-07-12T11:00:00.000Z");
assert.equal(findBooking("WLTEST")?.cancelled, true, "cancellation persists");
assert.equal(readBookings().length, 2, "existing bookings stay intact");

const merged = appendBooking({ ref: "wltest", movieTitle: "Updated title only" });
assert.equal(merged.cancelled, true, "a duplicate partial write cannot resurrect a cancellation");
assert.equal(merged.cancelledAt, "2026-07-12T11:00:00.000Z");
assert.deepEqual(merged.seats, ["E1", "E2"], "missing duplicate fields preserve stored values");
assert.equal(merged.createdAt, "2026-07-12T10:00:00.000Z");

const userA = createBookingStoreScope({ userId: "user-a" });
const userB = createBookingStoreScope({ userId: "user-b" });
userA.append({ ref: "SAME", movieTitle: "A", seats: ["A1"] });
userB.append({ ref: "SAME", movieTitle: "B", seats: ["B1"] });
assert.equal(userA.find("same")?.movieTitle, "A", "scoped stores isolate duplicate references");
assert.equal(userB.find("same")?.movieTitle, "B");
assert.equal(userA.clear(), 1, "scoped clear removes only the selected user");
assert.equal(userB.find("same")?.movieTitle, "B", "another user's booking survives scoped clear");

failWrites = true;
assert.throws(
  () => appendBooking({ ref: "GHOST", movieTitle: "Must not be acknowledged" }),
  (error) => error instanceof BookingStorageError && error.code === "STORAGE_WRITE_FAILED",
  "failed persistence must throw instead of returning a ghost booking",
);
failWrites = false;
assert.equal(findBooking("GHOST"), null);

const cleared = clearBookings();
assert.ok(cleared >= 3, "explicit clear removes persisted booking history");
assert.deepEqual(readBookings(), []);

console.log("Validated versioned booking persistence, safe duplicate merges, scoped isolation, truthful writes, cancellation state, and explicit clearing.");
