// ============================================================================
// VISTA CLIENT
// - Without VITE_VISTA_BASE: a dated, read-only VOX schedule snapshot plus
//   explicitly unverified demo inventory/payment helpers.
// - With VITE_VISTA_BASE: date-scoped Vista reads; write/price adapters remain
//   unavailable or simulated unless their explicit proxy paths are configured.
// Existing list-returning signatures stay compatible with App.jsx. Additional
// result metadata is attached non-enumerably and can be read with getResultMeta.
// ============================================================================
import {
  CINEMAS,
  DATA_DATES,
  DATA_STATS,
  DATES_BY_CINEMA,
  FILMS,
  FILM_IDS_BY_CINEMA_DATE,
  SNAPSHOT_BASE_PATH,
  SNAPSHOT_VERSION,
} from "./generated/voxSnapshotManifest.js";
import { BOOKING, seatPlan } from "./mockTransactionData.js";
import { findBooking } from "./bookingStore.js";
import { addCalendarDays, isIsoCalendarDate, remapDemoDate, uaeCalendarDate } from "./lib/demoDates.js";
import { assessCancellationEligibility } from "./lib/cancellationEligibility.js";
import { normalizeCustomerFacingText } from "./lib/customerFacingText.js";

const ENV = import.meta.env || {};
const BASE = String(ENV.VITE_VISTA_BASE || "").replace(/\/+$/, "");
const API_ONLY = String(ENV.VITE_API_ONLY || "").toLowerCase() === "true";
if (API_ONLY && !BASE) throw new Error("VITE_VISTA_BASE is required in API-only mode.");
const USE_MOCK = !API_ONLY && !BASE;
const V2 = `${BASE}/vistatickets/vista/v2`;
const REQUEST_TIMEOUT_MS = 15_000;
const PROGRAMMING_DAY_START_HOUR = 6;
const LIVE_SESSION_CACHE_MS = 15_000;
const DEFAULT_LIVE_PROGRAMMING_DAYS = 9;
const configuredLiveProgrammingDays = Number.parseInt(ENV.VITE_VISTA_PROGRAMMING_DAYS, 10);
const LIVE_PROGRAMMING_DAYS = Number.isInteger(configuredLiveProgrammingDays)
  ? Math.min(31, Math.max(1, configuredLiveProgrammingDays))
  : DEFAULT_LIVE_PROGRAMMING_DAYS;
const liveSessionCache = new Map();
const snapshotShardCache = new Map();
const snapshotSessionIndex = new Map();
const snapshotFilmsById = new Map(FILMS.map((film) => [String(film.ScheduledFilmId || ""), film]));

