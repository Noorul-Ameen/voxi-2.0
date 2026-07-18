import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ELEVENLABS_WORKLET_PATHS, VOICE_MIC_PERMISSION_TIMEOUT_MS, VOICE_TRANSPORT_START_TIMEOUT_MS, voiceStartupErrorKey } from "../src/lib/voiceStartup.js";

const [app, transport, headers, strings, rawWorklet, concatWorklet] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ElevenLabsTransport.jsx", import.meta.url), "utf8"),
  readFile(new URL("../public/_headers", import.meta.url), "utf8"),
  readFile(new URL("../src/i18n/strings.js", import.meta.url), "utf8"),
  readFile(new URL(`../public${ELEVENLABS_WORKLET_PATHS.rawAudioProcessor}`, import.meta.url), "utf8"),
  readFile(new URL(`../public${ELEVENLABS_WORKLET_PATHS.audioConcatProcessor}`, import.meta.url), "utf8"),
]);

assert.equal(ELEVENLABS_WORKLET_PATHS.rawAudioProcessor, "/elevenlabs/rawAudioProcessor.js");
assert.equal(ELEVENLABS_WORKLET_PATHS.audioConcatProcessor, "/elevenlabs/audioConcatProcessor.js");
assert.ok(VOICE_MIC_PERMISSION_TIMEOUT_MS >= 30_000, "microphone permission must allow a normal user response window");
assert.ok(VOICE_TRANSPORT_START_TIMEOUT_MS >= 30_000, "WebRTC startup must allow normal network negotiation");
assert.match(rawWorklet, /registerProcessor\("rawAudioProcessor"/);
assert.match(concatWorklet, /registerProcessor\("audioConcatProcessor"/);
assert.match(app, /connectionType:\s*"webrtc"/);
assert.match(app, /workletPaths:\s*ELEVENLABS_WORKLET_PATHS/);
assert.match(transport, /serverLocation:\s*"eu-residency"/);
assert.match(headers, /script-src 'self' blob:;/);
const scriptDirective = headers.match(/script-src[^;]+;/)?.[0] || "";
assert.match(scriptDirective, /blob:/, "ElevenLabs 0.7.1 WebRTC output capture requires a blob AudioWorklet fallback");
assert.doesNotMatch(scriptDirective, /data:/, "data: scripts must remain blocked");

assert.equal(voiceStartupErrorKey({ name: "NotAllowedError" }), "app.voicePermissionError");
assert.equal(voiceStartupErrorKey({ name: "NotFoundError" }), "app.voiceDeviceError");
assert.equal(voiceStartupErrorKey(new Error("Failed to load rawAudioProcessor worklet module")), "app.voiceComponentError");
assert.equal(voiceStartupErrorKey(new Error("WebRTC connection timed out")), "app.voiceTimeoutError");
assert.equal(voiceStartupErrorKey(new Error("Origin is unauthorized (403)")), "app.voiceServiceError");
assert.equal(voiceStartupErrorKey(new Error("unexpected")), "app.voiceStartError");

for (const key of ["voicePermissionError", "voiceDeviceError", "voiceComponentError", "voiceServiceError", "voiceTimeoutError"]) {
  assert.equal((strings.match(new RegExp(`"app\\.${key}"`, "g")) || []).length, 2, `${key} must exist in English and Arabic`);
}

console.log("Validated self-hosted ElevenLabs worklets, the scoped WebRTC blob fallback, bounded voice startup, protected WebRTC/EU residency, and bilingual failure classification.");
