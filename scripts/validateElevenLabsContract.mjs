import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const readText = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), "utf8");
const contract = JSON.parse(readText("config/elevenlabs-agent-contract.json"));
const app = readText("src/App.jsx");
const transport = readText("src/components/ElevenLabsTransport.jsx");
const journey = readText("src/lib/conversationJourney.js");
const vite = readText("vite.config.js");
const environmentExample = readText(".env.example");
const setupGuide = readText("ELEVENLABS_AGENT_SETUP.md");
const packageJson = JSON.parse(readText("package.json"));

const EXPECTED_AGENT_ID = "agent_2701kxvmnje2fnf9qfm1fayfc4eb";
const EXPECTED_DYNAMIC_VARIABLES = [
  "preferred_language",
  "voxi_session_id",
  "voxi_previous_conversation_id",
  "voxi_is_continuation",
  "voxi_intent",
  "voxi_movie",
  "voxi_cinema",
  "voxi_booking_progress",
  "voxi_booking_status",
  "voxi_performance_date",
  "voxi_refund_status",
  "voxi_refund_reference",
  "voxi_session_opening",
];
const EXPECTED_TOOL_PARAMETERS = Object.freeze({
  show_movie_selection: ["cinemaId", "cinemaName", "date", "displayDate", "scheduleDate"],
  show_showtimes: ["movieId", "movieTitle", "date", "displayDate", "scheduleDate"],
  show_seat_map: ["movieTitle", "sessionId", "showtime", "ticketQuantity", "date", "displayDate", "scheduleDate"],
  select_seats: ["seats"],
  show_booking_summary: ["movieTitle", "screen", "showtime", "seats", "ref", "total"],
  show_booking_for_cancellation: ["bookingRef"],
  show_offers: [
    "bankName",
    "cardName",
    "experience",
    "detailTopic",
    "format",
    "seatType",
    "isMember",
    "monthlyTicketsUsed",
    "monthlySpend",
  ],
  handover_to_agent: ["reason", "detail"],
});
const EXPECTED_TOOL_NAMES = Object.keys(EXPECTED_TOOL_PARAMETERS);
const EXPECTED_DETAIL_TOPICS = [
  "summary",
  "cards",
  "experiences",
  "limits",
  "redemption",
  "exclusions",
  "terms",
  "all",
];

function normalizeSource(value) {
  return String(value).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appHandlerParameterNames(name) {
  const startMarker = `    ${name}:`;
  const start = app.indexOf(startMarker);
  assert.notEqual(start, -1, `${name} must remain registered in App.jsx`);
  const arrow = app.indexOf("=>", start);
  assert.notEqual(arrow, -1, `${name} must remain an arrow-function client tool`);
  const signature = app.slice(start, arrow + 2);
  const match = signature.match(/\(\{([\s\S]*?)\}\s*=\s*\{\}\)\s*=>$/);
  assert.ok(match, `${name} must keep an object-parameter signature with a safe empty-object default`);
  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/[:=]/, 1)[0].trim());
}

assert.equal(contract.schemaVersion, "voxi.elevenlabs-agent-contract.v1");
assert.match(contract.contractVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/, "the contract must use an auditable dated version");
assert.equal(contract.publicAgentId, EXPECTED_AGENT_ID);
assert.equal(contract.firstMessageTemplate, "{{voxi_session_opening}}");

assert.equal(contract.transport.voiceConnectionType, "webrtc");
assert.equal(contract.transport.textConnectionType, "websocket");
assert.equal(contract.transport.textOnly, true);
assert.equal(contract.transport.serverLocation, "eu-residency");
assert.equal(contract.transport.agentLanguageOverride, false);
assert.equal(contract.transport.agentFirstMessageOverride, false);
assert.match(transport, /serverLocation:\s*"eu-residency"/, "the protected EU residency setting must remain in the SDK hook");
assert.match(app, /connectionType:\s*"webrtc"/, "voice must remain on WebRTC");
assert.match(app, /connectionType:\s*"websocket"/, "text chat must remain on WebSocket");
assert.match(app, /textOnly:\s*true/, "text chat must remain microphone-free");
assert.equal((app.match(/agentId:\s*import\.meta\.env\.VITE_AGENT_ID/g) || []).length, 2, "text and voice must both use the configured public agent ID");
assert.match(vite, new RegExp(`const PUBLIC_AGENT_ID = "${escapeRegExp(EXPECTED_AGENT_ID)}"`));
assert.match(vite, /env\.VITE_AGENT_ID\s*\|\|\s*PUBLIC_AGENT_ID/, "an empty environment value must fall back to the validated public ID");
assert.match(environmentExample, /^VITE_AGENT_ID=\s*$/m, ".env.example must not override the valid fallback with a fake nonempty ID");