const HEADERS = Object.freeze({
  Accept: "application/json",
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class VistaClientError extends Error {
  constructor(message, {
    code = "VISTA_ERROR",
    status = null,
    operation = "unknown",
    retryable = false,
    details = null,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "VistaClientError";
    this.code = code;
    this.status = status;
    this.operation = operation;
    this.retryable = retryable;
    this.details = details;
  }
}

function requireText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new VistaClientError(`${field} is required.`, { code: "INVALID_ARGUMENT", operation: field });
  return text;
}

export function parseVistaResultCode(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

export function parseVistaRefundReference(value) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function requireDate(value, operation) {
  if (!isIsoCalendarDate(value)) {
    throw new VistaClientError("A valid programming date is required.", {
      code: "INVALID_PROGRAMMING_DATE",
      operation,
      details: { displayDate: value || null },
    });
  }
  return value;
}

function odataString(value) {
  return String(value).replace(/'/g, "''");
}

function buildODataUrl(resource, filter) {
  const params = new URLSearchParams({ $format: "json" });
  if (String(filter || "").trim()) params.set("$filter", filter);
  return `${V2}/OData/${resource}?${params.toString()}`;
}

export function buildProgrammingDateFilter(cinemaId, displayDate) {
  const id = requireText(cinemaId, "cinemaId");
  const date = requireDate(displayDate, "buildProgrammingDateFilter");
  const nextDate = addCalendarDays(date, 1);
  // Vista's development OData service implements the v3 datetime literal
  // syntax. Bare ISO timestamps are rejected with HTTP 500 even though they
  // are valid in newer OData versions.
  const start = `${date}T${String(PROGRAMMING_DAY_START_HOUR).padStart(2, "0")}:00:00`;
  const end = `${nextDate}T${String(PROGRAMMING_DAY_START_HOUR).padStart(2, "0")}:00:00`;
  return `CinemaId eq '${odataString(id)}' and Showtime ge datetime'${start}' and Showtime lt datetime'${end}'`;
}

async function requestJson(url, {
  operation,
  method = "GET",
  body,
  headers = {},
  cache,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body === undefined ? HEADERS : { ...HEADERS, "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache,
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    const timeout = cause?.name === "AbortError";
    throw new VistaClientError(timeout ? "The cinema service timed out." : "The cinema service could not be reached.", {
      code: timeout ? "VISTA_TIMEOUT" : "VISTA_NETWORK_ERROR",
      operation,
      retryable: true,
      cause,
    });
  }

  try {
    let text;
    try {
      text = await response.text();
    } catch (cause) {
      const timeout = controller.signal.aborted || cause?.name === "AbortError";
      throw new VistaClientError(timeout ? "The cinema service timed out." : "The cinema service response could not be read.", {
        code: timeout ? "VISTA_TIMEOUT" : "VISTA_RESPONSE_READ_ERROR",
        status: response.status,
        operation,
        retryable: true,
        cause,
      });
    }

    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch (cause) {
        throw new VistaClientError("The cinema service returned an invalid response.", {
          code: "VISTA_INVALID_JSON",
          status: response.status,
          operation,
          retryable: response.status >= 500,
          cause,
        });
      }
    }
    if (!response.ok) {
      throw new VistaClientError(`The cinema service rejected ${operation || "the request"}.`, {
        code: "VISTA_HTTP_ERROR",
        status: response.status,
        operation,
        retryable: response.status === 429 || response.status >= 500,
        details: payload?.ErrorDescription || payload?.message || null,
      });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function payloadArray(payload, operation) {
  const value = Array.isArray(payload) ? payload : payload?.value ?? payload?.Value;
  if (!Array.isArray(value)) {
    throw new VistaClientError("The cinema service returned an unexpected list response.", {
      code: "VISTA_INVALID_PAYLOAD",
      operation,
    });
  }
  return value;
}

function withMeta(value, meta) {
  Object.defineProperty(value, "meta", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ ...meta }),
  });
  return value;
}

export function getResultMeta(value) {
  return value?.meta || null;
}

function rawField(value, ...names) {
  for (const name of names) if (value?.[name] !== undefined && value?.[name] !== null) return value[name];
  return undefined;
}

function sessionShowtime(value) {
  return String(rawField(value, "Showtime", "showtime") || "");
}

export function programmingDateForSession(value) {
  const explicit = String(rawField(value, "SourceProgrammingDate", "ProgrammingDate", "BusinessDate", "businessDate") || "").slice(0, 10);
  if (isIsoCalendarDate(explicit)) return explicit;
  const showtime = sessionShowtime(value);
  const calendarDate = showtime.slice(0, 10);
  const hour = Number(showtime.slice(11, 13));
  if (!isIsoCalendarDate(calendarDate) || !Number.isFinite(hour)) return null;
  return hour < PROGRAMMING_DAY_START_HOUR ? addCalendarDays(calendarDate, -1) : calendarDate;
}

const EMPTY_SNAPSHOT_ROWS = Object.freeze([]);

// Snapshot discovery used to rescan every session once per displayed movie.
// Build one immutable lookup instead, while retaining the source ordering that
// controls film and showtime presentation.
export function createSnapshotDiscoveryIndex(sessions, films, publishedDates) {
  const sessionsByCinema = new Map();
  const filmsByCinema = new Map();
  let sessionRecordCount = 0;
  let indexedSessionCount = 0;
  let filmRecordCount = 0;
  let dateBucketCount = 0;
  let filmBucketCount = 0;

  for (const session of sessions || []) {
    sessionRecordCount += 1;
    const cinemaId = rawField(session, "CinemaId", "cinemaId");
    const sourceDate = programmingDateForSession(session);
    if (!cinemaId || !sourceDate) continue;

    let cinema = sessionsByCinema.get(cinemaId);
    if (!cinema) {
      cinema = new Map();
      sessionsByCinema.set(cinemaId, cinema);
    }
    let dateBucket = cinema.get(sourceDate);
    if (!dateBucket) {
      dateBucket = { all: [], byFilm: new Map() };
      cinema.set(sourceDate, dateBucket);
      dateBucketCount += 1;
    }
    dateBucket.all.push(session);
    indexedSessionCount += 1;

    const filmId = String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || "");
    if (!filmId) continue;
    let filmSessions = dateBucket.byFilm.get(filmId);
    if (!filmSessions) {
      filmSessions = [];
      dateBucket.byFilm.set(filmId, filmSessions);
      filmBucketCount += 1;
    }
    filmSessions.push(session);
  }

  for (const film of films || []) {
    filmRecordCount += 1;
    const cinemaId = rawField(film, "CinemaId", "cinemaId");
    if (!cinemaId) continue;
    const cinemaFilms = filmsByCinema.get(cinemaId) || [];
    cinemaFilms.push(film);
    filmsByCinema.set(cinemaId, cinemaFilms);
  }

  for (const cinema of sessionsByCinema.values()) {
    for (const bucket of cinema.values()) {
      Object.freeze(bucket.all);
      for (const filmSessions of bucket.byFilm.values()) Object.freeze(filmSessions);
      Object.freeze(bucket);
    }
  }
  for (const cinemaFilms of filmsByCinema.values()) Object.freeze(cinemaFilms);

  const orderedPublishedDates = Object.freeze([...(publishedDates || [])]);
  const datesByCinema = new Map([...sessionsByCinema].map(([cinemaId, dates]) => [
    cinemaId,
    Object.freeze(orderedPublishedDates.filter((date) => dates.has(date))),
  ]));
  const stats = Object.freeze({
    sessionRecordCount,
    indexedSessionCount,
    filmRecordCount,
    cinemaCount: sessionsByCinema.size,
    dateBucketCount,
    filmBucketCount,
    sessionConstructionPasses: 1,
    filmConstructionPasses: 1,
  });

  return Object.freeze({
    datesForCinema(cinemaId) {
      return datesByCinema.get(cinemaId) || EMPTY_SNAPSHOT_ROWS;
    },
    filmsForCinema(cinemaId) {
      return filmsByCinema.get(cinemaId) || EMPTY_SNAPSHOT_ROWS;
    },
    sessionsForCinemaDate(cinemaId, sourceDate) {
      return sessionsByCinema.get(cinemaId)?.get(sourceDate)?.all || EMPTY_SNAPSHOT_ROWS;
    },
    sessionsForCinemaDateFilm(cinemaId, sourceDate, scheduledFilmId) {
      return sessionsByCinema.get(cinemaId)?.get(sourceDate)?.byFilm.get(String(scheduledFilmId || "")) || EMPTY_SNAPSHOT_ROWS;
    },
    stats,
  });
}

function snapshotDatesForCinema(cinemaId) {
  const id = String(cinemaId || "").trim();
  if (!id) return [...DATA_DATES];
  return [...(DATES_BY_CINEMA[id] || EMPTY_SNAPSHOT_ROWS)];
}

function activeDates(dates, now = new Date(), includePast = false) {
  if (includePast) return [...dates];
  const today = uaeCalendarDate(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
  const earliestProgrammingDate = hour < PROGRAMMING_DAY_START_HOUR ? addCalendarDays(today, -1) : today;
  return dates.filter((date) => date >= earliestProgrammingDate);
}

// Live dates are an availability-query window, not claims copied from the
// dated snapshot. Any upstream credential must be injected by the same-origin
// proxy configured as VITE_VISTA_BASE; it must never be shipped in Vite env.
export function getLiveProgrammingDates({ now = new Date(), days = LIVE_PROGRAMMING_DAYS } = {}) {
  const requestedDays = Number.parseInt(days, 10);
  const windowDays = Number.isInteger(requestedDays)
    ? Math.min(31, Math.max(1, requestedDays))
    : DEFAULT_LIVE_PROGRAMMING_DAYS;
  const today = uaeCalendarDate(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hourCycle: "h23" }).format(now));
  const firstDate = hour < PROGRAMMING_DAY_START_HOUR ? addCalendarDays(today, -1) : today;
  return Array.from({ length: windowDays }, (_, offset) => addCalendarDays(firstDate, offset));
}

export function demoDate(now = new Date()) {
  return getProgrammingDates({ now })[0] || uaeCalendarDate(now);
}

export function getProgrammingDates(options = {}) {
  const normalized = typeof options === "string" ? { cinemaId: options } : options || {};
  const dates = USE_MOCK
    ? snapshotDatesForCinema(normalized.cinemaId)
    : getLiveProgrammingDates({ now: normalized.now });
  return activeDates(dates, normalized.now, Boolean(normalized.includePast));
}

export function sourceDateForDemoDate(displayDate = demoDate()) {
  return remapDemoDate(displayDate, demoDate(), DATA_DATES);
}

export function getScheduleStatus({ cinemaId = "", displayDate = "", now = new Date() } = {}) {
  const allDates = USE_MOCK
    ? snapshotDatesForCinema(cinemaId)
    : getLiveProgrammingDates({ now });
  const dates = activeDates(allDates, now, false);
  const today = uaeCalendarDate(now);
  const expired = USE_MOCK && Boolean(allDates.length && allDates.at(-1) < today);
  const requestedAvailable = displayDate ? allDates.includes(displayDate) : null;
  let reason = null;
  if (!allDates.length) reason = cinemaId ? "no_programming_for_cinema" : "no_programming";
  else if (expired) reason = "snapshot_expired";
  else if (displayDate && !requestedAvailable) reason = "date_not_published";
  return Object.freeze({
    mode: USE_MOCK ? "snapshot" : "live",
    cinemaId: cinemaId || null,
    today,
    extractedAt: USE_MOCK ? DATA_STATS.extractedAt || null : null,
    firstPublishedDate: allDates[0] || null,
    lastPublishedDate: allDates.at(-1) || null,
    availableDates: dates,
    requestedDate: displayDate || null,
    requestedDateAvailable: requestedAvailable,
    expired,
    empty: !dates.length,
    reason,
  });
}

export function getVistaCapabilities({ now = new Date() } = {}) {
  const schedule = getScheduleStatus({ now });
  const pricingConfigured = !USE_MOCK && Boolean(String(ENV.VITE_VISTA_PRICING_PATH || "").trim());
  const refundConfigured = !USE_MOCK && Boolean(String(ENV.VITE_VISTA_REFUND_PATH || "").trim());
  return Object.freeze({
    mode: USE_MOCK ? "snapshot" : "live",
    demo: USE_MOCK,
    schedule,
    sessions: Object.freeze({ verified: !USE_MOCK, dateScoped: true }),
    seats: Object.freeze({ verified: !USE_MOCK, mode: USE_MOCK ? "generated_demo" : "live" }),
    pricing: Object.freeze({
      verified: pricingConfigured,
      mode: pricingConfigured ? "live" : "static_demo",
    }),
    reservation: Object.freeze({
      verified: !USE_MOCK && Boolean(ENV.VITE_VISTA_RESERVATION_PATH),
      mode: USE_MOCK ? "not_applied_demo" : ENV.VITE_VISTA_RESERVATION_PATH ? "live" : "unconfigured",
    }),
    refund: Object.freeze({
      verified: refundConfigured,
      mode: USE_MOCK ? "not_applied_demo" : refundConfigured ? "live" : "unconfigured",
    }),
  });
}

export function getCinemas({ now = new Date() } = {}) {
  if (API_ONLY) return [];
  return CINEMAS.map((cinema) => ({
    id: cinema.ID,
    name: normalizeCustomerFacingText(cinema.Name),
    currency: cinema.CurrencyCode || "AED",
    availableDates: USE_MOCK
      ? snapshotDatesForCinema(cinema.ID)
      : getLiveProgrammingDates({ now }),
  }));
}

export async function loadCinemas({ now = new Date() } = {}) {
  if (USE_MOCK) return getCinemas({ now });
  const payload = await requestJson(buildODataUrl("Cinemas"), { operation: "getCinemas" });
  return payloadArray(payload, "getCinemas").map((cinema) => ({
    id: String(rawField(cinema, "ID", "Id", "id", "CinemaId", "cinemaId") || ""),
    name: normalizeCustomerFacingText(rawField(cinema, "Name", "name")),
    currency: rawField(cinema, "CurrencyCode", "currencyCode") || "AED",
    availableDates: getLiveProgrammingDates({ now }),
  })).filter((cinema) => cinema.id && cinema.name);
}

// Snapshot mode can safely expose its normalized title catalog for local
// intent parsing. Live mode deliberately returns no stale fallback titles;
// availability is then learned from the selected cinema/date endpoints.
export function getDiscoveryMovieCatalog() {
  return USE_MOCK ? uniqueFilms(FILMS).map(normalizeFilm) : [];
}

function normalizeFilm(film) {
  const rawGenres = rawField(film, "Genres", "genres");
  const rawSubtitles = rawField(film, "Subtitles", "subtitles");
  return {
    id: rawField(film, "ScheduledFilmId", "scheduledFilmId", "id"),
    title: normalizeCustomerFacingText(rawField(film, "Title", "title")),
    rating: normalizeCustomerFacingText(rawField(film, "Rating", "rating")),
    runtime: Number(rawField(film, "RunTime", "runtime")) || 0,
    genre: normalizeCustomerFacingText(rawField(film, "genre", "Genre")),
    language: normalizeCustomerFacingText(rawField(film, "Language", "language")),
    languageName: normalizeCustomerFacingText(rawField(film, "LanguageName", "languageName")),
    synopsis: normalizeCustomerFacingText(rawField(film, "Synopsis", "synopsis")),
    genres: Array.isArray(rawGenres) && rawGenres.length
      ? rawGenres.map(normalizeCustomerFacingText)
      : [normalizeCustomerFacingText(rawField(film, "genre", "Genre") || "Film")],
    subtitles: Array.isArray(rawSubtitles) ? rawSubtitles.map(normalizeCustomerFacingText) : [],
    posterUrl: rawField(film, "posterUrl", "PosterUrl") || null,
    posterStatus: rawField(film, "PosterStatus", "posterStatus") || (rawField(film, "posterUrl", "PosterUrl") ? "official" : "missing_at_source"),
    tint: rawField(film, "tint", "Tint") || ["#63418D", "#B6186C"],
    dataMode: USE_MOCK ? "snapshot" : "live",
  };
}

function uniqueFilms(films) {
  const seen = new Set();
  return films.filter((film) => {
    const key = String(rawField(film, "ScheduledFilmId", "scheduledFilmId", "id") || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function experiencesByScheduledFilm(sessions) {
  const index = new Map();
  for (const session of sessions || []) {
    const filmId = String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || "");
    if (!filmId) continue;
    const attributes = rawField(session, "SessionAttributesNames", "sessionAttributesNames");
    const labels = [
      ...(Array.isArray(attributes) ? attributes : [attributes]),
      rawField(session, "Experience", "experience"),
      rawField(session, "ExperienceCode", "experienceCode"),
      rawField(session, "ScreenName", "screenName"),
    ].map((value) => normalizeCustomerFacingText(value).trim()).filter(Boolean);
    const values = index.get(filmId) || new Set();
    labels.forEach((label) => values.add(label));
    index.set(filmId, values);
  }
  return new Map([...index].map(([filmId, values]) => [filmId, [...values].sort()]));
}

function snapshotShardKey(cinemaId, sourceDate) {
  return `${cinemaId}:${sourceDate}`;
}

export function buildSnapshotShardUrl(cinemaId, sourceDate) {
  const id = requireText(cinemaId, "cinemaId");
  const date = requireDate(sourceDate, "buildSnapshotShardUrl");
  return `${SNAPSHOT_BASE_PATH}/${encodeURIComponent(id)}/${date}.json`;
}

function rememberSnapshotSessions(cinemaId, sessions) {
  for (const session of sessions) {
    const sessionId = String(rawField(session, "SessionId", "sessionId") || "");
    if (sessionId) snapshotSessionIndex.set(`${cinemaId}:${sessionId}`, session);
  }
}

async function fetchSnapshotSessions(cinemaId, sourceDate) {
  const key = snapshotShardKey(cinemaId, sourceDate);
  const cached = snapshotShardCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const operation = "getSnapshotSessions";
    const payload = await requestJson(buildSnapshotShardUrl(cinemaId, sourceDate), {
      operation,
      cache: "force-cache",
    });
    const sessions = payload?.sessions;
    const validEnvelope = payload?.version === SNAPSHOT_VERSION
      && String(payload?.cinemaId || "") === cinemaId
      && payload?.programmingDate === sourceDate
      && Array.isArray(sessions);
    if (!validEnvelope) {
      throw new VistaClientError("The cinema schedule could not be verified.", {
        code: "SNAPSHOT_INVALID_PAYLOAD",
        operation,
        details: { cinemaId, sourceDate },
      });
    }
    const verifiedSessions = sessions.filter((session) => (
      String(rawField(session, "CinemaId", "cinemaId") || "") === cinemaId
      && programmingDateForSession(session) === sourceDate
    ));
    if (verifiedSessions.length !== sessions.length) {
      throw new VistaClientError("The cinema schedule contained inconsistent session data.", {
        code: "SNAPSHOT_INVALID_SESSION",
        operation,
        details: { cinemaId, sourceDate },
      });
    }
    rememberSnapshotSessions(cinemaId, verifiedSessions);
    return Object.freeze(verifiedSessions);
  })();

  snapshotShardCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    if (snapshotShardCache.get(key) === pending) snapshotShardCache.delete(key);
    throw error;
  }
}

async function fetchLiveSessions(cinemaId, displayDate) {
  const key = `${cinemaId}:${displayDate}`;
  const cached = liveSessionCache.get(key);
  if (cached && Date.now() - cached.at < LIVE_SESSION_CACHE_MS) return cached.value;
  const operation = "getSessions";
  const url = buildODataUrl("Sessions", buildProgrammingDateFilter(cinemaId, displayDate));
  const raw = payloadArray(await requestJson(url, { operation }), operation)
    .filter((session) => String(rawField(session, "CinemaId", "cinemaId") || "") === cinemaId)
    .filter((session) => programmingDateForSession(session) === displayDate);
  liveSessionCache.set(key, { at: Date.now(), value: raw });
  return raw;
}

export async function getScheduledFilms(cinemaId, displayDate = demoDate()) {
  const id = requireText(cinemaId, "cinemaId");
  const requestedDate = requireDate(displayDate, "getScheduledFilms");
  let value = [];
  let scheduledSessions = [];
  if (USE_MOCK) {
    const sourceDate = sourceDateForDemoDate(requestedDate);
    if (sourceDate && snapshotDatesForCinema(id).includes(sourceDate)) {
      scheduledSessions = await fetchSnapshotSessions(id, sourceDate);
      const shardFilmIds = [...new Set(scheduledSessions
        .map((session) => String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || ""))
        .filter(Boolean))];
      const publishedFilmIds = FILM_IDS_BY_CINEMA_DATE[id]?.[sourceDate] || shardFilmIds;
      value = publishedFilmIds.map((filmId) => snapshotFilmsById.get(String(filmId))).filter(Boolean);
    }
  } else {
    const filter = `CinemaId eq '${odataString(id)}'`;
    const [sessions, filmPayload] = await Promise.all([
      fetchLiveSessions(id, requestedDate),
      requestJson(buildODataUrl("ScheduledFilms", filter), { operation: "getScheduledFilms" }),
    ]);
    scheduledSessions = sessions;
    const ids = new Set(sessions.map((session) => String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || "")));
    value = payloadArray(filmPayload, "getScheduledFilms")
      .filter((film) => ids.has(String(rawField(film, "ScheduledFilmId", "scheduledFilmId", "id") || "")));
  }
  const experienceIndex = experiencesByScheduledFilm(scheduledSessions);
  const result = uniqueFilms(value).map((film) => {
    const normalized = normalizeFilm(film);
    return { ...normalized, experiences: experienceIndex.get(String(normalized.id)) || [] };
  });
  const status = getScheduleStatus({ cinemaId: id, displayDate: requestedDate });
  return withMeta(result, {
    mode: USE_MOCK ? "snapshot" : "live",
    verified: !USE_MOCK,
    cinemaId: id,
    displayDate: requestedDate,
    empty: result.length === 0,
    reason: result.length ? null : status.reason || "no_films_for_date",
    availableDates: status.availableDates,
  });
}

