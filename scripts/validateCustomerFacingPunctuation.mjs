import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasForbiddenCustomerFacingDash,
  normalizeCustomerFacingFields,
  normalizeCustomerFacingText,
} from "../src/lib/customerFacingText.js";
import { STRINGS } from "../src/i18n/strings.js";
import { VOX_FAQ_ENTRIES } from "../src/knowledge/voxFaqData.js";
import { VOXI_AGENT_PROMPT, VOXI_FIRST_MESSAGES } from "../src/lib/voxiSession.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const textExtensions = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs",
  ".py", ".svg", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);
const forbiddenCodePoints = new Set([0x2013, 0x2014]);

function repositoryTextFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name)
        ? []
        : repositoryTextFiles(path.join(directory, entry.name));
    }
    const filePath = path.join(directory, entry.name);
    return entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())
      ? [filePath]
      : [];
  });
}

function findForbiddenCharacters(value) {
  const matches = [];
  String(value).split(/\r?\n/u).forEach((line, index) => {
    for (const character of line) {
      if (forbiddenCodePoints.has(character.codePointAt(0))) {
        matches.push({ line: index + 1, codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase()}` });
      }
    }
  });
  return matches;
}

const offenders = repositoryTextFiles(root).flatMap((filePath) =>
  findForbiddenCharacters(fs.readFileSync(filePath, "utf8")).map((match) => ({
    file: path.relative(root, filePath).replaceAll(path.sep, "/"),
    ...match,
  })),
);

assert.deepEqual(
  offenders,
  [],
  `Customer-facing repository text contains forbidden Unicode dash punctuation:\n${offenders
    .map(({ file, line, codePoint }) => `- ${file}:${line} (${codePoint})`)
    .join("\n")}`,
);

const forbiddenSample = `before${String.fromCodePoint(0x2013)}middle${String.fromCodePoint(0x2014)}after`;
assert.equal(normalizeCustomerFacingText(forbiddenSample), "before-middle-after");
assert.equal(hasForbiddenCustomerFacingDash(forbiddenSample), true);
assert.equal(hasForbiddenCustomerFacingDash(normalizeCustomerFacingText(forbiddenSample)), false);
assert.equal(
  normalizeCustomerFacingText("Great choice! The Odyssey is showingGreat choice! The Odyssey is showing in IMAX."),
  "Great choice! The Odyssey is showing in IMAX.",
  "a duplicated transport or model opening must render only once",
);
assert.deepEqual(
  normalizeCustomerFacingFields(
    { error: forbiddenSample, message: forbiddenSample, untouched: forbiddenSample },
    ["error", "message"],
  ),
  { error: "before-middle-after", message: "before-middle-after", untouched: forbiddenSample },
  "dynamic customer-facing response fields must be normalized at their state boundary",
);

for (const [surface, value] of Object.entries({
  translations: STRINGS,
  faq: VOX_FAQ_ENTRIES,
  firstMessages: VOXI_FIRST_MESSAGES,
  agentPrompt: VOXI_AGENT_PROMPT,
})) {
  assert.equal(
    hasForbiddenCustomerFacingDash(JSON.stringify(value)),
    false,
    `${surface} must not contain forbidden Unicode dash punctuation`,
  );
}

assert.match(
  VOXI_AGENT_PROMPT,
  /Never use Unicode em dash or en dash/u,
  "The ElevenLabs prompt must explicitly require compliant customer-facing punctuation",
);

console.log(`Validated customer-facing punctuation across ${repositoryTextFiles(root).length} repository text files, runtime normalization, bilingual strings, FAQ data, and ElevenLabs prompt guidance.`);
