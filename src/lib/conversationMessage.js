/**
 * Normalize the public @elevenlabs/client onMessage callback contract.
 *
 * v0.7 emits `{ source: "user" | "ai", message: string }` for both WebRTC
 * voice transcripts and WebSocket text replies. The guarded fallbacks keep the
 * UI resilient to event wrappers used by browser test harnesses without
 * coupling the booking router to a transport-specific envelope.
 */
export function normalizeElevenLabsMessageEvent(event) {
  const candidate = event?.detail && typeof event.detail === "object" ? event.detail : event;
  const nestedMessage = candidate?.message && typeof candidate.message === "object" ? candidate.message : null;
  const source = String(candidate?.source ?? nestedMessage?.source ?? candidate?.role ?? "").toLowerCase();
  const message = typeof candidate?.message === "string"
    ? candidate.message
    : typeof nestedMessage?.message === "string"
      ? nestedMessage.message
      : typeof candidate?.text === "string"
        ? candidate.text
        : "";
  const text = message.normalize("NFKC").trim();
  if (!text) return null;

  return {
    role: ["user", "client", "human"].includes(source) ? "user" : "agent",
    source: source || "ai",
    text,
  };
}