function normalizeSession(session, displayDate) {
  const showtime = sessionShowtime(session);
  const attributes = rawField(session, "SessionAttributesNames", "sessionAttributesNames");
  const sessionId = String(rawField(session, "SessionId", "sessionId") || "");
  return {
    sessionId,
    cinemaId: String(rawField(session, "CinemaId", "cinemaId") || ""),
    scheduledFilmId: String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || ""),
    movieId: String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || ""),
    sessionIds: [sessionId],
    alternateSessionIds: [],
    time: showtime.slice(11, 16),
    screen: normalizeCustomerFacingText(rawField(session, "ScreenName", "screenName")),
    exp: normalizeCustomerFacingText((Array.isArray(attributes) && attributes[0]) || rawField(session, "Experience", "experience") || "2D"),
    seatsAvailable: Number(rawField(session, "SeatsAvailable", "seatsAvailable")) || 0,
    date: displayDate,
    sourceDate: showtime.slice(0, 10),
    programmingDate: programmingDateForSession(session),
    showtimeAt: showtime || null,
    timeSlot: normalizeCustomerFacingText(rawField(session, "TimeSlot", "timeSlot")),
    status: normalizeCustomerFacingText(rawField(session, "Status", "status")),
    isAvailableForOffer: rawField(session, "IsAvailableForOffer", "isAvailableForOffer") !== false,
    availabilityVerified: !USE_MOCK,
    dataMode: USE_MOCK ? "snapshot" : "live",
    duplicateCount: 0,
    scheduledFilmId: String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || ""),
  };
}

