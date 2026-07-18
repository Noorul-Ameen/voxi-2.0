import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { C } from "../theme.js";

export default function BookingQRCode({ booking, size = 104 }) {
  const { t } = useI18n();
  const ref = String(booking?.ref || "").trim();
  if (!ref || booking?.cancelled) return null;
  const isReferenceOnly = booking?.verified !== true
    || booking?.demo === true
    || booking?.paymentStatus === "simulated_not_charged"
    || booking?.bookingStatus === "confirmed_demo";
  const providerQrValue = [
    booking?.qrPayload,
    booking?.qrCode,
    booking?.QRCode,
    booking?.QrCode,
    booking?.ticketQrCode,
    booking?.TicketQrCode,
    booking?.admissionToken,
    booking?.AdmissionToken,
    booking?.barcode,
    booking?.Barcode,
  ].map((value) => String(value || "").trim()).find(Boolean) || null;
  const qrValue = isReferenceOnly ? ref : providerQrValue;
  if (!qrValue) {
    return (
      <div role="note" style={{ borderTop: `1px dashed ${C.border}`, padding: "14px 20px", color: C.muted, fontSize: 10, lineHeight: 1.45, textAlign: "center" }}>
        {t("booking.qrReferenceOnly")}
      </div>
    );
  }
  const hint = t(isReferenceOnly ? "booking.qrDemoHint" : "booking.qrHint");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, borderTop: `1px dashed ${C.border}`, padding: "15px 20px" }}>
      <div data-qr-value={qrValue} aria-label={`${hint}: ${ref}`} style={{ display: "grid", placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, padding: 9 }}>
        <QRCodeSVG value={qrValue} size={size} level="M" marginSize={0} title={isReferenceOnly ? `${t("booking.ref")} ${ref}` : hint} />
      </div>
      <div style={{ maxWidth: 260, fontSize: 10, lineHeight: 1.4, color: isReferenceOnly ? C.warning : C.muted, textAlign: "center" }}>{hint}</div>
    </div>
  );
}
