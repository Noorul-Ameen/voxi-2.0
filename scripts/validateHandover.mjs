import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HANDOVER_CLARIFICATION_FAILURE_LIMIT,
  HANDOVER_REASON,
  HANDOVER_SCHEMA_VERSION,
  HANDOVER_TRIGGER,
  buildHandoverPayload,
  isClarificationFailureReason,
  isSupportedHandoverReason,
  registerClarificationFailureAttempt,
  sanitizeTranscriptText,
} from "../src/lib/handoverSummary.js";

assert.match(sanitizeTranscriptText("My card is 4111 1111 1111 1111 and CVV 123"), /redacted/i);
assert.match(sanitizeTranscriptText("The show is at 20:30 on 08/15"), /20:30 on 08\/15/);
assert.equal(isClarificationFailureReason("fallback"), true);
assert.equal(isClarificationFailureReason("explicit_request"), false);
assert.equal(isClarificationFailureReason("payment_failed"), false);
assert.equal(isSupportedHandoverReason(HANDOVER_REASON.EXPLICIT_REQUEST), true);
assert.equal(isSupportedHandoverReason(HANDOVER_REASON.CLARIFICATION_FAILURE), true);
assert.equal(isSupportedHandoverReason(HANDOVER_REASON.FALLBACK), true);
assert.equal(isSupportedHandoverReason("other"), false);
assert.equal(HANDOVER_CLARIFICATION_FAILURE_LIMIT, 2);

const firstFailure = registerClarificationFailureAttempt({
  messages: [{ id: "turn-1", role: "user", text: "I do not know, my card is 4111 1111 1111 1111" }],
  detail: "Could not resolve card 4111 1111 1111 1111",
  at: "2026-07-17T10:00:00.000Z",
});
assert.equal(firstFailure.accepted, true);
assert.equal(firstFailure.thresholdReached, false);
assert.equal(firstFailure.count, 1);
assert.equal(firstFailure.remaining, 1);
assert.match(firstFailure.attempts[0].detail, /redacted/i);
assert.doesNotMatch(JSON.stringify(firstFailure.attempts), /4111/);

const duplicateFailure = registerClarificationFailureAttempt({
  attempts: firstFailure.attempts,
  messages: [{ id: "turn-1", role: "user", text: "Same user turn" }],
  detail: "Duplicate tool call",
  at: "2026-07-17T10:00:01.000Z",
});
assert.equal(duplicateFailure.accepted, false);
assert.equal(duplicateFailure.thresholdReached, false);
assert.equal(duplicateFailure.count, 1);

const secondFailure = registerClarificationFailureAttempt({
  attempts: duplicateFailure.attempts,
  messages: [
    { id: "turn-1", role: "user", text: "First unclear answer" },
    { id: "agent-1", role: "agent", text: "One concrete clarification" },
    { id: "turn-2", role: "user", text: "Second unclear answer" },
  ],
  detail: "Second clarification failed",
  at: "2026-07-17T10:00:10.000Z",
});
assert.equal(secondFailure.accepted, true);
assert.equal(secondFailure.thresholdReached, true);
assert.equal(secondFailure.count, 2);
assert.equal(secondFailure.remaining, 0);

const payload = buildHandoverPayload({
  conversationId: "conversation-test",
  requestedAt: "2026-07-12T12:00:00.000Z",
  trigger: "clarification_failure",
  clarificationFailures: 2,
  locale: "ar-AE",
  cinema: { id: "0002", name: "Mall of the Emirates" },
  movie: { id: "HO1", title: "Test Movie" },
  session: { sessionId: "S1", time: "20:30", experience: "IMAX" },
  booking: { ref: "WLTEST", total: 126, currency: "AED", paidWith: "VISA 4242", cardNumber: "4111111111111111" },
  messages: [{ role: "user", text: "My card is 4111 1111 1111 1111 and CVV 123" }],
});

assert.equal(payload.schemaVersion, HANDOVER_SCHEMA_VERSION);
assert.equal(payload.event.trigger, HANDOVER_TRIGGER.FAILED_CLARIFICATIONS);
assert.equal(payload.integration.paymentDataIncluded, false);
assert.equal(payload.journey.booking.reference, "WLTEST");
assert.equal(payload.journey.session.time, "20:30");
const serialized = JSON.stringify(payload);
assert.doesNotMatch(serialized, /4111111111111111|paidWith|cardNumber|CVV 123/i);
assert.match(serialized, /redacted/i);

const cancelledPayload = buildHandoverPayload({
  selectedSeats: [],
  booking: { ref: "WLCANCEL", seats: ["E1", "E2"], cancelled: true, total: 84 },
  messages: [{ role: "system", text: "Payment completed" }, { role: "user", text: "Please cancel it" }],
});
assert.deepEqual(cancelledPayload.journey.seats, ["E1", "E2"]);
assert.equal(cancelledPayload.journey.booking.status, "cancelled");
assert.match(cancelledPayload.conversation.summary, /cancelled/i);
assert.equal(cancelledPayload.conversation.transcript[0].role, "system");
assert.equal(cancelledPayload.conversation.lastUserIntent, "Please cancel it");

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const agentContract = JSON.parse(await readFile(new URL("../config/elevenlabs-agent-contract.json", import.meta.url), "utf8"));
const handoverContract = agentContract.tools.find((tool) => tool.name === "handover_to_agent");
assert.ok(handoverContract, "ElevenLabs contract must retain the handover_to_agent client tool");
assert.deepEqual(handoverContract.parameters.properties.reason.enum, Object.values(HANDOVER_REASON), "runtime and dashboard handover reasons must match exactly");
assert.deepEqual(handoverContract.parameters.required, ["reason"], "the dashboard must require an explicit handover reason");
const runtimeTool = appSource.slice(appSource.indexOf("handover_to_agent:"), appSource.indexOf("  };", appSource.indexOf("handover_to_agent:")));
assert.match(runtimeTool, /reason\s*=\s*""/, "a missing required reason must not default to an explicit human request");
assert.match(runtimeTool, /isSupportedHandoverReason\(normalizedReason\)/, "runtime must reject reasons outside the dashboard contract");
assert.match(runtimeTool, /registerClarificationFailureAttempt/, "runtime must count distinct guest turns rather than raw tool calls");
assert.match(runtimeTool, /duplicate_clarification_failure/, "runtime must reject a duplicate failure in one guest turn");
assert.match(runtimeTool, /existingPayload\?\.event\?\.handoverId/, "a prepared handover must be idempotent");
assert.match(runtimeTool, /mode:\s*"summary_only"/, "tool output must describe the truthful local summary boundary");
assert.match(runtimeTool, /externalConnectionStarted:\s*false/, "tool output must never imply that an external support connection started");
assert.doesNotMatch(runtimeTool, /mode:\s*"simulated"|status:\s*"connecting"/, "tool output must not invite a false live-transfer claim");

console.log("Validated exact handover reasons, distinct clarification turns, idempotent summary-only runtime behavior, and payment-free payload redaction.");
