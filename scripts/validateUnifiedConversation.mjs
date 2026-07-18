import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const media = fs.readFileSync(new URL("../src/components/RichMedia.jsx", import.meta.url), "utf8");

assert.equal((app.match(/role="log"/g) || []).length, 1, "the widget must have one transcript log");
assert.match(app, /<main ref=\{scrollRef\}[^>]*aria-label=\{t\("app\.conversation"\)\}/, "messages and stage UI must share the main scroll window");
assert.match(app, /const stageAnchorRef = useRef\(null\)/, "rich panels must have a stable top scroll anchor");
assert.match(app, /visibleStageView !== "empty" && <div ref=\{stageAnchorRef\}/, "the scroll anchor must sit immediately before a visible rich panel");
assert.match(app, /anchor\.getBoundingClientRect\(\)\.top[\s\S]*scroller\.scrollTop = Math\.max\(0, target\)/, "a new rich panel must open at its beginning instead of its bottom");
assert.doesNotMatch(app, /scrollTo\(0,\s*scrollRef\.current\.scrollHeight\)[\s\S]{0,100}\[messages,\s*stage\]/, "long movie and booking panels must not auto-scroll to their last item");
assert.doesNotMatch(app, /maxHeight:\s*200/, "the old detached 200px transcript must be removed");
assert.doesNotMatch(app, /stage\.view === "faq"|function FaqPanel/, "FAQ answers must remain in chat without adding a stale rich panel");
assert.match(app, /preserveBookingIntent[\s\S]*"seatmap"[\s\S]*"checkout"/, "FAQ interruptions must preserve logical booking intent");
assert.match(app, /pauseRenderingForUnrelatedTurn[\s\S]*pauseRichRenderingForTopicChange/, "FAQ interruptions must hide the old rich panel until an explicit restore turn");
assert.match(app, /<DateStrip\b/, "the extracted date range must render inline");
assert.doesNotMatch(app, /<TicketQuantityControl\b|function TicketQuantityControl/, "the seat map must not render a separate ticket quantity control");
assert.match(app, /requestedTarget=\{requestedSeatTarget\}/, "a spoken quantity may remain as non-interactive seat-selection guidance");
assert.match(app, /voxi:new-conversation/);
assert.match(app, /voxi:logout/);
assert.match(app, /CONVERSATION_IDLE_MS/);
const appCallbacksStart = app.indexOf("const transportCallbacks = {");
const disconnectStart = app.indexOf("onDisconnect:", appCallbacksStart);
const disconnectFlow = app.slice(disconnectStart, app.indexOf("onMessage:", disconnectStart));
assert.match(disconnectFlow, /if \(reason === "timeout"\) \{\s*clearConversationState\(reason\);\s*\}/, "only the deliberate app inactivity timeout should clear local UI state on disconnect");
assert.doesNotMatch(disconnectFlow, /dismissPendingCancellation|setCancellationFlow\(null\)/, "a transport-only disconnect must preserve the shared cancellation confirmation so text can continue it");
assert.doesNotMatch(app, /cancelResolver/, "non-blocking cancellation must not retain obsolete promise-resolver transport branches");
assert.match(app, /posterUrl:\s*movie\?\.posterUrl/, "completed orders must retain their poster URL");
assert.match(media, /getMoviePosterUrl\(booking\)/, "booking confirmation must resolve a poster with fallback support");
const cancellationTool = app.slice(app.indexOf("show_booking_for_cancellation: async"), app.indexOf("show_offers: async"));
assert.match(cancellationTool, /const demoOnly =/, "cancellation must distinguish device-only records before discussing a refund route");
assert.match(cancellationTool, /phase:\s*"final_confirmation"[\s\S]*refundRoute:\s*null[\s\S]*demoOnly:\s*true/, "device-only removal must bypass VOX Wallet selection");
assert.match(cancellationTool, /VOX will not be contacted and no refund will be issued/, "device-only removal copy must not promise a real cancellation or refund");
assert.match(cancellationTool, /Cancellation eligibility could not be verified/, "unverified live cancellation eligibility must fail closed");
assert.match(app, /refundRoute:\s*isDemoSimulation\s*\?\s*null\s*:\s*"VOX Wallet"/, "device-only cancellation records must not claim a VOX Wallet refund route");
assert.doesNotMatch(app, /Ø§Ø®ØªØ±Øª/, "Arabic cinema selection transcript must not contain mojibake");

console.log("Validated unified inline rendering, guided controls, disconnect preservation, lifecycle resets, and confirmation poster wiring.");
