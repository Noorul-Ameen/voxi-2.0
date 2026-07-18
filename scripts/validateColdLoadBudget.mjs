#!/usr/bin/env node
import assert from "node:assert/strict";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = path.join(ROOT, "dist");
const SNAPSHOT_ROOT = path.join(DIST, "data", "vox-snapshot");

const BUDGETS = Object.freeze({
  htmlBytes: 32 * 1024,
  initialRequests: 8,
  initialJavaScriptBytes: 900 * 1024,
  initialJavaScriptGzipBytes: 250 * 1024,
  initialJavaScriptBrotliBytes: 225 * 1024,
  initialCssGzipBytes: 64 * 1024,
  shardBytes: 128 * 1024,
  shardGzipBytes: 16 * 1024,
  shardCount: 2_000,
  snapshotBytes: 16 * 1024 * 1024,
});

function bytesLabel(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "giu")) || [];
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "iu"))?.[1] || "";
}

function localAssetPath(urlValue) {
  const pathname = String(urlValue || "").split(/[?#]/u, 1)[0];
  assert.ok(pathname, "initial asset URL must not be empty");
  assert.ok(!/^(?:[a-z]+:)?\/\//iu.test(pathname), `initial asset must be local: ${urlValue}`);
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const absolutePath = path.resolve(DIST, relativePath);
  assert.ok(
    absolutePath === DIST || absolutePath.startsWith(`${DIST}${path.sep}`),
    `initial asset escaped dist: ${urlValue}`,
  );
  assert.ok(existsSync(absolutePath), `initial asset does not exist: ${relativePath}`);
  return absolutePath;
}

function compressedSize(buffer, type) {
  if (type === "gzip") return gzipSync(buffer, { level: 9 }).length;
  return brotliCompressSync(buffer, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
  }).length;
}

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

assert.ok(existsSync(DIST), "dist is missing. Run the production build first.");
const indexPath = path.join(DIST, "index.html");
assert.ok(existsSync(indexPath), "dist/index.html is missing");

const htmlBuffer = readFileSync(indexPath);
const html = htmlBuffer.toString("utf8");
assert.ok(htmlBuffer.length <= BUDGETS.htmlBytes, `index HTML exceeds ${bytesLabel(BUDGETS.htmlBytes)}`);
assert.match(html, /class="startup-shell"/u, "index HTML must render a branded shell before JavaScript starts");
assert.match(html, /Loading your cinema concierge\.\.\./u, "the startup shell must explain the initial loading state");

const scriptUrls = tags(html, "script")
  .filter((tag) => attribute(tag, "src"))
  .map((tag) => attribute(tag, "src"));
const modulePreloadUrls = tags(html, "link")
  .filter((tag) => attribute(tag, "rel").toLowerCase().split(/\s+/u).includes("modulepreload"))
  .map((tag) => attribute(tag, "href"));
const stylesheetUrls = tags(html, "link")
  .filter((tag) => attribute(tag, "rel").toLowerCase().split(/\s+/u).includes("stylesheet"))
  .map((tag) => attribute(tag, "href"));

const initialUrls = [...new Set([...scriptUrls, ...modulePreloadUrls, ...stylesheetUrls])];
assert.ok(scriptUrls.length > 0, "index HTML must load an application script");
assert.ok(
  initialUrls.length <= BUDGETS.initialRequests,
  `initial application request count ${initialUrls.length} exceeds ${BUDGETS.initialRequests}`,
);
assert.ok(
  initialUrls.every((value) => !value.includes("/data/vox-snapshot/")),
  "showtime shards must not be preloaded by index HTML",
);

const initialJavaScriptPaths = [...new Set([...scriptUrls, ...modulePreloadUrls])]
  .filter((value) => value.split(/[?#]/u, 1)[0].endsWith(".js"))
  .map(localAssetPath);
const initialCssPaths = [...new Set(stylesheetUrls)].map(localAssetPath);

const initialJavaScriptBuffers = initialJavaScriptPaths.map((filePath) => readFileSync(filePath));
const initialJavaScriptSource = Buffer.concat(initialJavaScriptBuffers).toString("utf8");
const initialJavaScriptBytes = initialJavaScriptBuffers.reduce((total, value) => total + value.length, 0);
const initialJavaScriptGzipBytes = initialJavaScriptBuffers.reduce(
  (total, value) => total + compressedSize(value, "gzip"),
  0,
);
const initialJavaScriptBrotliBytes = initialJavaScriptBuffers.reduce(
  (total, value) => total + compressedSize(value, "brotli"),
  0,
);
const initialCssGzipBytes = initialCssPaths.reduce(
  (total, filePath) => total + compressedSize(readFileSync(filePath), "gzip"),
  0,
);

assert.ok(
  initialJavaScriptBytes <= BUDGETS.initialJavaScriptBytes,
  `initial JavaScript ${bytesLabel(initialJavaScriptBytes)} exceeds ${bytesLabel(BUDGETS.initialJavaScriptBytes)}`,
);
assert.ok(
  initialJavaScriptGzipBytes <= BUDGETS.initialJavaScriptGzipBytes,
  `initial JavaScript gzip ${bytesLabel(initialJavaScriptGzipBytes)} exceeds ${bytesLabel(BUDGETS.initialJavaScriptGzipBytes)}`,
);
assert.ok(
  initialJavaScriptBrotliBytes <= BUDGETS.initialJavaScriptBrotliBytes,
  `initial JavaScript Brotli ${bytesLabel(initialJavaScriptBrotliBytes)} exceeds ${bytesLabel(BUDGETS.initialJavaScriptBrotliBytes)}`,
);
assert.ok(
  initialCssGzipBytes <= BUDGETS.initialCssGzipBytes,
  `initial CSS gzip ${bytesLabel(initialCssGzipBytes)} exceeds ${bytesLabel(BUDGETS.initialCssGzipBytes)}`,
);
assert.doesNotMatch(
  initialJavaScriptSource,
  /serverLocation:\s*["']eu-residency["']/u,
  "the ElevenLabs transport must remain outside the initial JavaScript path",
);

const transportChunkPaths = filesBelow(path.join(DIST, "assets"))
  .filter((filePath) => /ElevenLabsTransport-[^/\\]+\.js$/u.test(filePath));
assert.equal(transportChunkPaths.length, 1, "the production build must contain one deferred ElevenLabs transport chunk");
assert.match(
  readFileSync(transportChunkPaths[0], "utf8"),
  /serverLocation:\s*["']eu-residency["']/u,
  "the deferred transport must retain EU residency",
);

const shardPaths = filesBelow(SNAPSHOT_ROOT).filter((filePath) => filePath.endsWith(".json"));
assert.ok(shardPaths.length > 0, "versioned showtime shards are missing from dist/data/vox-snapshot");
assert.ok(shardPaths.length <= BUDGETS.shardCount, `snapshot shard count exceeds ${BUDGETS.shardCount}`);

const versionNames = new Set();
let snapshotBytes = 0;
let largestShardBytes = 0;
let largestShardGzipBytes = 0;
for (const shardPath of shardPaths) {
  const relativePath = path.relative(SNAPSHOT_ROOT, shardPath);
  const segments = relativePath.split(path.sep);
  assert.ok(segments.length >= 3, `snapshot shard path is not versioned: ${relativePath}`);
  versionNames.add(segments[0]);

  const buffer = readFileSync(shardPath);
  JSON.parse(buffer.toString("utf8"));
  const gzipBytes = compressedSize(buffer, "gzip");
  snapshotBytes += buffer.length;
  largestShardBytes = Math.max(largestShardBytes, buffer.length);
  largestShardGzipBytes = Math.max(largestShardGzipBytes, gzipBytes);
  assert.ok(buffer.length <= BUDGETS.shardBytes, `${relativePath} exceeds ${bytesLabel(BUDGETS.shardBytes)}`);
  assert.ok(gzipBytes <= BUDGETS.shardGzipBytes, `${relativePath} gzip exceeds ${bytesLabel(BUDGETS.shardGzipBytes)}`);
}

assert.equal(versionNames.size, 1, "dist must contain exactly one showtime snapshot version");
assert.ok(snapshotBytes <= BUDGETS.snapshotBytes, `snapshot files exceed ${bytesLabel(BUDGETS.snapshotBytes)}`);

const headersPath = path.join(DIST, "_headers");
assert.ok(existsSync(headersPath), "Cloudflare _headers file is missing from dist");
const headers = readFileSync(headersPath, "utf8");
assert.match(headers, /\/data\/vox-snapshot\/\*\s+[\s\S]*?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/iu);

console.log(JSON.stringify({
  status: "PASS",
  initialRequests: initialUrls.length,
  initialJavaScriptFiles: initialJavaScriptPaths.map((filePath) => path.relative(DIST, filePath).replaceAll(path.sep, "/")),
  initialJavaScriptBytes,
  initialJavaScriptGzipBytes,
  initialJavaScriptBrotliBytes,
  initialCssGzipBytes,
  snapshotVersion: [...versionNames][0],
  shardCount: shardPaths.length,
  snapshotBytes,
  largestShardBytes,
  largestShardGzipBytes,
  budgets: BUDGETS,
}, null, 2));
