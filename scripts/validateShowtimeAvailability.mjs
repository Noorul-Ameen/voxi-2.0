import assert from "node:assert/strict";
import { filterBookableSessions, sessionStartEpoch } from "../src/lib/showtimeAvailability.js";

const now = new Date("2026-07-14T19:30:00Z"); // 23:30 in Dubai
const sessions = [
  { sessionId: "past", date: "2026-07-14", time: "21:05" },
  { sessionId: "after-midnight", date: "2026-07-14", time: "00:30" },
  { sessionId: "future", date: "2026-07-15", time: "18:00" },
];
const result = filterBookableSessions(sessions, { now });
assert.deepEqual(result.available.map((session) => session.sessionId), ["after-midnight", "future"]);
assert.deepEqual(result.expired.map((session) => session.sessionId), ["past"]);
assert.equal(sessionStartEpoch(sessions[1]), Date.parse("2026-07-15T00:30:00+04:00"));
console.log("Validated UAE programming-day showtime expiry filtering.");
