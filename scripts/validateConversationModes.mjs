import assert from "node:assert/strict";
import fs from "node:fs";
import { STRINGS } from "../src/i18n/strings.js";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const strings = fs.readFileSync(new URL("../src/i18n/strings.js", import.meta.url), "utf8");

function sliceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${label} start marker must exist`);
  assert.notEqual(end, -1, `${label} end marker must exist`);
  assert.ok(end > start, `${label} markers must be ordered`);
  return source.slice(start, end);
}

const textStartup = sliceBetween(app, "const startTextSession", "const startVoiceSession", "text startup");
assert.match(textStartup, /connectionType:\s*["']websocket["']/, "text chat must explicitly use WebSocket");
assert.match(textStartup, /textOnly:\s*true/, "text chat must explicitly enable the SDK text-only path");
assert.match(textStartup, /conversation:\s*\{\s*textOnly:\s*true\s*\}/, "text chat must request the server-side text-only override");
assert.doesNotMatch(textStartup, /getUserMedia/, "text chat must never request microphone permission");

const voiceStartup = sliceBetween(app, "const startVoiceSession", "const endVoiceSession", "voice startup");
assert.match(voiceStartup, /connectionType:\s*["']webrtc["']/, "the protected voice connection must remain WebRTC");
assert.match(voiceStartup, /navigator\.mediaDevices\.getUserMedia\(\{\s*audio:\s*true\s*\}\)/, "voice startup must remain explicitly permission-gated");
assert.match(voiceStartup, /agentId:\s*import\.meta\.env\.VITE_AGENT_ID/, "voice startup must retain the configured public agent ID");

const typedMessageFlow = sliceBetween(app, "const sendText", "const sendUiTurn", "typed message flow");
assert.doesNotMatch(typedMessageFlow, /sessionModeRef\.current\s*===\s*["']voice["']\)\s*return/, "typing must not be disabled during an active voice session");
assert.match(typedMessageFlow, /const ready = sessionModeRef\.current \? true : await startTextSession/, "an existing voice session must be reused for typed messages");
assert.match(typedMessageFlow, /const agentFacingValue = normalizeCinemaAsrForAgent\(value, details\.cinema\)[\s\S]*conversation\.sendUserMessage\(agentFacingValue\)/, "typed messages must be safely normalized and sent through the active voice or text conversation");
const textComposer = sliceBetween(app, '<section aria-label={t("app.conversation")}', "</section>", "text composer");
assert.match(textComposer, /<input\b[\s\S]*?onKeyDown=\{\(event\) => event\.key === ["']Enter["'][\s\S]*?sendText\(\)/, "the text composer must remain rendered and submit while voice is active");

assert.ok((strings.match(/"app\.title":\s*"Voxi"/g) || []).length >= 2, "both language dictionaries must use the Voxi product name");
assert.ok((strings.match(/"app\.brand":\s*"VOX Cinemas UAE"/g) || []).length >= 2, "both language dictionaries must retain VOX Cinemas UAE branding");
assert.match(app, /t\("app\.title"\)/, "the header must render the Voxi product name");
assert.match(app, /t\("app\.brand"\)/, "the header must render VOX Cinemas UAE branding");
assert.doesNotMatch(app, /DEFAULT_CINEMA|item\.id\s*===\s*["']0002["']/, "the UAE product must not silently default to Mall of the Emirates");
assert.match(app, /const \[cinema, setCinema\] = useState\(null\)/, "a clean launch must begin without a selected cinema");
assert.match(app, /shown:\s*["']cinema picker["']/, "movie discovery without a cinema must display the UAE cinema picker");

assert.doesNotMatch(app, /\\u0*600[^\n]*\\u0*6ff/i, "Arabic-script detection must not auto-switch the interface language");
const messageHandler = sliceBetween(app, "onMessage:", "onError:", "conversation message handler");
assert.match(messageHandler, /resolveLanguageSignal/, "message language changes must pass through the explicit confirmation state machine");
assert.doesNotMatch(messageHandler, /isArabic|arabicScript|\\p\{Script=Arabic\}/iu, "incoming language must not switch from a raw script detector");

assert.match(app, /function LanguageSelector\s*\(/, "an explicit language selector must be rendered");
assert.match(app, /<LanguageSelector\b[^>]*onSelect=\{changeLanguage\}/, "the header language selector must call the explicit language handler");
assert.match(app, /code:\s*["']en["']/, "the language selector must expose English");
assert.match(app, /code:\s*["']ar["']/, "the language selector must expose Arabic");
assert.match(app, /item\.code\s*===\s*["']en["']\s*\?\s*["']English["']\s*:/, "the English/Arabic selector must have an explicit English accessible label");

for (const locale of ["en", "ar"]) {
  const customerError = STRINGS[locale]?.["app.textStartError"];
  assert.equal(typeof customerError, "string", `${locale} must define app.textStartError`);
  assert.ok(customerError.trim(), `${locale} app.textStartError must not be empty`);
  assert.doesNotMatch(customerError, /mic(?:rophone)?|VITE_AGENT_ID|\u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646/iu, `${locale} text-start errors must not mention microphone setup or internal configuration`);
}
assert.match(textStartup, /t\("app\.textStartError"\)/, "text startup must use the customer-facing text error");

const title = index.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
assert.ok(title, "index.html must define a document title");
assert.doesNotMatch(title, /ElevenLabs|Concierge/i, "the customer-facing document title must not expose vendor or legacy Concierge branding");

console.log("Validated text-first WebSocket chat, protected WebRTC voice, explicit language selection, Voxi branding, and customer-safe errors.");
