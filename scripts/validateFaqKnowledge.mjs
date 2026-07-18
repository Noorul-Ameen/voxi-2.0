import assert from "node:assert/strict";
import { VOX_FAQ_ENTRIES, VOX_FAQ_TOPICS } from "../src/knowledge/voxFaqData.js";

const REQUIRED_TOPICS = [
  "locations_hours",
  "tickets",
  "experiences",
  "food_beverage",
  "offers",
  "accessibility",
  "age_restrictions",
  "booking_refund",
  "account",
  "loyalty_wallet",
  "support",
];

const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isTextArray = (value) => Array.isArray(value) && value.length > 0 && value.every(isText);

assert.ok(Array.isArray(VOX_FAQ_ENTRIES) && VOX_FAQ_ENTRIES.length >= REQUIRED_TOPICS.length, "FAQ catalog is unexpectedly small");
assert.deepEqual([...VOX_FAQ_TOPICS].sort(), [...REQUIRED_TOPICS].sort(), "exported FAQ topics must match required coverage");

const ids = new Set();
const coveredTopics = new Set();

for (const entry of VOX_FAQ_ENTRIES) {
  assert.ok(isText(entry.id), "each FAQ entry needs an id");
  assert.ok(!ids.has(entry.id), `duplicate FAQ id: ${entry.id}`);
  ids.add(entry.id);
  coveredTopics.add(entry.topic);

  assert.ok(REQUIRED_TOPICS.includes(entry.topic), `${entry.id}: unsupported topic ${entry.topic}`);
  assert.ok(Number.isFinite(entry.priority), `${entry.id}: priority must be numeric`);
  assert.ok(isTextArray(entry.utterances?.en), `${entry.id}: English utterances are required`);
  assert.ok(isTextArray(entry.utterances?.ar), `${entry.id}: Arabic utterances are required`);
  assert.ok(isText(entry.answer?.en), `${entry.id}: English answer is required`);
  assert.ok(isText(entry.answer?.ar), `${entry.id}: Arabic answer is required`);

  assert.ok(["static", "api"].includes(entry.delivery?.kind), `${entry.id}: delivery.kind must be static or api`);
  if (entry.delivery.kind === "api") {
    assert.ok(isText(entry.delivery.provider), `${entry.id}: API provider is required`);
    assert.ok(isTextArray(entry.delivery.requiredData), `${entry.id}: API requiredData is required`);
    assert.ok(isText(entry.delivery.instruction?.en), `${entry.id}: English API instruction is required`);
    assert.ok(isText(entry.delivery.instruction?.ar), `${entry.id}: Arabic API instruction is required`);
  }

  const metadata = entry.metadata;
  assert.ok(metadata && typeof metadata === "object", `${entry.id}: metadata is required`);
  assert.ok(["official", "product"].includes(metadata.provenance), `${entry.id}: metadata provenance must be official or product`);
  assert.ok(isTextArray(metadata.tags?.en), `${entry.id}: English tags are required`);
  assert.ok(isTextArray(metadata.tags?.ar), `${entry.id}: Arabic tags are required`);
  assert.ok(isTextArray(metadata.audience), `${entry.id}: audience is required`);
  assert.ok(Array.isArray(metadata.source), `${entry.id}: source must be an array`);
  if (metadata.provenance === "official") assert.ok(metadata.source.length > 0, `${entry.id}: official source is required`);
  if (metadata.provenance === "product") assert.equal(metadata.source.length, 0, `${entry.id}: product capabilities must not cite an unrelated policy source`);
  for (const source of metadata.source) {
    assert.ok(isText(source.title), `${entry.id}: source title is required`);
    assert.equal(source.publisher, "VOX Cinemas UAE", `${entry.id}: sources must be first-party VOX UAE pages`);
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:", `${entry.id}: source must use HTTPS`);
    assert.equal(url.hostname, "uae.voxcinemas.com", `${entry.id}: source must be official VOX Cinemas UAE`);
  }
  assert.match(metadata.update?.reviewedAt || "", /^\d{4}-\d{2}-\d{2}$/, `${entry.id}: update.reviewedAt is required`);
  assert.ok(isText(metadata.update?.cadence), `${entry.id}: update cadence is required`);
  assert.ok(isText(metadata.update?.volatility), `${entry.id}: update volatility is required`);
  assert.ok(isText(metadata.update?.freshness), `${entry.id}: update freshness rule is required`);
}

assert.deepEqual([...coveredTopics].sort(), [...REQUIRED_TOPICS].sort(), "FAQ catalog is missing a required topic");

const hours = VOX_FAQ_ENTRIES.find((entry) => entry.id === "cinema-locations-hours");
assert.equal(hours.delivery.kind, "api", "cinema locations/hours must be API-driven");
assert.doesNotMatch(hours.answer.en, /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i, "do not invent fixed cinema hours");
assert.doesNotMatch(hours.answer.ar, /\b\d{1,2}(?::\d{2})\b/, "do not invent fixed cinema hours in Arabic");

console.log(`FAQ knowledge validation passed: ${VOX_FAQ_ENTRIES.length} bilingual entries across ${coveredTopics.size} topics.`);
