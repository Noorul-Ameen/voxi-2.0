import React from "react";
import { Check, ChevronDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { C } from "../theme.js";
import { HANDOVER_STATUS, stripPaymentFields } from "../lib/handoverSummary.js";

const DEFAULT_LABELS = Object.freeze({
  connectingTitle: "Preparing Customer Care summary\u2026",
  connectingBody: "We're preparing a safe summary so your context is easy to continue.",
  readyTitle: "Customer Care summary prepared",
  readyBody: "No external support connection has been started.",
  simulation: "Summary only",
  debugTitle: "Summary details",
  debugHint: "Payment fields and digit-heavy transcript data are removed.",
  summaryStep: "Summary",
  queueReadyStep: "Prepared",
  connectingStep: "Preparing",
  safeContext: "Safe conversation summary prepared",
});

export function HandoverPanel({
  payload,
  status: controlledStatus,
  connectingDelayMs = 1400,
  onStatusChange,
  onReady,
  labels: labelOverrides,
  debugOpenByDefault = false,
  showDebug = false,
}) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [internalStatus, setInternalStatus] = React.useState(HANDOVER_STATUS.CONNECTING);
  const status = controlledStatus ?? internalStatus;
  const safePayload = React.useMemo(() => stripPaymentFields(payload ?? {}), [payload]);

  React.useEffect(() => {
    if (controlledStatus !== undefined || status !== HANDOVER_STATUS.CONNECTING) return undefined;
    const timer = window.setTimeout(() => {
      setInternalStatus(HANDOVER_STATUS.QUEUE_READY);
      onStatusChange?.(HANDOVER_STATUS.QUEUE_READY);
      onReady?.(safePayload);
    }, Math.max(0, connectingDelayMs));
    return () => window.clearTimeout(timer);
  }, [connectingDelayMs, controlledStatus, onReady, onStatusChange, safePayload, status]);

  React.useEffect(() => {
    if (controlledStatus === undefined) setInternalStatus(HANDOVER_STATUS.CONNECTING);
  }, [controlledStatus, safePayload?.event?.handoverId]);

  const isReady = status === HANDOVER_STATUS.QUEUE_READY;
  const title = isReady ? labels.readyTitle : labels.connectingTitle;
  const body = isReady ? labels.readyBody : labels.connectingBody;

  return (
    <section
      aria-live="polite"
      aria-busy={!isReady}
      data-testid="handover-panel"
      style={{
        width: "100%",
        maxWidth: 420,
        margin: "0 auto",
        overflow: "hidden",
        borderRadius: 16,
        border: `1px solid ${isReady ? "#B9DFD0" : C.border}`,
        background: `linear-gradient(155deg, ${C.primarySoft}, ${C.surface})`,
        boxShadow: `0 18px 48px ${C.shadow}`,
      }}
    >
      <div style={{ padding: "20px 18px 17px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
          <div style={{
            display: "grid",
            width: 42,
            height: 42,
            flexShrink: 0,
            placeItems: "center",
            borderRadius: 13,
            background: isReady ? C.successSoft : C.primarySoft,
            color: isReady ? C.green : C.primary,
          }}>
            {isReady ? <ShieldCheck size={21} /> : <LoaderCircle size={21} />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
              <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.25, color: C.text }}>{title}</h2>
              <span style={{
                borderRadius: 999,
                background: C.surfaceAlt,
                padding: "3px 7px",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: C.muted,
              }}>{labels.simulation}</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, color: C.muted }}>{body}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", alignItems: "center", gap: 7, marginTop: 18 }}>
          <ProgressStep active complete={isReady} icon={<Check size={12} />} label={labels.summaryStep} />
          <span aria-hidden="true" style={{ height: 1, background: isReady ? C.green : C.border }} />
          <ProgressStep active={isReady} icon={isReady ? <Check size={12} /> : <ShieldCheck size={12} />} label={isReady ? labels.queueReadyStep : labels.connectingStep} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.border}`, padding: "10px 18px", fontSize: 10, color: C.muted }}>
        <ShieldCheck size={13} color={C.green} />
        {labels.safeContext}
      </div>

      {showDebug && (
        <details open={debugOpenByDefault} style={{ borderTop: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <summary style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 18px",
            cursor: "pointer",
            listStyle: "none",
            color: C.primary,
          }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>{labels.debugTitle}</span>
              <span style={{ display: "block", marginTop: 2, fontSize: 9, lineHeight: 1.35, color: C.muted }}>{labels.debugHint}</span>
            </span>
            <ChevronDown size={15} style={{ flexShrink: 0 }} />
          </summary>
          <pre
            dir="ltr"
            data-testid="handover-debug-payload"
            style={{
              maxHeight: 250,
              margin: 0,
              overflow: "auto",
              borderTop: `1px solid ${C.border}`,
              padding: "13px 16px 16px",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 9,
              lineHeight: 1.55,
              color: C.text,
            }}
          >{JSON.stringify(safePayload, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function ProgressStep({ active, complete, icon, label }) {
  return (
    <span style={{ display: "flex", minWidth: 0, alignItems: "center", gap: 6, fontSize: 10, color: active ? C.text : C.muted }}>
      <span style={{
        display: "grid",
        width: 20,
        height: 20,
        flexShrink: 0,
        placeItems: "center",
        borderRadius: 999,
        background: complete ? C.green : active ? C.primary : C.surfaceAlt,
        color: complete || active ? C.onPrimary : C.muted,
      }}>{icon}</span>
      <span style={{ overflowWrap: "anywhere", lineHeight: 1.25 }}>{label}</span>
    </span>
  );
}

export default HandoverPanel;
