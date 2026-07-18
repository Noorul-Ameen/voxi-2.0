#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    sourceModule: resolve(root, "src/mockVistaData.js"),
    manifest: resolve(root, "src/generated/voxSnapshotManifest.js"),
    outputDir: resolve(root, "public/data/vox-snapshot"),
    publicBase: "/data/vox-snapshot",
  };
  const names = new Map([
    ["--source-module", "sourceModule"],
    ["--manifest", "manifest"],
    ["--output-dir", "outputDir"],
    ["--public-base", "publicBase"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = names.get(argv[index]);
    if (!key || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    options[key] = key === "publicBase" ? argv[index + 1] : resolve(root, argv[index + 1]);
    index += 1;
  }
  options.publicBase = `/${String(options.publicBase).replace(/^\/+|\/+$/g, "")}`;
  return options;
}

function normalizeCustomerPunctuation(value) {
  if (typeof value === "string") return value.replace(/[\u2013\u2014]/g, "-");
  if (Array.isArray(value)) return value.map(normalizeCustomerPunctuation);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeCustomerPunctuation(item)]));
  }
  return value;
}

function sortedUnique(values) {
  return [...new Set(values.map(String))].sort((left, right) => left.localeCompare(right, "en"));
}

function safePathSegment(value, label) {
  const text = String(value);
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error(`${label} contains an unsafe path segment: ${text}`);
  return text;
}

function buildFilmCatalog(films) {
  const byId = new Map();
  for (const sourceFilm of films) {
    const film = normalizeCustomerPunctuation(sourceFilm);
    const id = String(film.ScheduledFilmId || "");
    if (!id) throw new Error("A generated film is missing ScheduledFilmId");
    const cinemaId = String(film.CinemaId || "");
    if (!byId.has(id)) {
      byId.set(id, { ...film, CinemaIds: cinemaId ? [cinemaId] : [] });
      continue;
    }
    const existing = byId.get(id);
    const comparableExisting = JSON.stringify({ ...existing, CinemaId: cinemaId, CinemaIds: undefined });
    const comparableNext = JSON.stringify({ ...film, CinemaIds: undefined });
    if (comparableExisting !== comparableNext) {
      throw new Error(`Film metadata differs between cinemas for ${id}`);
    }
    if (cinemaId) existing.CinemaIds.push(cinemaId);
  }
  return [...byId.values()]
    .map((film) => ({ ...film, CinemaIds: sortedUnique(film.CinemaIds) }))
    .sort((left, right) => String(left.ScheduledFilmId).localeCompare(String(right.ScheduledFilmId), "en"));
}

