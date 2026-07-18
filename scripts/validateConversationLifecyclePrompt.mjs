import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VOXI_AGENT_PROMPT } from "../src/lib/voxiSession.js";

const setupGuide = readFileSync(new URL("../ELEVENLABS_AGENT_SETUP.md", import.meta.url), "utf8");

assert.match(
  VOXI_AGENT_PROMPT,
  /temporarily changes to an unrelated topic or FAQ[\s\S]*hide the currently visible rich[\s\S]*panel while you answer the unrelated turn/i,
  "an unrelated conversational turn must hide the currently visible rich panel",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /Preserve the exact booking or cancellation journey as paused context/i,
  "booking and cancellation state must remain paused behind an unrelated answer",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /ordinary topic change, FAQ, voice disconnect, or switch between voice and text must never clear, complete, or replace that paused state/i,
  "non-terminal topic and transport changes must preserve paused state",
);

const restorePhrases = [
  "Continue my booking",
  "Go back to the seats",
  "Show the showtimes again",
  "Return to checkout",
  "Continue where I stopped",
];
for (const phrase of restorePhrases) {
  assert.ok(VOXI_AGENT_PROMPT.includes(`"${phrase}"`), `the prompt must recognize the restore phrase: ${phrase}`);
  assert.ok(setupGuide.includes(`"${phrase}"`), `the setup guide must test the restore phrase: ${phrase}`);
}
assert.match(
  VOXI_AGENT_PROMPT,
  /Resume the matching paused stage only after the widget restores and revalidates it/i,
  "restoration must wait for authoritative revalidation",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /End and clear the current booking journey only when the guest explicitly asks to abandon or end that journey/i,
  "only an explicit lifecycle-ending request may clear the current journey",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /Cancelling an existing booking record is a different action/i,
  "record cancellation must remain distinct from abandoning an in-progress journey",
);

for (const selector of [
  "booking reference",
  "movie title",
  "performance date",
  "relative date",
  "exact showtime",
  "time band",
  "cinema",
  "displayed list position",
  "this movie",
]) {
  assert.ok(VOXI_AGENT_PROMPT.toLowerCase().includes(selector), `the prompt must accept the cancellation selector: ${selector}`);
}
assert.match(
  VOXI_AGENT_PROMPT,
  /Accept any combination of these criteria and keep their intersection/i,
  "combined cancellation criteria must narrow the target together",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /ask only for the smallest missing detail that distinguishes them/i,
  "ambiguous cancellation matches must receive one focused clarification",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /exactly these booking details: movie, cinema, performance date, showtime, booking reference, and cancellation or refund impact/i,
  "cancellation confirmation fields must stay concise and deterministic",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /Follow those details with one yes\/no confirmation question/i,
  "the confirmation must end with one yes or no question",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /controls are already visible[\s\S]*still speak the supplied exact confirmation once[\s\S]*both text and voice guests/i,
  "visible confirmation controls must not suppress the complete conversational confirmation",
);
assert.doesNotMatch(
  VOXI_AGENT_PROMPT,
  /prompt is already visible, do not restate it/i,
  "the prompt must not reduce voice cancellation confirmation to a generic pointer",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /booking-history context[\s\S]*visible list is authoritative[\s\S]*never say there are no bookings or demand a booking reference/i,
  "a populated booking history must not be contradicted or gated by a reference request",
);

assert.match(
  VOXI_AGENT_PROMPT,
  /guest must click or tap the checkout controls themselves/i,
  "secure payment must remain a guest-controlled click or tap",
);
assert.match(
  VOXI_AGENT_PROMPT,
  /Never treat a spoken or typed instruction[\s\S]*as payment authorization/i,
  "voice and text must never authorize payment",
);

for (const [label, source] of [["prompt", VOXI_AGENT_PROMPT], ["setup guide", setupGuide]]) {
  assert.doesNotMatch(source, /[\u2013\u2014]/u, `${label} must not contain Unicode en dash or em dash punctuation`);
}

console.log("Validated prompt rules for paused rich journeys, conversational restoration, explicit journey endings, natural cancellation targeting, concise confirmation, and click-or-tap payment.");
