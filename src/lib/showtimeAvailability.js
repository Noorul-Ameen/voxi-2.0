const pad2 = (value) => String(value).padStart(2, "0");

function addDays(isoDate, days) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function sessionStartEpoch(session, { programmingDayCutoffHour = 6 } = {}) {
  const time = String(session?.time || session?.Time || "").match(/^(\d{1,2}):(\d{2})$/);
  const programmingDate = String(session?.programmingDate || session?.date || session?.Date || "").slice(0, 10);
  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(programmingDate)) return null;
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || minute > 59) return null;
  const performanceDate = hour < programmingDayCutoffHour ? addDays(programmingDate, 1) : programmingDate;
  const epoch = Date.parse(`${performanceDate}T${pad2(hour)}:${pad2(minute)}:00+04:00`);
  return Number.isFinite(epoch) ? epoch : null;
}

export function filterBookableSessions(sessions, {
  now = new Date(),
  minimumLeadMinutes = 0,
  programmingDayCutoffHour = 6,
} = {}) {
  const threshold = now.getTime() + Math.max(0, Number(minimumLeadMinutes) || 0) * 60_000;
  const available = [];
  const expired = [];
  const unverifiable = [];
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const start = sessionStartEpoch(session, { programmingDayCutoffHour });
    if (start == null) {
      unverifiable.push(session);
      continue;
    }
    if (start > threshold) available.push(session);
    else expired.push(session);
  }
  return { available, expired, unverifiable, threshold };
}
