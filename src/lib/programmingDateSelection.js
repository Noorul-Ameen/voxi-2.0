const normalizedDates = (dates) => [...new Set(
  (Array.isArray(dates) ? dates : [])
    .map((date) => String(date || "").trim())
    .filter(Boolean),
)];

/**
 * Resolve the date a client tool may use without overriding an explicit date
 * supplied by the guest. An unresolved guest date is intentionally stronger
 * than a different date proposed by the conversational agent.
 */
export function resolveProgrammingDateSelection({
  availableDates = [],
  userRequestedDate = null,
  toolRequestedDate = null,
  selectedDate = null,
  fallbackToFirst = true,
} = {}) {
  const dates = normalizedDates(availableDates);
  const userDate = String(userRequestedDate || "").trim() || null;
  const toolDate = String(toolRequestedDate || "").trim() || null;
  const currentDate = String(selectedDate || "").trim() || null;
  const explicitDate = userDate || toolDate;

  if (explicitDate && !dates.includes(explicitDate)) {
    return Object.freeze({
      date: null,
      unavailableDate: explicitDate,
      source: userDate ? "user" : "tool",
      blocked: true,
    });
  }

  if (explicitDate) {
    return Object.freeze({
      date: explicitDate,
      unavailableDate: null,
      source: userDate ? "user" : "tool",
      blocked: false,
    });
  }

  if (currentDate && dates.includes(currentDate)) {
    return Object.freeze({
      date: currentDate,
      unavailableDate: null,
      source: "selected",
      blocked: false,
    });
  }

  return Object.freeze({
    date: fallbackToFirst ? dates[0] || null : null,
    unavailableDate: null,
    source: fallbackToFirst && dates.length ? "fallback" : null,
    blocked: false,
  });
}

/**
 * A movie or session chosen from the list already on screen belongs to that
 * list's date. An agent-generated date must not silently switch the catalog
 * before the visible selection is resolved. A fresh explicit guest date still
 * has highest authority.
 */
export function resolveVisibleSelectionProgrammingDate({
  availableDates = [],
  userRequestedDate = null,
  toolRequestedDate = null,
  selectedDate = null,
  visibleDate = null,
  hasVisibleSelection = false,
} = {}) {
  const dates = normalizedDates(availableDates);
  const guestDate = String(userRequestedDate || "").trim() || null;
  const shownDate = String(visibleDate || "").trim() || null;
  if (!guestDate && hasVisibleSelection && shownDate && dates.includes(shownDate)) {
    return Object.freeze({ date: shownDate, unavailableDate: null, source: "visible", blocked: false });
  }
  return resolveProgrammingDateSelection({
    availableDates: dates,
    userRequestedDate: guestDate,
    toolRequestedDate,
    selectedDate,
  });
}
