import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, CreditCard, Lock, Plus, Smartphone } from "lucide-react";
import { C } from "../theme.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import {
  DEMO_CARD_STORAGE_KEY,
  DEVICE_SESSION_EPOCH_KEY,
  formatDemoPan,
  isLuhnValid,
  isValidDemoExpiry,
  sanitizeStoredCardMetadata,
  toStoredCardMetadata,
} from "../checkoutSafety.js";

function loadCards(deviceSessionEpoch) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_CARD_STORAGE_KEY) || "null");
    if (!parsed || parsed.epoch !== deviceSessionEpoch || !Array.isArray(parsed.cards)) return [];
    return parsed.cards.map(sanitizeStoredCardMetadata).filter(Boolean);
  } catch {
    return [];
  }
}

function saveCards(cards, deviceSessionEpoch) {
  try {
    if (!deviceSessionEpoch || localStorage.getItem(DEVICE_SESSION_EPOCH_KEY) !== deviceSessionEpoch) return false;
    const metadataOnly = cards.map(sanitizeStoredCardMetadata).filter(Boolean);
    const serialized = JSON.stringify({ epoch: deviceSessionEpoch, cards: metadataOnly });
    localStorage.setItem(DEMO_CARD_STORAGE_KEY, serialized);
    if (localStorage.getItem(DEVICE_SESSION_EPOCH_KEY) !== deviceSessionEpoch) {
      if (localStorage.getItem(DEMO_CARD_STORAGE_KEY) === serialized) localStorage.removeItem(DEMO_CARD_STORAGE_KEY);
      return false;
    }
    return localStorage.getItem(DEMO_CARD_STORAGE_KEY) === serialized;
  } catch {
    // The checkout remains usable when storage is unavailable.
    return false;
  }
}

function resolveCheckoutMode(mode) {
  const explicitMode = String(mode || "").trim().toLowerCase();
  if (explicitMode === "live" || explicitMode === "demo") return explicitMode;
  // Vista configuration controls read data only. Checkout remains simulated unless
  // a future integration explicitly opts this component into another mode.
  return "demo";
}

function emptyCardForm() {
  return { pan: "", name: "", exp: "", cvv: "" };
}

