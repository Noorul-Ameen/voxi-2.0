import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSnapshotDiscoveryIndex } from "../src/vistaClient.js";

function countedIterable(values, counter) {
  return {
    *[Symbol.iterator]() {
      counter.passes += 1;
      for (const value of values) {
        counter.records += 1;
        yield value;
      }
    },
  };
}

const sessions = [
  { CinemaId: "A", SourceProgrammingDate: "2026-07-17", ScheduledFilmId: "M1", SessionId: "1", Showtime: "2026-07-17T10:00:00" },
  { CinemaId: "A", SourceProgrammingDate: "2026-07-17", ScheduledFilmId: "M1", SessionId: "2", Showtime: "2026-07-17T12:00:00" },
  { CinemaId: "A", SourceProgrammingDate: "2026-07-18", ScheduledFilmId: "M2", SessionId: "3", Showtime: "2026-07-18T14:00:00" },
  { CinemaId: "B", SourceProgrammingDate: "2026-07-17", ScheduledFilmId: "M3", SessionId: "4", Showtime: "2026-07-17T16:00:00" },
  { CinemaId: "A", SourceProgrammingDate: "2026-07-19", ScheduledFilmId: "M1", SessionId: "5", Showtime: "2026-07-19T18:00:00" },
];
const films = [
  { CinemaId: "A", ScheduledFilmId: "M1", Title: "First" },
  { CinemaId: "A", ScheduledFilmId: "M2", Title: "Second" },
  { CinemaId: "B", ScheduledFilmId: "M3", Title: "Third" },
];
const sessionCounter = { passes: 0, records: 0 };
const filmCounter = { passes: 0, records: 0 };
const index = createSnapshotDiscoveryIndex(
  countedIterable(sessions, sessionCounter),
  countedIterable(films, filmCounter),
  ["2026-07-17", "2026-07-18"],
);

assert.deepEqual(sessionCounter, { passes: 1, records: sessions.length }, "the session catalog must be indexed in one construction pass");
assert.deepEqual(filmCounter, { passes: 1, records: films.length }, "the film catalog must be indexed in one construction pass");
assert.deepEqual(index.datesForCinema("A"), ["2026-07-17", "2026-07-18"], "cinema dates retain published order and exclude unpublished dates");
assert.deepEqual(index.sessionsForCinemaDate("A", "2026-07-17").map(({ SessionId }) => SessionId), ["1", "2"], "date lookup retains source session order");
assert.deepEqual(index.sessionsForCinemaDateFilm("A", "2026-07-17", "M1").map(({ SessionId }) => SessionId), ["1", "2"], "movie lookup returns only its relevant date bucket");
assert.deepEqual(index.sessionsForCinemaDateFilm("A", "2026-07-17", "M2"), [], "a movie with no sessions on the requested date remains empty");
assert.deepEqual(index.filmsForCinema("A").map(({ ScheduledFilmId }) => ScheduledFilmId), ["M1", "M2"], "cinema film lookup retains source film order");
assert.equal(index.stats.sessionRecordCount, sessions.length);
assert.equal(index.stats.indexedSessionCount, sessions.length);
assert.equal(index.stats.filmRecordCount, films.length);
assert.equal(index.stats.sessionConstructionPasses, 1);
assert.equal(index.stats.filmConstructionPasses, 1);

for (let attempt = 0; attempt < 20; attempt += 1) {
  index.sessionsForCinemaDateFilm("A", "2026-07-17", "M1");
  index.sessionsForCinemaDate("B", "2026-07-17");
  index.datesForCinema("A");
}
assert.equal(sessionCounter.passes, 1, "repeated movie discovery lookups must not rescan the source session catalog");
assert.equal(filmCounter.passes, 1, "repeated movie discovery lookups must not rescan the source film catalog");
assert.ok(Object.isFrozen(index.sessionsForCinemaDate("A", "2026-07-17")), "shared index buckets must be immutable");

const vistaSource = await readFile(new URL("../src/vistaClient.js", import.meta.url), "utf8");
const scheduledFilmsBlock = vistaSource.slice(
  vistaSource.indexOf("export async function getScheduledFilms"),
  vistaSource.indexOf("function normalizeSession"),
);
const sessionsBlock = vistaSource.slice(
  vistaSource.indexOf("export async function getSessions"),
  vistaSource.indexOf("export async function getSeatPlan"),
);
assert.doesNotMatch(scheduledFilmsBlock, /delay\s*\(/, "snapshot movie discovery must not add an artificial delay");
assert.doesNotMatch(sessionsBlock, /delay\s*\(/, "snapshot showtime discovery must not add an artificial delay");
assert.match(scheduledFilmsBlock, /fetchSnapshotSessions\(/, "scheduled films must load only the requested snapshot shard");
assert.match(sessionsBlock, /fetchSnapshotSessions\(/, "movie showtimes must reuse the requested snapshot shard");
assert.doesNotMatch(vistaSource, /from\s+["']\.\/mockVistaData\.js["']/, "the runtime client must not import the complete session snapshot");
assert.match(vistaSource, /cache:\s*["']force-cache["']/, "versioned snapshot shards must use the browser asset cache");

console.log("Validated index semantics, on-demand snapshot shard loading, browser cache use, and delay-free discovery.");