function presentationKey(session) {
  return [
    session.scheduledFilmId,
    session.programmingDate,
    session.time,
    session.exp,
    session.screen,
    session.seatsAvailable,
    session.status,
    session.isAvailableForOffer,
  ].join("|");
}

export function deduplicateSessionPresentation(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = presentationKey(session);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...session, sessionIds: [...session.sessionIds], alternateSessionIds: [] });
      continue;
    }
    if (!existing.sessionIds.includes(session.sessionId)) existing.sessionIds.push(session.sessionId);
    existing.alternateSessionIds = existing.sessionIds.slice(1);
    existing.duplicateCount = existing.sessionIds.length - 1;
  }
  return [...groups.values()];
}

export async function getSessions(cinemaId, scheduledFilmId, displayDate = demoDate()) {
  const id = requireText(cinemaId, "cinemaId");
  const requestedDate = requireDate(displayDate, "getSessions");
  const requestedFilm = String(scheduledFilmId || "");
  let value = [];
  if (USE_MOCK) {
    const sourceDate = sourceDateForDemoDate(requestedDate);
    if (sourceDate && snapshotDatesForCinema(id).includes(sourceDate)) {
      value = await fetchSnapshotSessions(id, sourceDate);
    }
  } else {
    value = await fetchLiveSessions(id, requestedDate);
  }
  const mapped = value
    .filter((session) => !requestedFilm || String(rawField(session, "ScheduledFilmId", "scheduledFilmId") || "") === requestedFilm)
    .map((session) => normalizeSession(session, requestedDate))
    .sort((left, right) => left.time.localeCompare(right.time) || left.sessionId.localeCompare(right.sessionId));
  const result = deduplicateSessionPresentation(mapped);
  const status = getScheduleStatus({ cinemaId: id, displayDate: requestedDate });
  return withMeta(result, {
    mode: USE_MOCK ? "snapshot" : "live",
    verified: !USE_MOCK,
    cinemaId: id,
    scheduledFilmId: requestedFilm || null,
    displayDate: requestedDate,
    rawCount: mapped.length,
    displayCount: result.length,
    deduplicatedCount: mapped.length - result.length,
    empty: result.length === 0,
    reason: result.length ? null : status.reason || "no_sessions_for_date",
  });
}

