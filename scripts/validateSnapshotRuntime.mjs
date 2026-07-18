import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FILMS as LEGACY_FILMS, SESSIONS as LEGACY_SESSIONS } from "../src/mockVistaData.js";
import { SNAPSHOT_BASE_PATH } from "../src/generated/voxSnapshotManifest.js";
import {
  buildSnapshotShardUrl,
  clearVistaSessionCache,
  getResultMeta,
  getScheduledFilms,
  getSeatPlan,
  getSessions,
} from "../src/vistaClient.js";
import { installPublicAssetFetch } from "./lib/installPublicAssetFetch.mjs";

const requests = [];
installPublicAssetFetch({
  onRequest: (url, init) => requests.push({ url, cache: init?.cache }),
});
clearVistaSessionCache();

const source = LEGACY_SESSIONS[0];
const cinemaId = source.CinemaId;
const sourceDate = source.SourceProgrammingDate;
const sourceRows = LEGACY_SESSIONS.filter((session) => (
  session.CinemaId === cinemaId && session.SourceProgrammingDate === sourceDate
));
const sourceFilmIds = new Set(sourceRows.map((session) => session.ScheduledFilmId));
const expectedFilmIds = [];
for (const film of LEGACY_FILMS) {
  if (film.CinemaId !== cinemaId || !sourceFilmIds.has(film.ScheduledFilmId)) continue;
  if (!expectedFilmIds.includes(film.ScheduledFilmId)) expectedFilmIds.push(film.ScheduledFilmId);
}

const expectedUrl = `${SNAPSHOT_BASE_PATH}/${cinemaId}/${sourceDate}.json`;
assert.equal(buildSnapshotShardUrl(cinemaId, sourceDate), expectedUrl);

const [movies, duplicateMovies, sessions] = await Promise.all([
  getScheduledFilms(cinemaId, sourceDate),
  getScheduledFilms(cinemaId, sourceDate),
  getSessions(cinemaId, "", sourceDate),
]);
assert.equal(requests.length, 1, "concurrent consumers must share one shard request");
assert.deepEqual(requests[0], { url: expectedUrl, cache: "force-cache" });
assert.deepEqual(movies.map((movie) => movie.id), expectedFilmIds, "movie availability and order must match the complete snapshot");
assert.deepEqual(duplicateMovies.map((movie) => movie.id), expectedFilmIds);
assert.deepEqual(
  sessions.flatMap((session) => session.sessionIds).sort(),
  sourceRows.map((session) => String(session.SessionId)).sort(),
  "all snapshot sessions must remain reachable after presentation deduplication",
);
assert.equal(getResultMeta(movies)?.mode, "snapshot");
assert.equal(getResultMeta(sessions)?.rawCount, sourceRows.length);

await getSessions(cinemaId, source.ScheduledFilmId, sourceDate);
assert.equal(requests.length, 1, "repeat reads must use the in-memory shard cache");

const seatPlan = await getSeatPlan(cinemaId, source.SessionId);
assert.equal(getResultMeta(seatPlan)?.listedSeatsAvailable, source.SeatsAvailable, "loaded shard inventory must remain available to seat metadata");

clearVistaSessionCache();
await getScheduledFilms(cinemaId, sourceDate);
assert.equal(requests.length, 2, "clearing the session cache must allow a fresh shard read");

const vistaSource = await readFile(new URL("../src/vistaClient.js", import.meta.url), "utf8");
const mediaSource = await readFile(new URL("../src/mediaData.js", import.meta.url), "utf8");
assert.doesNotMatch(vistaSource, /from\s+["']\.\/mockVistaData\.js["']/, "runtime schedule code must not import the complete snapshot");
assert.doesNotMatch(mediaSource, /from\s+["']\.\/mockVistaData\.js["']/, "runtime media code must not import the complete snapshot");

console.log(`Validated one-request shard coalescing, cache reuse, seat metadata, and equivalence for ${sourceRows.length} sessions and ${movies.length} movies.`);