function groupSessions(sessions) {
  const grouped = new Map();
  for (const original of sessions) {
    const session = normalizeCustomerPunctuation(original);
    const cinemaId = safePathSegment(session.CinemaId, "CinemaId");
    const date = safePathSegment(session.SourceProgrammingDate, "SourceProgrammingDate");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid programming date: ${date}`);
    const key = `${cinemaId}|${date}`;
    if (!grouped.has(key)) grouped.set(key, { cinemaId, date, sessions: [] });
    grouped.get(key).sessions.push(session);
  }
  return [...grouped.values()].sort((left, right) => (
    left.cinemaId.localeCompare(right.cinemaId, "en") || left.date.localeCompare(right.date, "en")
  ));
}

function buildAvailability(groups) {
  const datesByCinema = {};
  const filmIdsByCinemaDate = {};
  for (const group of groups) {
    if (!datesByCinema[group.cinemaId]) datesByCinema[group.cinemaId] = [];
    datesByCinema[group.cinemaId].push(group.date);
    if (!filmIdsByCinemaDate[group.cinemaId]) filmIdsByCinemaDate[group.cinemaId] = {};
    filmIdsByCinemaDate[group.cinemaId][group.date] = sortedUnique(group.sessions.map((session) => session.ScheduledFilmId));
  }
  for (const cinemaId of Object.keys(datesByCinema)) datesByCinema[cinemaId] = sortedUnique(datesByCinema[cinemaId]);
  return { datesByCinema, filmIdsByCinemaDate };
}

function contentVersion(payload, extractedAt) {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  const date = String(extractedAt || "snapshot").slice(0, 10).replace(/[^0-9]/g, "") || "snapshot";
  return `${date}-${hash}`;
}

function jsExport(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)};\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generated = await import(`${pathToFileURL(options.sourceModule).href}?snapshot=${Date.now()}`);
  const dataStats = normalizeCustomerPunctuation(generated.DATA_STATS || {});
  const dataDates = sortedUnique(generated.DATA_DATES || []);
  const cinemas = normalizeCustomerPunctuation(generated.CINEMAS || []);
  const films = buildFilmCatalog(generated.FILMS || []);
  const sessions = generated.SESSIONS || [];
  const experienceMedia = normalizeCustomerPunctuation(generated.EXPERIENCE_MEDIA || {});
  const offerMedia = normalizeCustomerPunctuation(generated.OFFER_MEDIA || []);
  if (!dataDates.length || !cinemas.length || !films.length || !sessions.length) {
    throw new Error("Snapshot source module is incomplete");
  }

  const groups = groupSessions(sessions);
  const { datesByCinema, filmIdsByCinemaDate } = buildAvailability(groups);
  const versionPayload = {
    DATA_STATS: dataStats,
    DATA_DATES: dataDates,
    CINEMAS: cinemas,
    FILMS: films,
    EXPERIENCE_MEDIA: experienceMedia,
    OFFER_MEDIA: offerMedia,
    DATES_BY_CINEMA: datesByCinema,
    FILM_IDS_BY_CINEMA_DATE: filmIdsByCinemaDate,
    SESSIONS: groups.flatMap((group) => group.sessions),
  };
  const version = contentVersion(versionPayload, dataStats.extractedAt);
  const versionDir = resolve(options.outputDir, version);

  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(versionDir, { recursive: true });

  let totalShardBytes = 0;
  let largestShardBytes = 0;
  let largestShardPath = "";
  for (const group of groups) {
    const relativePath = `${group.cinemaId}/${group.date}.json`;
    const target = resolve(versionDir, group.cinemaId, `${group.date}.json`);
    const contents = `${JSON.stringify({
      version,
      cinemaId: group.cinemaId,
      programmingDate: group.date,
      sessions: group.sessions,
    })}\n`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
    const bytes = Buffer.byteLength(contents);
    totalShardBytes += bytes;
    if (bytes > largestShardBytes) {
      largestShardBytes = bytes;
      largestShardPath = relativePath;
    }
  }

  const assetStats = {
    shardCount: groups.length,
    sessionCount: sessions.length,
    totalShardBytes,
    largestShardBytes,
    largestShardPath,
  };
  const basePath = `${options.publicBase}/${version}`;
  const manifest = [
    "// Generated by scripts/generateSnapshotAssets.mjs. Do not edit by hand.\n",
    jsExport("SNAPSHOT_VERSION", version),
    jsExport("SNAPSHOT_BASE_PATH", basePath),
    jsExport("SNAPSHOT_ASSET_STATS", assetStats),
    jsExport("DATA_STATS", dataStats),
    jsExport("DATA_DATES", dataDates),
    jsExport("EXPERIENCE_MEDIA", experienceMedia),
    jsExport("OFFER_MEDIA", offerMedia),
    jsExport("CINEMAS", cinemas),
    jsExport("FILMS", films),
    jsExport("DATES_BY_CINEMA", datesByCinema),
    jsExport("FILM_IDS_BY_CINEMA_DATE", filmIdsByCinemaDate),
  ].join("\n");
  await mkdir(dirname(options.manifest), { recursive: true });
  await writeFile(options.manifest, manifest, "utf8");

  console.log(JSON.stringify({
    manifest: options.manifest,
    outputDir: options.outputDir,
    version,
    films: films.length,
    cinemas: cinemas.length,
    dates: dataDates.length,
    ...assetStats,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
