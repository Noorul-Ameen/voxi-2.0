export function uaeCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(value, days) {
  if (!isIsoCalendarDate(value) || !Number.isFinite(Number(days))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

// Snapshot dates are authoritative. Never cycle an expired or invalid request
// back into the published window, because that silently serves the wrong day.
export function remapDemoDate(displayDate, _today, sourceDates) {
  const dates = Array.isArray(sourceDates) ? sourceDates : [];
  return isIsoCalendarDate(displayDate) && dates.includes(displayDate) ? displayDate : null;
}