export async function getSeatPlan(cinemaId, sessionId) {
  const id = requireText(cinemaId, "cinemaId");
  const requestedSessionId = requireText(sessionId, "sessionId");
  let data;
  let listedSeatsAvailable = null;
  if (USE_MOCK) {
    await delay(250);
    const source = snapshotSessionIndex.get(`${id}:${requestedSessionId}`);
    listedSeatsAvailable = source?.SeatsAvailable ?? null;
    data = seatPlan(Number(requestedSessionId) % 97);
  } else {
    data = await requestJson(`${V2}/Data/Cinemas/${encodeURIComponent(id)}/sessions/${encodeURIComponent(requestedSessionId)}/seat-plan`, { operation: "getSeatPlan" });
  }
  if (Number(data?.ResponseCode) && Number(data.ResponseCode) !== 0) {
    throw new VistaClientError(data.ErrorDescription || "The seat plan request was rejected.", {
      code: "SEAT_PLAN_REJECTED",
      operation: "getSeatPlan",
      details: data.ResponseCode,
    });
  }
  const areas = data?.SeatLayoutData?.Areas;
  if (!Array.isArray(areas) || !areas.length || !Array.isArray(areas[0]?.Rows)) {
    throw new VistaClientError("The seat plan is unavailable for this session.", {
      code: "SEAT_PLAN_UNAVAILABLE",
      operation: "getSeatPlan",
    });
  }
  const area = areas[0];
  const result = area.Rows.map((row) => ({
    row: row.PhysicalName,
    seats: (Array.isArray(row.Seats) ? row.Seats : []).map((seat) => ({
      id: `${row.PhysicalName}${Number(seat.Id)}`,
      rowIndex: seat.Position?.RowIndex,
      colIndex: seat.Position?.ColumnIndex,
      status: seat.Status,
      premium: (seat.areaCategoryCode || area.AreaCategoryCode) === "0000000001",
    })),
  }));
  const generatedAvailable = result.flatMap((row) => row.seats).filter((seat) => seat.status === 0).length;
  return withMeta(result, {
    mode: USE_MOCK ? "generated_demo" : "live",
    verified: !USE_MOCK,
    cinemaId: id,
    sessionId: requestedSessionId,
    listedSeatsAvailable,
    displayedSeatsAvailable: generatedAvailable,
    inventoryMismatch: USE_MOCK && Number.isFinite(listedSeatsAvailable) ? listedSeatsAvailable !== generatedAvailable : false,
    areaCount: areas.length,
    warning: USE_MOCK ? "Demo seats are generated and are not reserved in VOX inventory." : null,
  });
}

