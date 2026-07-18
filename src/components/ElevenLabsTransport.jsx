import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useConversation } from "@elevenlabs/react";

const ElevenLabsTransport = forwardRef(function ElevenLabsTransport({
  callbacks,
  clientTools,
  generation,
  isActive,
  onStatus,
}, ref) {
  const guardedClientTools = Object.fromEntries(Object.entries(clientTools).map(([name, tool]) => [
    name,
    (...args) => isActive(generation)
      ? tool(...args)
      : JSON.stringify({ success: false, reason: "stale_transport" }),
  ]));

  /* ========================================================================
   * REAL ELEVENLABS CONNECTION - do not change the location or client-tool
   * names. Text and voice connection types remain supplied by their callers.
   * ====================================================================== */
  const sdk = useConversation({
    clientTools: guardedClientTools,
    serverLocation: "eu-residency",
    onConnect: (details) => {
      if (isActive(generation)) callbacks.onConnect?.(details);
    },
    onDisconnect: (details) => {
      if (isActive(generation)) callbacks.onDisconnect?.(details);
    },
    ["onMessage"]: (message) => {
      if (isActive(generation)) callbacks.onMessage?.(message);
    },
    onError: (error, context) => {
      if (isActive(generation)) callbacks.onError?.(error, context);
    },
  });
  const sdkRef = useRef(sdk);
  sdkRef.current = sdk;

  useImperativeHandle(ref, () => ({
    startSession: (...args) => sdkRef.current.startSession(...args),
    endSession: (...args) => sdkRef.current.endSession(...args),
    getId: (...args) => sdkRef.current.getId?.(...args),
    sendContextualUpdate: (...args) => sdkRef.current.sendContextualUpdate?.(...args),
    sendUserMessage: (...args) => sdkRef.current.sendUserMessage?.(...args),
    sendUserActivity: (...args) => sdkRef.current.sendUserActivity?.(...args),
  }), []);

  useEffect(() => {
    if (isActive(generation)) onStatus(generation, sdk.status);
  }, [generation, isActive, onStatus, sdk.status]);

  return null;
});

export default ElevenLabsTransport;