assert.equal(contract.language.primary, "en");
assert.deepEqual(contract.language.supported.map(({ code }) => code), ["en", "ar"]);
assert.deepEqual(contract.language.supported.map(({ locale }) => locale), ["en-AE", "ar-AE"]);
assert.equal(contract.language.detection.policy, "explicit_confirmation_only");
assert.equal(contract.language.detection.automaticSwitchingAllowed, false);
assert.equal(contract.language.detection.elevenLabsLanguageDetectionSystemToolEnabled, false);
assert.deepEqual(contract.language.detection.confirmedSignals, [
  "visible_language_selector",
  "direct_language_command",
  "confirmed_language_prompt",
]);

assert.deepEqual(contract.dynamicVariables.required, EXPECTED_DYNAMIC_VARIABLES);
assert.deepEqual(Object.keys(contract.dynamicVariables.dashboardDefaults), EXPECTED_DYNAMIC_VARIABLES);
const journeyFunction = journey.slice(journey.indexOf("export function journeyDynamicVariables"));
const journeyReturn = journeyFunction.match(/return\s*\{([\s\S]*?)\n\s*\};/);
assert.ok(journeyReturn, "journeyDynamicVariables must return the dashboard scalar variables");
const journeyVariableNames = [...journeyReturn[1].matchAll(/^\s{4}([a-z][a-z0-9_]+):/gm)].map((match) => match[1]);
assert.deepEqual(journeyVariableNames, EXPECTED_DYNAMIC_VARIABLES.filter((name) => name !== "voxi_session_opening"));
assert.equal((app.match(/voxi_session_opening:/g) || []).length, 2, "text and voice must both provide the first-message dynamic variable");

assert.equal(contract.tools.length, EXPECTED_TOOL_NAMES.length);
assert.deepEqual(contract.tools.map(({ name }) => name), EXPECTED_TOOL_NAMES);
assert.equal(new Set(contract.tools.map(({ name }) => name)).size, EXPECTED_TOOL_NAMES.length, "client-tool names must be unique");
for (const tool of contract.tools) {
  const expectedParameters = EXPECTED_TOOL_PARAMETERS[tool.name];
  assert.ok(expectedParameters, `unexpected client tool in contract: ${tool.name}`);
  assert.equal(tool.type, "client", `${tool.name} must remain a client tool`);
  assert.equal(tool.waitForResponse, true, `${tool.name} must return its authoritative result before the agent describes the outcome`);
  assert.equal(tool.parameters.type, "object", `${tool.name} parameters must use an object schema`);
  assert.equal(tool.parameters.additionalProperties, false, `${tool.name} must reject undeclared parameters`);
  assert.deepEqual(sorted(Object.keys(tool.parameters.properties)), sorted(expectedParameters), `${tool.name} dashboard parameters must match the runtime handler`);
  assert.deepEqual(sorted(appHandlerParameterNames(tool.name)), sorted(expectedParameters), `${tool.name} runtime parameters must match the checked-in contract`);
  assert.ok(Array.isArray(tool.parameters.required), `${tool.name} must declare its required-parameter list`);
  for (const requiredName of tool.parameters.required) {
    assert.ok(expectedParameters.includes(requiredName), `${tool.name} requires an undeclared parameter: ${requiredName}`);
  }
}