function configuredUrl(template, values, operation) {
  const value = String(template || "").trim();
  if (!value) throw new VistaClientError(`${operation} is not configured.`, { code: "CAPABILITY_UNAVAILABLE", operation });
  const path = Object.entries(values).reduce((result, [key, replacement]) => (
    result.replaceAll(`{${key}}`, encodeURIComponent(String(replacement)))
  ), value);
  // Root-relative adapters are same-origin application routes, not Vista API
  // paths. Prefixing them with BASE would incorrectly produce URLs such as
  // /api/vox/api/booking/quote.
  if (path.startsWith("/")) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE}/${path.replace(/^\/+/, "")}`;
}

export const DEMO_PRICING = Object.freeze({ standard: 42, premium: 63, currency: "AED" });

export function buildSeatPricingPreview({ mode = "snapshot", pricingConfigured = false } = {}) {
  if (mode === "live" && pricingConfigured) {
    return Object.freeze({
      mode: "quote_required",
      demo: false,
      verified: false,
      currency: null,
      tiers: Object.freeze({ standard: null, premium: null }),
    });
  }
  return Object.freeze({
    mode: "static_demo",
    demo: true,
    verified: false,
    currency: DEMO_PRICING.currency,
    tiers: Object.freeze({ standard: DEMO_PRICING.standard, premium: DEMO_PRICING.premium }),
  });
}

export function getSeatPricingPreview() {
  return buildSeatPricingPreview({
    mode: USE_MOCK ? "snapshot" : "live",
    pricingConfigured: !USE_MOCK && Boolean(String(ENV.VITE_VISTA_PRICING_PATH || "").trim()),
  });
}

function demoPricingQuote(cinemaId, sessionId, requestedSeats) {
  const items = requestedSeats.map((seat) => ({
    seatId: seat.id,
    amount: seat.premium ? DEMO_PRICING.premium : DEMO_PRICING.standard,
  }));
  return Object.freeze({
    quoteId: `DEMO-${sessionId}`,
    cinemaId,
    sessionId,
    items,
    subtotal: items.reduce((sum, item) => sum + item.amount, 0),
    fees: Object.freeze([]),
    feeTotal: 0,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    currency: DEMO_PRICING.currency,
    demo: true,
    verified: false,
    warning: "Demo prices are not a VOX quote.",
  });
}

export async function getPricingQuote(cinemaId, sessionId, seats = []) {
  const id = requireText(cinemaId, "cinemaId");
  const requestedSessionId = requireText(sessionId, "sessionId");
  const requestedSeats = (Array.isArray(seats) ? seats : []).map((seat) => (
    typeof seat === "string" ? { id: seat, premium: false } : seat
  )).filter((seat) => seat?.id);
  if (USE_MOCK || !String(ENV.VITE_VISTA_PRICING_PATH || "").trim()) {
    return demoPricingQuote(id, requestedSessionId, requestedSeats);
  }
  const url = configuredUrl(ENV.VITE_VISTA_PRICING_PATH, { cinemaId: id, sessionId: requestedSessionId }, "getPricingQuote");
  const payload = await requestJson(url, {
    operation: "getPricingQuote",
    method: "POST",
    body: { CinemaId: id, SessionId: requestedSessionId, Seats: requestedSeats.map((seat) => seat.id) },
  });
  const total = Number(payload?.Total ?? payload?.total);
  const currency = String(payload?.CurrencyCode || payload?.currency || "").trim();
  if (!Number.isFinite(total) || !currency) {
    throw new VistaClientError("The pricing response could not be verified.", { code: "PRICING_UNVERIFIED", operation: "getPricingQuote" });
  }
  const rawItems = Array.isArray(payload?.Items) ? payload.Items : Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.map((item) => ({
    ...item,
    seatId: item?.SeatId || item?.seatId || item?.Id || item?.id || null,
    amount: Number(item?.Amount ?? item?.amount ?? item?.Price ?? item?.price),
  })).filter((item) => Number.isFinite(item.amount));
  const rawFees = Array.isArray(payload?.Fees) ? payload.Fees : Array.isArray(payload?.fees) ? payload.fees : [];
  const fees = rawFees.map((fee) => ({
    ...fee,
    label: fee?.Description || fee?.Name || fee?.label || fee?.name || "Fee",
    amount: Number(fee?.Amount ?? fee?.amount ?? fee?.Total ?? fee?.total),
  })).filter((fee) => Number.isFinite(fee.amount));
  const suppliedFeeTotal = payload?.FeeTotal ?? payload?.feeTotal ?? payload?.BookingFee ?? payload?.bookingFee ?? payload?.ServiceFee ?? payload?.serviceFee;
  const parsedFeeTotal = Number(suppliedFeeTotal);
  const calculatedFeeTotal = fees.length ? fees.reduce((sum, fee) => sum + fee.amount, 0) : null;
  const suppliedSubtotal = Number(payload?.SubTotal ?? payload?.Subtotal ?? payload?.subtotal);
  const itemSubtotal = items.length ? items.reduce((sum, item) => sum + item.amount, 0) : null;
  const initialFeeTotal = Number.isFinite(parsedFeeTotal) ? parsedFeeTotal : calculatedFeeTotal;
  const subtotal = Number.isFinite(suppliedSubtotal)
    ? suppliedSubtotal
    : Number.isFinite(itemSubtotal)
      ? itemSubtotal
      : Number.isFinite(initialFeeTotal)
        ? total - initialFeeTotal
        : null;
  const derivedFeeTotal = Number.isFinite(subtotal) && total >= subtotal ? total - subtotal : null;
  const feeTotal = Number.isFinite(initialFeeTotal) ? initialFeeTotal : derivedFeeTotal;
  return Object.freeze({
    ...payload,
    items: Object.freeze(items),
    subtotal,
    fees: Object.freeze(fees),
    feeTotal,
    total,
    currency,
    demo: false,
    verified: true,
  });
}

export async function reserveSeats({ cinemaId, sessionId, seats = [], quoteId = null } = {}) {
  const id = requireText(cinemaId, "cinemaId");
  const requestedSessionId = requireText(sessionId, "sessionId");
  const requestedSeats = [...new Set((Array.isArray(seats) ? seats : []).map((seat) => String(seat).trim()).filter(Boolean))];
  if (!requestedSeats.length) throw new VistaClientError("At least one seat is required.", { code: "INVALID_ARGUMENT", operation: "reserveSeats" });
  if (USE_MOCK) {
    return Object.freeze({
      reserved: false,
      applied: false,
      demo: true,
      verified: false,
      cinemaId: id,
      sessionId: requestedSessionId,
      seats: requestedSeats,
      reason: "demo_inventory_not_reserved",
    });
  }
  const url = configuredUrl(ENV.VITE_VISTA_RESERVATION_PATH, { cinemaId: id, sessionId: requestedSessionId }, "reserveSeats");
  const payload = await requestJson(url, {
    operation: "reserveSeats",
    method: "POST",
    body: { CinemaId: id, SessionId: requestedSessionId, Seats: requestedSeats, QuoteId: quoteId },
  });
  const success = payload?.Success === true || Number(payload?.Result) === 0;
  const reservationRef = payload?.ReservationReference || payload?.ReservationId || payload?.BookingId || null;
  if (!success || !reservationRef) {
    throw new VistaClientError(payload?.ErrorDescription || "The seat reservation was not verified.", {
      code: "RESERVATION_REJECTED",
      operation: "reserveSeats",
      details: payload?.Result ?? null,
    });
  }
  return Object.freeze({ ...payload, reservationRef, reserved: true, applied: true, demo: false, verified: true });
}

function bookingResult(booking, mode, verified) {
  const showtimeAt = String(rawField(booking, "showtimeAt", "Showtime") || "") || null;
  const totalCents = Number(rawField(booking, "TotalValueCents", "totalValueCents"));
  const total = Number(rawField(booking, "total", "TotalValue"));
  const result = {
    ...booking,
    ref: rawField(booking, "ref", "BookingId"),
    movieTitle: rawField(booking, "movieTitle", "FilmTitle") || "",
    showtime: rawField(booking, "showtime") || showtimeAt?.slice(11, 16) || "",
    showtimeAt,
    date: rawField(booking, "date") || showtimeAt?.slice(0, 10) || null,
    screen: rawField(booking, "screen", "ScreenName") || "",
    seats: rawField(booking, "seats", "Seats") || [],
    refundAmount: Number.isFinite(Number(booking.refundAmount))
      ? Number(booking.refundAmount)
      : Number.isFinite(total) ? total : Number.isFinite(totalCents) ? totalCents / 100 : null,
    currency: rawField(booking, "currency", "CurrencyCode") || "AED",
    cancelled: Boolean(rawField(booking, "cancelled", "Cancelled")),
    dataMode: mode,
    demo: !verified,
    verified,
    providerEligibilityVerified: verified && rawField(booking, "CanRefund", "RefundEligible") === true,
    refundEligible: rawField(booking, "CanRefund", "RefundEligible"),
  };
  result.cancellation = assessCancellationEligibility(result);
  return result;
}

export async function searchBooking(ref) {
  const requestedRef = requireText(ref, "bookingReference");
  const hit = findBooking(requestedRef);
  if (hit) return bookingResult(hit, "local_demo", false);

  if (USE_MOCK) {
    await delay(250);
    if (requestedRef.toUpperCase() !== String(BOOKING.BookingId).toUpperCase()) {
      throw new VistaClientError(`Booking ${requestedRef} was not found.`, { code: "BOOKING_NOT_FOUND", operation: "searchBooking", status: 404 });
    }
    return bookingResult(BOOKING, "snapshot_demo", false);
  }

  const payload = await requestJson(`${BASE}/vistatickets/loyaltyalternate/v1/bookingsearch`, {
    operation: "searchBooking",
    method: "POST",
    body: { BookingId: requestedRef },
  });
  if (!payload?.Booking) {
    throw new VistaClientError(`Booking ${requestedRef} was not found.`, { code: "BOOKING_NOT_FOUND", operation: "searchBooking", status: 404 });
  }
  return bookingResult(payload.Booking, "live", true);
}

export async function refundBooking(ref, { booking = null, now = new Date(), requireLocalEligibility = false, idempotencyKey = null } = {}) {
  const requestedRef = requireText(ref, "bookingReference");
  const eligibility = booking ? assessCancellationEligibility(booking, { now }) : null;
  const storedBooking = findBooking(requestedRef);
  const isUnverifiedBooking = booking?.demo === true
    || booking?.verified === false
    || (storedBooking && storedBooking.verified !== true);
  if (USE_MOCK || isUnverifiedBooking) {
    await delay(250);
    return Object.freeze({
      Result: -1,
      ErrorDescription: "DEMO_ONLY_NO_REFUND_APPLIED",
      RefundReference: null,
      applied: false,
      demo: true,
      verified: false,
      eligibility,
    });
  }
  if (eligibility?.status === "ineligible" || (requireLocalEligibility && eligibility?.status !== "eligible")) {
    throw new VistaClientError("This booking is not locally eligible for cancellation.", {
      code: "REFUND_INELIGIBLE",
      operation: "refundBooking",
      details: eligibility?.reason || "eligibility_unverified",
    });
  }
  const url = configuredUrl(ENV.VITE_VISTA_REFUND_PATH, {
    bookingId: requestedRef,
    bookingReference: requestedRef,
    ref: requestedRef,
  }, "refundBooking");
  const payload = await requestJson(url, {
    operation: "refundBooking",
    method: "POST",
    body: { BookingId: requestedRef },
    headers: idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {},
  });
  const resultNumber = parseVistaResultCode(payload?.Result);
  const hasNumericResult = resultNumber !== null;
  const explicitSuccess = payload?.Success === true || (hasNumericResult && resultNumber === 0);
  const explicitRejection = payload?.Success === false || (hasNumericResult && resultNumber !== 0);
  const refundReference = parseVistaRefundReference(payload?.RefundReference)
    || parseVistaRefundReference(payload?.RefundId);
  if (explicitRejection && !explicitSuccess) {
    throw new VistaClientError(payload?.ErrorDescription || "The refund was not verified.", {
      code: "REFUND_REJECTED",
      operation: "refundBooking",
      details: payload?.Result ?? null,
    });
  }
  if (!explicitSuccess || explicitRejection || !refundReference) {
    throw new VistaClientError("The refund response did not contain a verifiable outcome.", {
      code: "REFUND_OUTCOME_UNVERIFIED",
      operation: "refundBooking",
      details: payload?.Result ?? null,
    });
  }
  return Object.freeze({ ...payload, RefundReference: refundReference, applied: true, demo: false, verified: true, eligibility });
}

export function clearVistaSessionCache() {
  liveSessionCache.clear();
  snapshotShardCache.clear();
  snapshotSessionIndex.clear();
}

export const VISTA_MODE = USE_MOCK ? "snapshot" : "live";
export const isVistaDemo = () => USE_MOCK;
