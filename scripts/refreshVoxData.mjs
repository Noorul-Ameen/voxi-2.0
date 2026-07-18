#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { retainMediaOnPartialResponse, retainPreviouslyVerifiedPosters } from "./refreshRetention.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = `${Date.now()}-${process.pid}`;
const currentJson = resolve(root, "data/vox_showtimes_full.json");
const currentModule = resolve(root, "src/mockVistaData.js");
const currentManifest = resolve(root, "src/generated/voxSnapshotManifest.js");
const currentShardRoot = resolve(root, "public/data/vox-snapshot");
const nextJson = resolve(root, `data/.vox_showtimes_full.next-${stamp}.json`);
const nextModule = resolve(root, `src/.mockVistaData.next-${stamp}.js`);
const nextManifest = resolve(root, `src/generated/.voxSnapshotManifest.next-${stamp}.js`);
const nextShardRoot = resolve(root, `public/data/.vox-snapshot.next-${stamp}`);
const backupJson = resolve(root, `data/.vox_showtimes_full.backup-${stamp}.json`);
const backupModule = resolve(root, `src/.mockVistaData.backup-${stamp}.js`);
const backupManifest = resolve(root, `src/generated/.voxSnapshotManifest.backup-${stamp}.js`);
const backupShardRoot = resolve(root, `public/data/.vox-snapshot.backup-${stamp}`);
const assetPairs = [
  [currentJson, nextJson, backupJson],
  [currentModule, nextModule, backupModule],
  [currentManifest, nextManifest, backupManifest],
  [currentShardRoot, nextShardRoot, backupShardRoot],
];
const backedUpPaths = new Set();
const installedPaths = new Set();
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const packageManager = process.env.npm_execpath
  ? { command: process.execPath, prefix: [process.env.npm_execpath] }
  : { command: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [] };

