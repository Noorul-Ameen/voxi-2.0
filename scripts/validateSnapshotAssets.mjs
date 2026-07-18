#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    sourceModule: resolve(root, "src/mockVistaData.js"),
    manifest: resolve(root, "src/generated/voxSnapshotManifest.js"),
    outputDir: resolve(root, "public/data/vox-snapshot"),
  };
  const names = new Map([
    ["--source-module", "sourceModule"],
    ["--manifest", "manifest"],
    ["--output-dir", "outputDir"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = names.get(argv[index]);
    if (!key || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    options[key] = resolve(root, argv[index + 1]);
    index += 1;
  }
  return options;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right, "en"));
}

function sourceSessionKey(session) {
  return [
    session.CinemaId,
    session.SourceProgrammingDate,
    session.ScheduledFilmId,
    session.SessionId,
    session.Showtime,
  ].join("|");
}

function sortedSessions(sessions) {
  return [...sessions].sort((left, right) => sourceSessionKey(left).localeCompare(sourceSessionKey(right), "en"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = `${Date.now()}-${process.pid}`;
  const [source, manifest, manifestText] = await Promise.all([
    import(`${pathToFileURL(options.sourceModule).href}?validate=${token}`),
    import(`${pathToFileURL(options.manifest).href}?validate=${token}`),
    readFile(options.manifest, "utf8"),
  ]);

  assert.ok(manifest.SNAPSHOT_VERSION, "manifest has a content version");
  assert.equal(manifest.SNAPSHOT_BASE_PATH, `/data/vox-snapshot/${manifest.SNAPSHOT_VERSION}`, "manifest exposes a versioned public path");
  assert.ok(!/[\u2013\u2014]/u.test(manifestText), "manifest has no prohibited dash punctuation");
  assert.deepEqual(manifest.DATA_DATES, source.DATA_DATES, "manifest dates match the validated Vista module");
  assert.deepEqual(manifest.CINEMAS, source.CINEMAS, "manifest cinemas match the validated Vista module");
  assert.deepEqual(manifest.DATA_STATS, source.DATA_STATS, "manifest stats match the validated Vista module");
  assert.deepEqual(manifest.EXPERIENCE_MEDIA, source.EXPERIENCE_MEDIA, "experience media is retained");
  assert.deepEqual(manifest.OFFER_MEDIA, source.OFFER_MEDIA, "offer media is retained");

  const sourceFilmsById = new Map();
  for (const film of source.FILMS) {
    const id = String(film.ScheduledFilmId);
    if (!sourceFilmsById.has(id)) sourceFilmsById.set(id, { film, cinemas: [] });
    sourceFilmsById.get(id).cinemas.push(String(film.CinemaId));
  }
  assert.equal(manifest.FILMS.length, sourceFilmsById.size, "manifest contains one row per movie");
  for (const film of manifest.FILMS) {
    const expected = sourceFilmsById.get(String(film.ScheduledFilmId));
    assert.ok(expected, `manifest movie ${film.ScheduledFilmId} exists in source`);
    const { CinemaIds, ...filmWithoutCinemas } = film;
    assert.deepEqual(filmWithoutCinemas, expected.film, `movie metadata is retained for ${film.ScheduledFilmId}`);
    assert.deepEqual(CinemaIds, [...new Set(expected.cinemas)].sort(), `cinema availability is retained for ${film.ScheduledFilmId}`);
  }

  const versionEntries = await readdir(options.outputDir, { withFileTypes: true });
  assert.deepEqual(
    versionEntries.map((entry) => entry.name),
    [manifest.SNAPSHOT_VERSION],
    "snapshot directory contains only the active content version",
  );
  assert.ok(versionEntries[0].isDirectory(), "snapshot content version is a directory");
  const versionDir = resolve(options.outputDir, manifest.SNAPSHOT_VERSION);
  const shardFiles = (await listFiles(versionDir)).filter((path) => path.endsWith(".json"));
  assert.equal(shardFiles.length, manifest.SNAPSHOT_ASSET_STATS.shardCount, "shard count matches manifest stats");

  const restoredSessions = [];
  let totalShardBytes = 0;
  let largestShardBytes = 0;
  let largestShardPath = "";
  let largestShardGzipBytes = 0;
  for (const file of shardFiles) {
    const bytes = await readFile(file);
    const text = bytes.toString("utf8");
    assert.ok(!/[\u2013\u2014]/u.test(text), `${relative(versionDir, file)} has no prohibited dash punctuation`);
    const shard = JSON.parse(text);
    const expectedPath = resolve(versionDir, shard.cinemaId, `${shard.programmingDate}.json`);
    assert.equal(file, expectedPath, "shard path matches its cinema and programming date");
    assert.equal(shard.version, manifest.SNAPSHOT_VERSION, "shard version matches manifest");
    assert.ok(shard.sessions.length > 0, "empty shards are not published");
    assert.ok(shard.sessions.every((session) => (
      String(session.CinemaId) === String(shard.cinemaId)
      && String(session.SourceProgrammingDate) === String(shard.programmingDate)
    )), "every shard session matches its partition");
    restoredSessions.push(...shard.sessions);
    totalShardBytes += bytes.length;
    const relativePath = relative(versionDir, file).replaceAll("\\", "/");
    if (bytes.length > largestShardBytes) {
      largestShardBytes = bytes.length;
      largestShardPath = relativePath;
    }
    largestShardGzipBytes = Math.max(largestShardGzipBytes, gzipSync(bytes).length);
  }

  assert.deepEqual(sortedSessions(restoredSessions), sortedSessions(source.SESSIONS), "all sessions round trip through exactly one shard");
  assert.equal(totalShardBytes, manifest.SNAPSHOT_ASSET_STATS.totalShardBytes, "total shard bytes match manifest stats");
  assert.equal(largestShardBytes, manifest.SNAPSHOT_ASSET_STATS.largestShardBytes, "largest shard bytes match manifest stats");
  assert.equal(largestShardPath, manifest.SNAPSHOT_ASSET_STATS.largestShardPath, "largest shard path matches manifest stats");
  assert.equal(restoredSessions.length, manifest.SNAPSHOT_ASSET_STATS.sessionCount, "session count matches manifest stats");

  const versionPayload = {
    DATA_STATS: manifest.DATA_STATS,
    DATA_DATES: manifest.DATA_DATES,
    CINEMAS: manifest.CINEMAS,
    FILMS: manifest.FILMS,
    EXPERIENCE_MEDIA: manifest.EXPERIENCE_MEDIA,
    OFFER_MEDIA: manifest.OFFER_MEDIA,
    DATES_BY_CINEMA: manifest.DATES_BY_CINEMA,
    FILM_IDS_BY_CINEMA_DATE: manifest.FILM_IDS_BY_CINEMA_DATE,
    SESSIONS: restoredSessions,
  };
  const expectedVersionHash = createHash("sha256").update(JSON.stringify(versionPayload)).digest("hex").slice(0, 16);
  const expectedVersionDate = String(manifest.DATA_STATS.extractedAt || "snapshot").slice(0, 10).replace(/[^0-9]/g, "") || "snapshot";
  assert.equal(manifest.SNAPSHOT_VERSION, `${expectedVersionDate}-${expectedVersionHash}`, "snapshot version changes with its complete content");

  for (const [cinemaId, dates] of Object.entries(manifest.DATES_BY_CINEMA)) {
    const expectedDates = [...new Set(source.SESSIONS
      .filter((session) => String(session.CinemaId) === cinemaId)
      .map((session) => session.SourceProgrammingDate))].sort();
    assert.deepEqual(dates, expectedDates, `${cinemaId} date index matches its shards`);
    for (const date of dates) {
      const expectedFilmIds = [...new Set(source.SESSIONS
        .filter((session) => String(session.CinemaId) === cinemaId && session.SourceProgrammingDate === date)
        .map((session) => String(session.ScheduledFilmId)))].sort();
      assert.deepEqual(manifest.FILM_IDS_BY_CINEMA_DATE[cinemaId][date], expectedFilmIds, `${cinemaId} ${date} film index matches its shard`);
    }
  }

  const manifestBytes = Buffer.byteLength(manifestText);
  const manifestGzipBytes = gzipSync(manifestText).length;
  assert.ok(manifestBytes <= 256 * 1024, `manifest stays below 256 KiB raw, received ${manifestBytes}`);
  assert.ok(manifestGzipBytes <= 64 * 1024, `manifest stays below 64 KiB gzip, received ${manifestGzipBytes}`);
  assert.ok(largestShardGzipBytes <= 32 * 1024, `largest shard stays below 32 KiB gzip, received ${largestShardGzipBytes}`);

  console.log(JSON.stringify({
    version: manifest.SNAPSHOT_VERSION,
    manifestBytes,
    manifestGzipBytes,
    shardCount: shardFiles.length,
    sessionCount: restoredSessions.length,
    totalShardBytes,
    largestShardBytes,
    largestShardGzipBytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