const seatMapTool = contract.tools.find(({ name }) => name === "show_seat_map");
assert.equal(seatMapTool.interactionBlocking, false, "show_seat_map must never wait for the guest's seat-selection turn");
assert.match(seatMapTool.parameters.properties.ticketQuantity.description, /conversational seat target only/i);
const selectSeatsTool = contract.tools.find(({ name }) => name === "select_seats");
assert.deepEqual(Object.keys(selectSeatsTool.parameters.properties), ["seats"]);
assert.deepEqual(selectSeatsTool.parameters.required, ["seats"]);
assert.equal(selectSeatsTool.parameters.properties.seats.type, "array");
const offersTool = contract.tools.find(({ name }) => name === "show_offers");
assert.deepEqual(offersTool.parameters.properties.detailTopic.enum, EXPECTED_DETAIL_TOPICS);
assert.ok(!Object.hasOwn(offersTool.parameters.properties, "ticketCount"), "offer ticket count must remain locally derived from selected seats");
assert.ok(!Object.hasOwn(offersTool.parameters.properties, "orderTotal"), "offer order total must remain locally derived from checkout");

assert.equal(contract.prompt.source, "src/lib/voxiSession.js");
assert.equal(contract.prompt.exportName, "VOXI_AGENT_PROMPT");
assert.equal(contract.prompt.version, contract.contractVersion, "prompt and contract versions must move together");
assert.equal(contract.prompt.hashAlgorithm, "sha256");
assert.equal(contract.prompt.hashNormalization, "utf8_lf");
const promptSource = readText(contract.prompt.source);
assert.match(promptSource, new RegExp(`export const ${escapeRegExp(contract.prompt.exportName)}\\s*=`), "the configured prompt export must exist");
assert.match(promptSource, /After a microphone voice yes\/no answer[\s\S]*call show_booking_for_cancellation exactly once with the same active booking reference and wait for its response[\s\S]*Speak only the returned message once/, "the agent prompt must route microphone cancellation decisions through the authoritative client tool result");
assert.match(promptSource, /Typed yes\/no cancellation decisions are handled locally by the widget and are not sent as a new agent turn/, "the agent prompt must distinguish widget-local typed cancellation decisions");
assert.match(promptSource, /During an eligible retryable cancellation error[\s\S]*spoken no or keep-booking answer must also call show_booking_for_cancellation exactly once with the same active booking reference and wait for its response[\s\S]*Speak only the returned message once so the tool owns the acknowledgement/, "the prompt must route a spoken retryable-error decline through one authoritative tool response");
assert.match(promptSource, /spoken yes during an error does not authorize a destructive retry/, "the prompt must reject destructive retries from an error-state yes answer");
const promptHash = createHash("sha256").update(normalizeSource(promptSource), "utf8").digest("hex");
assert.equal(promptHash, contract.prompt.sha256, "the ElevenLabs prompt hash changed without a contract version update");

assert.match(setupGuide, new RegExp("Target agent: `" + escapeRegExp(EXPECTED_AGENT_ID) + "`"));
assert.match(setupGuide, new RegExp("Prompt contract version: `" + escapeRegExp(contract.prompt.version) + "`"));
assert.match(setupGuide, new RegExp("Prompt source SHA-256: `" + escapeRegExp(contract.prompt.sha256) + "`"));
assert.match(setupGuide, /first-message field as `\{\{voxi_session_opening\}\}`/);
assert.match(setupGuide, /Disable the ElevenLabs `language_detection` system tool/);
assert.match(setupGuide, /`showtimeRequired: true`/);
assert.doesNotMatch(setupGuide, /showtime_required/, "offer guidance must use the boolean returned by the runtime tool");
for (const name of EXPECTED_TOOL_NAMES) {
  assert.match(setupGuide, new RegExp("## `" + escapeRegExp(name) + "`"), `${name} must have a complete dashboard setup section`);
}
for (const name of EXPECTED_DYNAMIC_VARIABLES) {
  assert.match(setupGuide, new RegExp("`" + escapeRegExp(name) + "`"), `${name} must be documented for the dashboard`);
}
assert.match(packageJson.scripts.validate, /node scripts\/validateElevenLabsContract\.mjs/, "the contract validator must run in the main validation chain");

for (const [label, source] of [
  ["contract", JSON.stringify(contract)],
  ["setup guide", setupGuide],
  ["environment example", environmentExample],
]) {
  assert.doesNotMatch(source, /[\u2013\u2014]/u, `${label} must not introduce Unicode en dash or em dash characters`);
}

console.log(`Validated ElevenLabs contract ${contract.contractVersion}: ${contract.tools.length} client tools, ${EXPECTED_DYNAMIC_VARIABLES.length} dynamic variables, WebRTC, EU residency, bilingual explicit-switch policy, and prompt hash.`);