function run(command, args, label) {
  console.error(`\n[refresh] ${label}`);
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${label} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`));
    });
  });
}

async function runPackageScript(name) {
  return run(packageManager.command, [...packageManager.prefix, "run", name], `npm run ${name}`);
}

async function removeTemporaryFiles() {
  await Promise.all([
    rm(nextJson, { force: true }),
    rm(nextModule, { force: true }),
    rm(nextManifest, { force: true }),
    rm(nextShardRoot, { recursive: true, force: true }),
  ].map((operation) => operation.catch(() => {})));
}

async function retainPreviouslyVerifiedMedia() {
  if (!existsSync(currentJson)) return;
  const [previous, next] = await Promise.all([
    readFile(currentJson, "utf8").then(JSON.parse),
    readFile(nextJson, "utf8").then(JSON.parse),
  ]);
  const sourceMissingOfficialPosterCodes = [...(next.crawl?.missingOfficialPosterCodes || [])].sort();
  const posterRetention = retainPreviouslyVerifiedPosters(previous.catalog, next.catalog);
  const experienceRetention = retainMediaOnPartialResponse(previous.experienceMedia, next.experienceMedia);
  const offerRetention = retainMediaOnPartialResponse(previous.offerMedia, next.offerMedia);
  next.catalog = posterRetention.catalog;
  next.experienceMedia = experienceRetention.items;
  next.offerMedia = offerRetention.items;
  const unresolvedMissingOfficialPosterCodes = next.catalog
    .filter((movie) => !movie.posterUrl)
    .map((movie) => movie.code)
    .sort();
  next.crawl = {
    ...next.crawl,
    sourceMissingOfficialPosterCodes,
    missingOfficialPosterCodes: unresolvedMissingOfficialPosterCodes,
    retainedMoviePosterCodes: posterRetention.retainedCodes,
    retainedMoviePosterCount: posterRetention.retainedCodes.length,
    freshExperienceMediaCount: experienceRetention.freshCount,
    freshOfferMediaCount: offerRetention.freshCount,
    experienceMediaPartialResponse: experienceRetention.partialResponse,
    offerMediaPartialResponse: offerRetention.partialResponse,
    retainedExperienceMediaCount: experienceRetention.retainedCount,
    retainedOfferMediaCount: offerRetention.retainedCount,
  };
  await writeFile(nextJson, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function restoreBackups() {
  await Promise.all([...installedPaths].map((path) => rm(path, { recursive: true, force: true }).catch(() => {})));
  for (const [currentPath, , backupPath] of assetPairs) {
    if (!backedUpPaths.has(currentPath)) continue;
    await rm(currentPath, { recursive: true, force: true }).catch(() => {});
    if (existsSync(backupPath)) await rename(backupPath, currentPath);
  }
}

const backupPaths = [backupJson, backupModule, backupManifest, backupShardRoot];
async function removeBackups() {
  await Promise.all(backupPaths.map((path) => rm(path, { recursive: true, force: true }).catch(() => {})));
}

async function backUpCurrent(currentPath, backupPath) {
  if (!existsSync(currentPath)) return;
  await rename(currentPath, backupPath);
  backedUpPaths.add(currentPath);
}

async function installGenerated(nextPath, currentPath) {
  await rename(nextPath, currentPath);
  installedPaths.add(currentPath);
}

let promotionStarted = false;
let promoted = false;
try {
  const extractorArgs = [
    resolve(root, "scripts/extractVoxShowtimes.mjs"),
    "--output", nextJson,
    "--max-days", process.env.VOX_REFRESH_MAX_DAYS || "31",
    "--workers", process.env.VOX_REFRESH_WORKERS || "2",
  ];
  await run(process.execPath, extractorArgs, "extract official VOX UAE schedule");
  await retainPreviouslyVerifiedMedia();
  await run(process.execPath, [resolve(root, "scripts/validateShowtimeRefresh.mjs"), nextJson, currentJson], "validate freshness and completeness");
  await run(python, [resolve(root, "convert_extraction.py"), nextJson, nextModule], "generate Vista-shaped browser data");
  await run(process.execPath, [
    resolve(root, "scripts/generateSnapshotAssets.mjs"),
    "--source-module", nextModule,
    "--manifest", nextManifest,
    "--output-dir", nextShardRoot,
    "--public-base", "/data/vox-snapshot",
  ], "generate versioned browser snapshot assets");
  await run(process.execPath, [
    resolve(root, "scripts/validateSnapshotAssets.mjs"),
    "--source-module", nextModule,
    "--manifest", nextManifest,
    "--output-dir", nextShardRoot,
  ], "validate browser snapshot assets");

  const generated = await import(`${pathToFileURL(nextModule).href}?refresh=${stamp}`);
  if (!generated.DATA_DATES?.length || !generated.SESSIONS?.length || !generated.FILMS?.length) {
    throw new Error("generated browser data is incomplete");
  }
  const generatedManifest = await import(`${pathToFileURL(nextManifest).href}?refresh=${stamp}`);
  if (!generatedManifest.SNAPSHOT_VERSION || generatedManifest.SNAPSHOT_ASSET_STATS?.sessionCount !== generated.SESSIONS.length) {
    throw new Error("generated browser snapshot assets are incomplete");
  }

  promotionStarted = true;
  for (const [currentPath, , backupPath] of assetPairs) await backUpCurrent(currentPath, backupPath);
  for (const [currentPath, nextPath] of assetPairs) await installGenerated(nextPath, currentPath);
  promoted = true;

  await runPackageScript("validate");
  await runPackageScript("build");
  await removeBackups();
  console.error("\n[refresh] Fresh official VOX schedule validated and promoted successfully.");
} catch (error) {
  if (promotionStarted) await restoreBackups();
  console.error(`\n[refresh] Refresh was not published: ${error.message}`);
  process.exitCode = 1;
} finally {
  await removeTemporaryFiles();
  if (!promoted || process.exitCode) {
    await removeBackups();
  }
}
