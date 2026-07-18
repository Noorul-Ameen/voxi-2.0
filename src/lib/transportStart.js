export const TRANSPORT_START_TIMEOUT_MS = 15_000;

function startTimeout(timeoutMs) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error("Conversation start timed out")), timeoutMs);
  });
  return {
    promise,
    cancel: () => globalThis.clearTimeout(timer),
  };
}

/**
 * Starts one SDK transport with a bounded wait. When the SDK promise outlives
 * that bound, the caller retires the transport host synchronously. Cleanup is
 * deliberately attached to the original handle and never awaited, so a fresh
 * host can retry even if the old SDK promise never settles.
 */
export async function startTransportWithRetirement({
  transport,
  options,
  retire,
  timeoutMs = TRANSPORT_START_TIMEOUT_MS,
}) {
  const rawStart = transport.startSession(options);
  const timeout = startTimeout(timeoutMs);

  try {
    return await Promise.race([rawStart, timeout.promise]);
  } catch (error) {
    if (/timed out/i.test(error?.message || "")) {
      retire();
      void Promise.resolve(rawStart)
        .then(() => transport.endSession())
        .catch(() => {});
    }
    throw error;
  } finally {
    timeout.cancel();
  }
}
