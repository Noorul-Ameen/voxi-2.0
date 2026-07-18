export const DEMO_CARD_STORAGE_KEY = "vox_demo_payment_methods_v2";
export const DEVICE_SESSION_EPOCH_KEY = "voxi_device_session_epoch_v1";

export function digitsOnly(value = "") {
  return String(value).replace(/\D/g, "");
}

export function isLuhnValid(value = "") {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function detectCardBrand(value = "") {
  const digits = digitsOnly(value);
  if (digits.startsWith("4")) return "VISA";
  if (/^5[1-5]/.test(digits)) return "MC";
  if (/^3[47]/.test(digits)) return "AMEX";
  return "CARD";
}

export function formatDemoPan(value = "") {
  return digitsOnly(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function isValidDemoExpiry(value = "", now = new Date()) {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(value));
  if (!match) return false;

  const referenceDate = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const expiryMonth = Number(match[1]);
  const expiryYear = 2000 + Number(match[2]);
  const currentMonth = referenceDate.getMonth() + 1;
  const currentYear = referenceDate.getFullYear();

  return expiryYear > currentYear || (expiryYear === currentYear && expiryMonth >= currentMonth);
}

export function toStoredCardMetadata({ pan = "", name = "", exp = "" } = {}, id = `demo-${Date.now()}`) {
  const digits = digitsOnly(pan);
  return {
    id: String(id),
    brand: detectCardBrand(digits),
    last4: digits.slice(-4),
    name: String(name).trim().slice(0, 80),
    exp: String(exp).slice(0, 5),
  };
}

export function sanitizeStoredCardMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const last4 = digitsOnly(value.last4).slice(-4);
  const exp = String(value.exp || "").slice(0, 5);
  if (last4.length !== 4 || !isValidDemoExpiry(exp)) return null;
  return {
    id: String(value.id || `demo-${Date.now()}`),
    brand: ["VISA", "MC", "AMEX", "CARD"].includes(value.brand) ? value.brand : "CARD",
    last4,
    name: String(value.name || "").trim().slice(0, 80),
    exp,
  };
}