export default function Checkout({ order, onPaid, onCancel, onRetry, onPaymentStateChange, mode, deviceSessionEpoch }) {
  const { t, dir, formatCurrency } = useI18n();
  const checkoutMode = resolveCheckoutMode(mode);
  const seats = Array.isArray(order?.seats) ? order.seats : [];
  const currency = order?.currency || "AED";
  const subtotal = order?.subtotal != null && Number.isFinite(Number(order.subtotal)) ? Number(order.subtotal) : null;
  const feeTotal = order?.feeTotal != null && Number.isFinite(Number(order.feeTotal)) ? Number(order.feeTotal) : null;
  const [cards, setCards] = useState(() => loadCards(deviceSessionEpoch));
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyCardForm);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(null);
  const [done, setDone] = useState(false);
  const timersRef = useRef([]);
  const mountedRef = useRef(true);
  const paymentStartedRef = useRef(false);
  const completionSentRef = useRef(false);
  const sensitiveFormRef = useRef(form);

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };

  const clearSensitiveForm = (updateUi = true) => {
    const cleared = emptyCardForm();
    sensitiveFormRef.current = cleared;
    if (updateUi && mountedRef.current) setForm(cleared);
  };

  const updateFormField = (field, value) => {
    const next = { ...sensitiveFormRef.current, [field]: value };
    sensitiveFormRef.current = next;
    setForm(next);
  };

  useEffect(() => { saveCards(cards, deviceSessionEpoch); }, [cards, deviceSessionEpoch]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      paymentStartedRef.current = true;
      onPaymentStateChange?.(false);
      clearTimers();
      clearSensitiveForm(false);
    };
  }, [onPaymentStateChange]);

  const cancelCheckout = () => {
    paymentStartedRef.current = true;
    onPaymentStateChange?.(false);
    clearTimers();
    clearSensitiveForm();
    setError("");
    onCancel?.();
  };

  const pay = (method, label) => {
    if (checkoutMode !== "demo" || paymentStartedRef.current) return;
    paymentStartedRef.current = true;
    onPaymentStateChange?.(true);
    setPaying(method);
    const checkoutId = order?.checkoutId;
    const authorizationTimer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setDone(true);
      const completionTimer = window.setTimeout(() => {
        if (!mountedRef.current || completionSentRef.current) return;
        completionSentRef.current = true;
        clearSensitiveForm();
        onPaid?.({ method, label, checkoutId });
      }, 700);
      timersRef.current.push(completionTimer);
    }, 1600);
    timersRef.current.push(authorizationTimer);
  };

  const addCard = () => {
    if (!isLuhnValid(form.pan)) return setError(t("checkout.cardInvalid"));
    if (!isValidDemoExpiry(form.exp)) return setError(t("checkout.expiryInvalid"));
    if (!/^\d{3,4}$/.test(form.cvv)) return setError(t("checkout.cvvInvalid"));
    if (!form.name.trim()) return setError(t("checkout.nameRequired"));

    // Only masked, token-like display metadata survives this synchronous handler.
    const metadata = toStoredCardMetadata(form, `demo-${Date.now()}`);
    setCards((current) => [...current, metadata]);
    setSelected(metadata.id);
    setAdding(false);
    setError("");
    clearSensitiveForm();
  };

  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button type="button" aria-label={t("checkout.editSeats")} onClick={cancelCheckout} style={backButton}>
          <ChevronLeft size={18} style={{ transform: dir === "rtl" ? "rotate(180deg)" : "none" }} />
          <span>{t("checkout.editSeats")}</span>
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{t("checkout.title")}</div>
          <div style={{ overflow: "hidden", fontSize: 11, color: C.muted, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <bdi dir="auto">{order?.movieTitle}</bdi> · <span dir="ltr">{order?.showtime}</span> · {t("checkout.seatsLabel")} <span dir="ltr">{seats.join(", ")}</span>
          </div>
        </div>
      </div>
      <div style={summaryCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.muted }}>{t("checkout.seatCountOnly", { count: seats.length })} · <span dir="ltr">{order?.screen}</span></span>
          <span dir="ltr" style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{formatCurrency(order?.total || 0, currency)}</span>
        </div>
        {subtotal != null && <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", marginTop: 9, borderTop: `1px solid ${C.border}`, paddingTop: 8, color: C.muted, fontSize: 10 }}>
          <span>{t("checkout.subtotal")}</span><span dir="ltr">{formatCurrency(subtotal, currency)}</span>
          {feeTotal != null && <><span>{t("checkout.fees")}</span><span dir="ltr">{formatCurrency(feeTotal, currency)}</span></>}
          <strong style={{ color: C.text }}>{t("checkout.total")}</strong><strong dir="ltr" style={{ color: C.text }}>{formatCurrency(order?.total || 0, currency)}</strong>
        </div>}
      </div>
    </>
  );

  if (checkoutMode === "live") {
    return (
      <div>
        {header}
        <div role="alert" style={unavailableCard}>
          <AlertTriangle size={26} color={C.warning} aria-hidden="true" />
          <div style={{ marginTop: 10, color: C.text, fontSize: 15, fontWeight: 800 }}>{t("checkout.liveUnavailable")}</div>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{t("checkout.liveUnavailableBody")}</p>
          {onRetry && <button type="button" onClick={onRetry} style={{ ...actionButton, marginTop: 12, background: C.primary }}>{t("error.retry")}</button>}
        </div>
      </div>
    );
  }

  if (paying) {
    const label = paying === "apple" ? t("checkout.applePay") : paying === "samsung" ? t("checkout.samsungPay") : t("checkout.cardPayment");
    return (
      <div style={{ display: "flex", minHeight: 320, flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ marginBottom: 10, borderRadius: 999, background: C.warningSoft, padding: "4px 9px", color: C.warning, fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>{t("checkout.testOnly")}</div>
        <div style={{ display: "flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 20, background: done ? C.successSoft : C.primarySoft, marginBottom: 18 }}>
          {done ? <Check size={30} color={C.green} /> : <div style={spinner} />}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>{done ? t("checkout.approved") : t("checkout.authorizing", { method: label })}</div>
        <div style={{ marginTop: 6, color: C.muted, fontSize: 12 }}>{done ? t("checkout.confirming") : t("checkout.demoAuth")}</div>
        <div dir="ltr" style={{ marginTop: 14, color: C.text, fontSize: 22, fontWeight: 800 }}>{formatCurrency(order?.total || 0, order?.currency || "AED")}</div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div id="checkout-safety-notice" role="note" style={demoNotice}>
        <strong>{t("checkout.testOnly")}</strong> · {t("checkout.testNotice")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <button type="button" aria-describedby="checkout-safety-notice" onClick={() => pay("apple", "Apple Pay")} style={{ ...walletButton, background: "#000", border: "1px solid rgba(255,255,255,.25)" }}>{t("checkout.applePay")}</button>
        <button type="button" aria-describedby="checkout-safety-notice" onClick={() => pay("samsung", "Samsung Pay")} style={{ ...walletButton, background: "#1428A0" }}><Smartphone size={15} aria-hidden="true" style={{ marginInlineEnd: 6 }} /> {t("checkout.samsungPay")}</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 12px", color: C.muted, fontSize: 11 }}>
        <div style={divider} /> {t("checkout.orCard")} <div style={divider} />
      </div>

      {!adding && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!cards.length && <div role="status" style={emptyCard}>{t("checkout.noSavedCards")}</div>}
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setSelected(card.id)}
              aria-pressed={selected === card.id}
              style={{ ...storedCardButton, border: selected === card.id ? `1.5px solid ${C.primary}` : `1px solid ${C.border}`, background: selected === card.id ? C.primarySoft : C.surface }}
            >
              <CreditCard size={18} color={C.primary} aria-hidden="true" />
              <div dir="ltr" style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{card.brand} •••• {card.last4}</div>
                <div style={{ overflow: "hidden", color: C.muted, fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name} · {card.exp}</div>
              </div>
              {selected === card.id && <Check size={16} color={C.primary} aria-hidden="true" />}
            </button>
          ))}
          <button type="button" onClick={() => { setAdding(true); setError(""); }} style={addCardButton}><Plus size={15} aria-hidden="true" /> {t("checkout.addCard")}</button>
        </div>
      )}

      {adding && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label><span style={fieldLabel}>{t("checkout.cardNumberLabel")}</span><input dir="ltr" autoComplete="off" aria-describedby="checkout-safety-notice" value={form.pan} onChange={(event) => updateFormField("pan", formatDemoPan(event.target.value))} placeholder={t("checkout.cardNumber")} style={inputStyle} inputMode="numeric" /></label>
          <label><span style={fieldLabel}>{t("checkout.cardNameLabel")}</span><input dir="ltr" autoComplete="off" value={form.name} onChange={(event) => updateFormField("name", event.target.value)} placeholder={t("checkout.cardName")} style={{ ...inputStyle, textAlign: "start" }} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><span style={fieldLabel}>{t("checkout.expiryLabel")}</span><input dir="ltr" autoComplete="off" value={form.exp} onChange={(event) => updateFormField("exp", event.target.value.replace(/[^\d/]/g, "").slice(0, 5))} placeholder={t("checkout.expiry")} style={inputStyle} inputMode="numeric" /></label>
            <label><span style={fieldLabel}>{t("checkout.cvvLabel")}</span><input dir="ltr" autoComplete="off" value={form.cvv} onChange={(event) => updateFormField("cvv", event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder={t("checkout.cvv")} style={inputStyle} inputMode="numeric" type="password" /></label>
          </div>
          {error && <div role="alert" aria-live="assertive" style={{ color: C.danger, fontSize: 12 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" onClick={() => { setAdding(false); setError(""); clearSensitiveForm(); }} style={{ ...actionButton, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.text }}>{t("common.cancel")}</button>
            <button type="button" onClick={addCard} style={{ ...actionButton, background: C.primary }}>{t("checkout.saveCard")}</button>
          </div>
        </div>
      )}

      {!adding && (
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            const card = cards.find((item) => item.id === selected);
            if (card) pay("card", `${card.brand} •••• ${card.last4}`);
          }}
          style={{ ...actionButton, display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, background: C.primary, opacity: selected ? 1 : 0.4 }}
        >
          <Lock size={14} aria-hidden="true" /> {t("checkout.pay", { amount: formatCurrency(order?.total || 0, order?.currency || "AED") })}
        </button>
      )}

      <div style={{ marginTop: 10, color: C.muted, fontSize: 10, textAlign: "center" }}>{t("checkout.demoDisclaimer")}</div>
    </div>
  );
}

const backButton = { display: "inline-flex", minHeight: 44, flexShrink: 0, alignItems: "center", gap: 3, border: "none", background: "none", color: C.primary, cursor: "pointer", padding: "4px 2px", fontSize: 11, fontWeight: 700 };
const summaryCard = { border: `1px solid ${C.border}`, borderRadius: 12, background: C.surfaceAlt, padding: "12px 14px", marginBottom: 12 };
const demoNotice = { border: `1px solid ${C.warning}`, borderRadius: 10, background: C.warningSoft, padding: "9px 11px", marginBottom: 12, color: C.text, fontSize: 10, lineHeight: 1.45 };
const unavailableCard = { border: `1px solid ${C.warning}`, borderRadius: 14, background: C.warningSoft, padding: 20, textAlign: "center" };
const spinner = { width: 26, height: 26, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.9s linear infinite" };
const walletButton = { display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 12, padding: 12, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 };
const divider = { flex: 1, height: 1, background: C.border };
const emptyCard = { border: `1px dashed ${C.border}`, borderRadius: 11, background: C.surfaceAlt, padding: 12, color: C.muted, fontSize: 11, textAlign: "center" };
const storedCardButton = { display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "start" };
const addCardButton = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px dashed ${C.primary}`, borderRadius: 12, background: C.surface, padding: 11, color: C.primary, cursor: "pointer", fontSize: 13 };
const inputStyle = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, padding: "11px 13px", color: C.text, fontSize: 13 };
const fieldLabel = { display: "block", margin: "0 2px 4px", color: C.muted, fontSize: 10, fontWeight: 700 };
const actionButton = { border: "none", borderRadius: 10, padding: 12, color: C.onPrimary, cursor: "pointer", fontSize: 14, fontWeight: 700 };
