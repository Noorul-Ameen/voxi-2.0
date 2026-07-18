const FORBIDDEN_DASHES = new RegExp(
  `[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`,
  "gu",
);

export function normalizeCustomerFacingText(value) {
  const normalized = String(value ?? "").replace(FORBIDDEN_DASHES, "-");
  const searchLimit = Math.min(180, Math.floor(normalized.length / 2));
  for (let prefixLength = 20; prefixLength <= searchLimit; prefixLength += 1) {
    const prefix = normalized.slice(0, prefixLength);
    if (!/[.!?؟]/u.test(prefix)) continue;
    if (normalized.startsWith(prefix, prefixLength)) return normalized.slice(prefixLength).trimStart();
  }
  return normalized;
}

export function normalizeCustomerFacingFields(value, fields = []) {
  if (!value || typeof value !== "object") return value;
  const normalized = { ...value };
  for (const field of fields) {
    if (typeof normalized[field] === "string") {
      normalized[field] = normalizeCustomerFacingText(normalized[field]);
    }
  }
  return normalized;
}

export function hasForbiddenCustomerFacingDash(value) {
  FORBIDDEN_DASHES.lastIndex = 0;
  return FORBIDDEN_DASHES.test(String(value ?? ""));
}
