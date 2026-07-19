import { resolveCinemaCandidate } from "./cinemaRouting.js";
import { resolveFilmCandidate } from "./fuzzyResolvers.js";

export const DISCOVERY_PREFERENCE_KEYS = Object.freeze([
  "cinemaId",
  "cinemaName",
  "city",
  "date",
  "dateSignal",
  "preferredTime",
  "timeBand",
  "genre",
  "language",
  "experience",
  "movieId",
  "movieTitle",
  "audience",
]);

export const EMPTY_DISCOVERY_PREFERENCES = Object.freeze(
  Object.fromEntries(DISCOVERY_PREFERENCE_KEYS.map((key) => [key, null])),
);

const PREFERENCE_KEY_SET = new Set(DISCOVERY_PREFERENCE_KEYS);
const TIME_BANDS = Object.freeze({
  morning: [360, 720],
  afternoon: [720, 1020],
  evening: [1020, 1440],
  late: [1260, 1800],
});

const CINEMA_CITY_BY_ID = Object.freeze({
  "0001": "Dubai",
  "0002": "Dubai",
  "0004": "Ajman",
  "0005": "Dubai",
  "0006": "Fujairah",
  "0007": "Dubai",
  "0009": "Ras Al Khaimah",
  "0012": "Abu Dhabi",
  "0013": "Dubai",
  "0014": "Abu Dhabi",
  "0015": "Dubai",
  "0017": "Dubai",
  "0035": "Sharjah",
  "0036": "Abu Dhabi",
  "0039": "Al Ain",
  "0045": "Dubai",
  "0046": "Abu Dhabi",
  "0049": "Dubai",
  "0055": "Sharjah",
  "0057": "Dubai",
  "0104": "Abu Dhabi",
  "0105": "Dubai",
});

const CITY_ALIASES = Object.freeze([
  ["Ras Al Khaimah", ["ras al khaimah", "ras al-khaimah", "rak", "رأس الخيمة", "راس الخيمة"]],
  ["Abu Dhabi", ["abu dhabi", "أبو ظبي", "ابو ظبي", "أبوظبي", "ابوظبي"]],
  ["Al Ain", ["al ain", "al-ain", "العين"]],
  ["Sharjah", ["sharjah", "الشارقة"]],
  ["Fujairah", ["fujairah", "الفجيرة"]],
  ["Ajman", ["ajman", "عجمان"]],
  ["Dubai", ["dubai", "دبي"]],
]);

const GENRE_ALIASES = Object.freeze([
  ["Science Fiction", ["science fiction", "sci fi", "sci-fi", "scifi"]],
  ["Animation", ["animation", "animated", "cartoon", "رسوم متحركة", "انيميشن"]],
  ["Documentary", ["documentary", "وثائقي"]],
  ["Adventure", ["adventure", "مغامرات", "مغامرة"]],
  ["Thriller", ["thriller", "إثارة", "اثارة"]],
  ["Romance", ["romance", "romantic", "رومانسي"]],
  ["Comedy", ["comedy", "funny", "كوميدي", "كوميديا"]],
  ["Musical", ["musical", "موسيقي"]],
  ["Action", ["action", "أكشن", "اكشن"]],
  ["Horror", ["horror", "scary", "رعب"]],
  ["Drama", ["drama", "دراما"]],
  ["Family", ["family", "عائلي", "العائلة"]],
  ["Crime", ["crime", "جريمة"]],
  ["Sports", ["sports", "sport", "رياضي"]],
]);

const LANGUAGE_ALIASES = Object.freeze([
  ["Malayalam", ["malayalam", "مالايالامية", "مالايالام"]],
  ["English", ["english", "إنجليزي", "انجليزي", "الإنجليزية", "الانجليزية"]],
  ["Arabic", ["arabic", "عربي", "عربية", "العربية"]],
  ["Punjabi", ["punjabi", "بنجابي"]],
  ["Tagalog", ["tagalog", "filipino", "تاغالوغ"]],
  ["Turkish", ["turkish", "تركي"]],
  ["Telugu", ["telugu", "تيلوغو"]],
  ["Tamil", ["tamil", "تاميل"]],
  ["Hindi", ["hindi", "هندي"]],
]);

const EXPERIENCE_ALIASES = Object.freeze([
  ["THEATRE PODS IN IMAX", ["theatre pods in imax", "theater pods in imax", "imax pods"]],
  ["PRIVATE CINEMA", ["private cinema", "private screening"]],
  ["Couch - 2 Seater", ["couch 2 seater", "couch", "sofa"]],
  ["CINEMANIUM", ["cinemanium", "cinemaniam", "سينيمانيوم"]],
  ["PREMIER", ["premier", "premiere"]],
  ["PREMIUM", ["premium"]],
  ["THEATRE", ["theatre", "theater"]],
  ["STANDARD", ["standard", "regular", "2d", "2-d"]],
  ["PRIVATE CINEMA", ["private"]],
  ["ONYX", ["onyx"]],
  ["IMAX", ["imax", "آيماكس", "ايماكس"]],
  ["4DX", ["4dx", "4d", "فور دي إكس", "فور دي اكس"]],
  ["GOLD", ["gold", "ذهبي"]],
  ["KIDS", ["kids cinema", "kids experience"]],
  ["MAX", ["max"]],
]);

const normalizeText = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\u064b-\u065f\u0670]/g, "")
  .replace(/[_\u2013\u2014-]+/g, " ")
  .replace(/[^\p{L}\p{N}:]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeKey = (value) => normalizeText(value).replace(/\s+/g, " ");
const phraseInText = (text, phrase) => ` ${text} `.includes(` ${normalizeText(phrase)} `);
const pad2 = (value) => String(value).padStart(2, "0");
const isoDate = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
const addUtcDays = (date, days) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

function validCalendarDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day) return null;
  return candidate;
}

function dateInTimeZone(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
}

function canonicalDateSignal(input, { now = new Date(), timeZone = "Asia/Dubai" } = {}) {
  const raw = String(input ?? "").normalize("NFKC").toLowerCase();
  const text = normalizeText(input);
  const today = dateInTimeZone(now, timeZone);
  const directIso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (directIso) return { date: directIso[1], dateSignal: "explicit" };

  if (/\bday after tomorrow\b|بعد غد|بعد بكرة/.test(text)) {
    return { date: isoDate(addUtcDays(today, 2)), dateSignal: "day_after_tomorrow" };
  }
  if (/\btomorrow\b|\btmrw\b|غدا|بكرة/.test(text)) {
    return { date: isoDate(addUtcDays(today, 1)), dateSignal: "tomorrow" };
  }
  if (/\btonight\b|الليلة/.test(text)) return { date: isoDate(today), dateSignal: "tonight" };
  if (/\btoday\b|اليوم/.test(text)) return { date: isoDate(today), dateSignal: "today" };

  const numeric = text.match(/(?:^|\D)(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?:\D|$)/);
  if (numeric) {
    const yearValue = Number(numeric[3]) || today.getUTCFullYear();
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    return { date: `${year}-${pad2(Number(numeric[2]))}-${pad2(Number(numeric[1]))}`, dateSignal: "explicit" };
  }

  const monthAliases = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
    may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
    september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
    december: 12, dec: 12,
  };
  for (const [monthName, month] of Object.entries(monthAliases)) {
    const match = text.match(new RegExp(`(?:\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}\\b|\\b${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b)`));
    if (match) {
      const day = Number(match[1] || match[2]);
      let year = today.getUTCFullYear();
      let candidate = validCalendarDate(year, month, day);
      if (!candidate) return null;
      if (candidate < today) candidate = validCalendarDate(year += 1, month, day);
      return candidate ? { date: isoDate(candidate), dateSignal: "explicit" } : null;
    }
  }

  const ordinalDay = raw.match(/\bon(?:(?:[\s,.-]+)(?:the|um+|uh+))*[\s,.-]+(\d{1,2})(?:st|nd|rd|th)\b(?=\s*(?:$|[,.!?;:]|\b(?:at|around|in|for|please)\b))/)
    || text.match(/^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?:\s+please)?$/);
  if (ordinalDay) {
    const day = Number(ordinalDay[1]);
    for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
      const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, day));
      if (candidate.getUTCDate() !== day || candidate < today) continue;
      return { date: isoDate(candidate), dateSignal: "explicit" };
    }
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = weekdays.findIndex((name) => phraseInText(text, name));
  if (weekday >= 0) {
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = addUtcDays(today, offset);
      if (candidate.getUTCDay() === weekday) return { date: isoDate(candidate), dateSignal: weekdays[weekday] };
    }
  }
  return null;
}

function timeBandFromText(text) {
  if (/\blate(?:\s+at)?\s+night\b|\bafter midnight\b|آخر الليل|بعد منتصف الليل/.test(text)) return "late";
  if (/\btonight\b|\bevening\b|الليلة|مساء/.test(text)) return "evening";
  if (/\bafternoon\b|بعد الظهر/.test(text)) return "afternoon";
  if (/\bmorning\b|صباح/.test(text)) return "morning";
  return null;
}

function preferredTimeFromText(text, timeBand, { expectingTime = false } = {}) {
  if (/\bnoon\b|منتصف النهار/.test(text)) return "12:00";
  if (/\bmidnight\b|منتصف الليل/.test(text)) return "00:00";

  const meridiemMatch = text.match(/(?:\b(?:at|around|about|near|approximately|by)\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\s*m|p\s*m)\b/);
  const arabicMatch = text.match(/(?:الساعة|حوالي)\s*(\d{1,2})(?::(\d{2}))?\s*(صباحا|صباح|مساء|ليلا)?/);
  const twentyFourHourMatch = text.match(/(?:\b(?:at|around|about|near|approximately|by|showtime|time)\s*)\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const contextualHourMatch = text.match(/\b(?:at|around|about|near|approximately|by)\s+(\d{1,2})(?::(\d{2}))?\b/);
  const standaloneClockMatch = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  const expectedBareHourMatch = expectingTime ? text.match(/^(\d{1,2})(?::(\d{2}))?$/) : null;
  const match = meridiemMatch || arabicMatch || twentyFourHourMatch || contextualHourMatch || standaloneClockMatch || expectedBareHourMatch;
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const marker = String(match[3] || "");
  if (/p\s*m|مساء|ليلا/.test(marker) && hour < 12) hour += 12;
  if (/a\s*m|صباح/.test(marker) && hour === 12) hour = 0;
  if (!marker && hour <= 6 && timeBand === "evening") hour += 12;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function findAliasValue(text, groups) {
  const matches = [];
  for (const [canonical, aliases] of groups) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeText(alias);
      if (phraseInText(text, normalizedAlias)) matches.push({ canonical, length: normalizedAlias.length });
    }
  }
  return matches.sort((left, right) => right.length - left.length || left.canonical.localeCompare(right.canonical))[0]?.canonical || null;
}

function dynamicAliasGroups(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))]
    .map((value) => [value, [value]]);
}

function movieIdentity(movie) {
  return String(movie?.id ?? movie?.code ?? movie?.ScheduledFilmId ?? movie?.scheduledFilmId ?? movie?.movieId ?? "").trim();
}

function movieTitle(movie) {
  return String(movie?.title ?? movie?.Title ?? movie?.name ?? "").trim();
}

function findMovieInText(text, movies) {
  return (Array.isArray(movies) ? movies : [])
    .map((movie) => ({ movie, title: normalizeText(movieTitle(movie)) }))
    .filter(({ title }) => title.length >= 2 && phraseInText(text, title))
    .sort((left, right) => right.title.length - left.title.length || movieTitle(left.movie).localeCompare(movieTitle(right.movie)))[0]?.movie || null;
}

function explicitClears(text) {
  const clear = new Set();
  if (/\b(?:start over|reset everything|clear all filters)\b|ابدأ من جديد|امسح كل/.test(text)) {
    DISCOVERY_PREFERENCE_KEYS.forEach((key) => clear.add(key));
    return clear;
  }
  if (/\b(?:any|another)\s+(?:cinema|location|venue)\b|\bwherever\b|اي سينما|أي سينما/.test(text)) {
    ["cinemaId", "cinemaName", "city"].forEach((key) => clear.add(key));
  }
  if (/\b(?:any|another)\s+(?:date|day)\b|اي يوم|أي يوم/.test(text)) ["date", "dateSignal"].forEach((key) => clear.add(key));
  if (/\b(?:any time|whenever|no time preference)\b|اي وقت|أي وقت/.test(text)) ["preferredTime", "timeBand"].forEach((key) => clear.add(key));
  if (/\b(?:any genre|no genre preference)\b|اي نوع|أي نوع/.test(text)) ["genre", "audience"].forEach((key) => clear.add(key));
  if (/\b(?:any language|no language preference)\b|اي لغة|أي لغة/.test(text)) clear.add("language");
  if (/\b(?:any (?:format|experience)|regular is fine|no (?:format|experience) preference)\b|اي تجربة|أي تجربة/.test(text)) clear.add("experience");
  if (/\b(?:any movie|another movie|other movies|something else)\b|فيلم آخر|فيلم اخر/.test(text)) ["movieId", "movieTitle"].forEach((key) => clear.add(key));
  if (isOpenEndedDiscoveryRequest(text)) {
    ["movieId", "movieTitle", "preferredTime", "timeBand", "genre", "language", "experience", "audience"]
      .forEach((key) => clear.add(key));
  }
  if (/\b(?:not for kids|no kids)\b|ليس للاطفال|مش للاطفال/.test(text)) clear.add("audience");
  return clear;
}

export function isOpenEndedDiscoveryRequest(input) {
  const text = normalizeText(input);
  return /^(?:any(?:thing| movie)?(?: is fine)?|whatever(?: is fine)?|anything works|no preference|surprise me|recommend (?:anything|something|a movie)|suggest (?:anything|something|a movie)|show (?:me )?(?:anything|any movie|all movies))$/iu.test(text)
    || /^(?:أي شيء|اي شيء|أي فيلم|اي فيلم|لا فرق|اقترح أي شيء|اقترح اي شيء)$/iu.test(text);
}

export function createDiscoveryPreferences(seed = {}) {
  const preferences = { ...EMPTY_DISCOVERY_PREFERENCES };
  for (const key of DISCOVERY_PREFERENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(seed || {}, key)) continue;
    const value = seed[key];
    preferences[key] = typeof value === "string" ? value.trim() || null : value ?? null;
  }
  return preferences;
}

/**
 * Extract only criteria explicitly present in this turn. Omitted keys are not
 * cleared, which lets the caller retain preferences across text and voice.
 */
export function extractDiscoveryPreferencePatch(input, {
  cinemas = [],
  movies = [],
  knownGenres = [],
  knownLanguages = [],
  knownExperiences = [],
  expectingTime = false,
  now = new Date(),
  timeZone = "Asia/Dubai",
} = {}) {
  const text = normalizeText(input);
  const patch = {};
  const clear = explicitClears(text);
  if (!text) return { patch, clear: [...clear], provided: [], hasDiscoverySignal: false };

  const cinema = resolveCinemaCandidate(cinemas, input);
  if (cinema) {
    patch.cinemaId = String(cinema.id ?? cinema.ID ?? "").trim() || null;
    patch.cinemaName = String(cinema.name ?? cinema.Name ?? "").trim() || null;
    const mappedCity = cinema.city || cinema.City || CINEMA_CITY_BY_ID[patch.cinemaId];
    if (mappedCity) patch.city = String(mappedCity);
  } else {
    const city = findAliasValue(text, CITY_ALIASES);
    if (city) {
      patch.city = city;
      clear.add("cinemaId");
      clear.add("cinemaName");
    }
  }

  const dateResult = canonicalDateSignal(input, { now, timeZone });
  if (dateResult) Object.assign(patch, dateResult);

  const timeBand = timeBandFromText(text);
  const preferredTime = preferredTimeFromText(text, timeBand, { expectingTime });
  if (preferredTime) {
    patch.preferredTime = preferredTime;
    clear.add("timeBand");
  } else if (timeBand) {
    patch.timeBand = timeBand;
    clear.add("preferredTime");
  }

  const movie = findMovieInText(text, movies);
  if (movie) {
    patch.movieId = movieIdentity(movie) || null;
    patch.movieTitle = movieTitle(movie) || null;
  }

  const catalogGenres = (movies || []).flatMap((item) => item?.genres || item?.Genres || [item?.genre || item?.Genre]).filter(Boolean);
  const genre = findAliasValue(text, [
    ...dynamicAliasGroups(knownGenres),
    ...dynamicAliasGroups(catalogGenres),
    ...GENRE_ALIASES,
  ]);
  if (genre) patch.genre = genre;

  const catalogLanguages = (movies || []).flatMap((item) => item?.languages || item?.Languages || [item?.languageName, item?.language]).filter(Boolean);
  const language = findAliasValue(text, [
    ...dynamicAliasGroups(knownLanguages),
    ...dynamicAliasGroups(catalogLanguages),
    ...LANGUAGE_ALIASES,
  ]);
  if (language) patch.language = language;

  const kidsFamilyRequest = /\b(?:kids?|children|childrens|family|families|family friendly)\b|أطفال|اطفال|عائلي|العائلة/.test(text);
  const explicitKidsExperience = /\b(?:kids?\s+(?:cinema|experience|format)|in\s+kids|kids?\s+(?:at|showtime))\b|(?:سينما|تجربة|صيغة)\s+(?:الأطفال|الاطفال)/.test(text);
  const catalogExperiences = (movies || []).flatMap((item) => item?.experiences || item?.Experiences || []).filter(Boolean);
  const experience = findAliasValue(text, [
    ...dynamicAliasGroups(knownExperiences),
    ...dynamicAliasGroups(catalogExperiences),
    ...EXPERIENCE_ALIASES,
  ]);
  if (experience && !(normalizeKey(experience) === "kids" && kidsFamilyRequest && !explicitKidsExperience)) {
    patch.experience = experience;
  }

  if (kidsFamilyRequest) {
    patch.audience = "kids_family";
    // "Family movies" is an audience request, not a demand that the source
    // catalog use the literal Family genre (many suitable titles use Animation).
    if (patch.genre === "Family") delete patch.genre;
  }

  // Genre and audience are two ways guests narrow the same content choice.
  // A later turn that supplies only one replaces the stale value from the
  // other dimension ("family movies" -> "action movies"), instead of
  // accidentally requiring an often-empty intersection. If both are stated
  // together ("family action movies"), both remain explicit constraints.
  if (patch.genre && !patch.audience) clear.add("audience");
  if (patch.audience && !patch.genre) clear.add("genre");

  if ((patch.genre || patch.audience) && !patch.movieId && !patch.movieTitle) {
    clear.add("movieId");
    clear.add("movieTitle");
  }

  for (const key of Object.keys(patch)) clear.delete(key);
  const provided = [...new Set([...Object.keys(patch), ...clear])].sort();
  return {
    patch,
    clear: [...clear].sort(),
    provided,
    hasDiscoverySignal: provided.length > 0,
  };
}

const DISCOVERY_ACTION_PATTERN = /\b(?:book|booking|i want|i need|show me|find me|find|watch|see|playing|showing|available|prefer|instead|change|switch|make that)\b|(?:أريد|اريد|أحتاج|احتاج|احجز|حجز|اعرض|ابحث|أشاهد|اشاهد|يعرض|متاح|أفضّل|افضل|بدلاً|بدلا|غيّر|غير)/iu;
const INFORMATION_QUESTION_PATTERN = /^\s*(?:what\s+(?:is|are|does|do|can)|is|are|does|do|can|could|would|how|where|why|when|tell me|explain|ما|هل|كيف|أين|اين|متى|اشرح|أخبرني)/iu;
const INFORMATION_TOPIC_PATTERN = /\b(?:accessible|accessibility|wheelchair|parking|park|food|snacks?|menu|policy|refund|age limit|rating|facilit(?:y|ies)|opening hours?|close|closing|open|loyalty|gift card|prayer room|toilet|restroom)\b|(?:ذوي الإعاقة|كرسي متحرك|مواقف|طعام|وجبات|سياسة|استرداد|تصنيف عمري|مرافق|ساعات العمل|يفتح|يغلق|ولاء|بطاقة هدايا|دورة مياه)/iu;

const GENERIC_DISCOVERY_TITLE_RESIDUAL = /^(?:(?:what(?:\s+(?:is|are|s))?|what\s+(?:movies?|films?)|which\s+(?:movies?|films?)|movies?|films?)\s+)?(?:(?:is|are)\s+)?(?:now\s+)?(?:playing|showing|available|on)(?:\s+now)?$/iu;

/**
 * Decide whether a transcript is a booking-filter turn rather than an FAQ.
 * Criteria words inside policy/accessibility questions must not mutate an
 * active journey (for example, "Is IMAX wheelchair accessible?").
 */
export function shouldTreatAsDiscoveryFilterTurn(input, {
  view = "empty",
  missing = [],
  signal = null,
} = {}) {
  const value = String(input || "").trim();
  if (!value) return false;
  const parsed = signal || { patch: {}, clear: [], hasDiscoverySignal: false };
  const explicitAction = DISCOVERY_ACTION_PATTERN.test(value);
  const informational = INFORMATION_QUESTION_PATTERN.test(value) || INFORMATION_TOPIC_PATTERN.test(value);
  const genericDiscovery = /\b(?:movies?|films?|showtimes?|cinemas?)\b|(?:أفلام|افلام|فيلم|مواعيد عرض|سينما)/iu.test(value);
  const hasSignal = Boolean(parsed.hasDiscoverySignal || genericDiscovery);
  if (!hasSignal) return false;
  if (informational && !explicitAction) return false;
  if (explicitAction) return true;

  const activeDiscovery = ["discovery", "cinemas", "movies", "showtimes", "seatmap", "checkout"].includes(view);
  if (!activeDiscovery) return false;
  const fields = new Set(Array.isArray(missing) ? missing : []);
  const patch = parsed.patch || {};
  const satisfiesMissing = (fields.has("cinema") && (patch.cinemaId || patch.cinemaName || patch.city))
    || (fields.has("date") && patch.date)
    || (fields.has("preference") && (patch.movieTitle || patch.genre || patch.language || patch.experience || patch.audience || patch.preferredTime || patch.timeBand))
    || (fields.has("time") && (patch.preferredTime || patch.timeBand));
  return Boolean(parsed.hasDiscoverySignal || satisfiesMissing);
}

/**
 * Returns a likely unrecognised title fragment only when the guest appears to
 * name a film. Broad requests such as "watch a comedy" or "watch a movie
 * tomorrow" deliberately return null so they can continue as normal filters.
 */
export function unresolvedMovieTitleCandidate(input, signal = {}) {
  const value = String(input || "").trim();
  const patch = signal.patch || {};
  const clear = new Set(signal.clear || []);
  if (!value || patch.movieTitle || patch.movieId || clear.has("movieTitle") || clear.has("movieId")) return null;
  if (/^\s*(?:ما|ماذا|أي|اي)\s+(?:(?:هي|هو)\s+)?(?:الأفلام|الافلام|أفلام|افلام)(?:\s|$)/iu.test(value)) return null;
  if (/^(?:أريد|اريد)\s+فيلم(?:ا[\u064b-\u065f]*)?\s+(?:في|حوالي)(?:\s|$)/iu.test(value)) return null;

  const direct = value.match(/\b(?:movie|film)\s+(?:called|named)\s+(.+)/iu)
    || value.match(/\b(?:watch|see)\s+(.+)/iu)
    || value.match(/\b(?:tickets?\s+for|book(?:\s+me)?|show\s+me|i\s+(?:want|need))\s+(.+)/iu)
    || value.match(/(?:فيلم\s+(?:اسمه|يدعى)|أشاهد|اشاهد|(?:أريد|اريد)\s+فيلم(?:ا[\u064b-\u065f]*)?)\s+(.+)/iu);
  let candidateSource = direct?.[1] || "";
  if (candidateSource && direct) {
    candidateSource = /^(?:at|in|on|في|حوالي)(?:\s|$)/iu.test(candidateSource.trim())
      ? ""
      : candidateSource.split(/\b(?:at|in|on|tomorrow|today|tonight|around|near|after|before|with)\b|(?:\sفي\s|\sغدا|\sغداً|\sاليوم|\sالليلة|\sحوالي|\sبعد|\sقبل|\sمع)/iu)[0].trim();
  }
  if (!candidateSource && (patch.cinemaId || patch.cinemaName || patch.city || patch.date)) {
    candidateSource = value;
  }
  if (!candidateSource) return null;

  const escapePattern = (item) => String(item || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const removePhrase = (source, phrase) => phrase
    ? source.replace(new RegExp(`\\b${escapePattern(phrase)}\\b`, "giu"), " ")
    : source;
  for (const knownLocation of [patch.cinemaName, patch.city]) {
    if (!knownLocation) continue;
    const withoutBrand = String(knownLocation).replace(/^\s*VOX\s*[\u2014\u2013-]?\s*/iu, "");
    candidateSource = removePhrase(candidateSource, knownLocation);
    candidateSource = removePhrase(candidateSource, withoutBrand);
  }
  const removeCanonicalAliases = (source, canonical, groups) => {
    if (!canonical) return source;
    let next = removePhrase(source, canonical);
    const group = groups.find(([name]) => normalizeKey(name) === normalizeKey(canonical));
    for (const alias of group?.[1] || []) next = removePhrase(next, alias);
    return next;
  };
  candidateSource = removeCanonicalAliases(candidateSource, patch.genre, GENRE_ALIASES);
  candidateSource = removeCanonicalAliases(candidateSource, patch.language, LANGUAGE_ALIASES);
  candidateSource = removeCanonicalAliases(candidateSource, patch.experience, EXPERIENCE_ALIASES);
  if (patch.audience === "kids_family") candidateSource = candidateSource.replace(/\b(?:kids?|children|childrens|family|families|family friendly)\b|(?:أطفال|اطفال|عائلي|العائلة)/giu, " ");
  candidateSource = candidateSource
    .replace(/\b\d{4}-\d{2}-\d{2}\b|\b(?:today|tomorrow|tonight|day after tomorrow|morning|afternoon|evening|late at night)\b|(?:اليوم|غدا|غداً|الليلة|بعد غد|صباح|بعد الظهر|مساء)/giu, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b/giu, " ")
    .replace(/\b(?:at|in|on|around|near|after|before|with|for|please|movie|film|cinema|showtime)\b|(?:(?:أريد|اريد|أحتاج|احتاج|اعرض)|فيلم(?:ا[\u064b-\u065f]*)?|في|حوالي|بعد|قبل|مع|سينما|موعد عرض|الساعة|من فضلك)/giu, " ")
    .replace(/^\s*(?:to\s+)?(?:a|an|the)\s+/iu, "")
    .replace(/^\s*(?:a|an|the)\s+/iu, "")
    .replace(/\s+(?:movies?|films?)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
  const candidate = candidateSource;
  if (!candidate) return null;
  const normalized = normalizeText(candidate);
  if (GENERIC_DISCOVERY_TITLE_RESIDUAL.test(normalized)) return null;
  if (!normalized || /^(?:a|an|the|this|that|movies?|films?|showtimes?|options?|choices?|something|anything|one|tickets?|seats?|أفلام|افلام|فيلم|خيارات|شيء|أي شيء|تذاكر|مقاعد)$/iu.test(normalized)) return null;
  if (/\b(?:tickets?|seats?)\b|(?:تذاكر|مقاعد)/iu.test(normalized)) return null;
  return candidate;
}

/**
 * Reuses the established fuzzy film resolver after the real cinema/date
 * catalog is available, while rejecting tied or weak fuzzy guesses.
 */
export function resolveDiscoveryMovieCandidate(movies, candidate) {
  const list = Array.isArray(movies) ? movies : [];
  const query = normalizeText(candidate);
  if (!query) return null;
  const resolved = resolveFilmCandidate(list, candidate);
  if (!resolved) return null;

  const queryTokens = query.split(/\s+/).filter((token) => token && !["a", "an", "the", "film", "movie", "please", "show", "watch"].includes(token));
  if (!queryTokens.length) return null;
  const scored = list.map((movie) => {
    const title = normalizeText(movieTitle(movie));
    const titleTokens = new Set(title.split(/\s+/).filter(Boolean));
    const matches = queryTokens.filter((token) => titleTokens.has(token)).length;
    const exactPhrase = phraseInText(title, query) || phraseInText(query, title);
    return { movie, exactPhrase, score: matches / queryTokens.length, matches };
  }).filter((item) => item.exactPhrase || item.score >= 0.5);
  const resolvedItem = scored.find((item) => movieIdentity(item.movie) === movieIdentity(resolved));
  if (!resolvedItem) return null;
  if (resolvedItem.exactPhrase) {
    const exactMatches = scored.filter((item) => item.exactPhrase);
    return exactMatches.length === 1 ? resolved : null;
  }
  const bestScore = Math.max(...scored.map((item) => item.score));
  const best = scored.filter((item) => item.score === bestScore);
  return resolvedItem.score === bestScore && best.length === 1 ? resolved : null;
}

/** Clear first, then apply this turn's explicit values; a supplied value wins. */
export function mergeDiscoveryPreferences(current, update = {}) {
  const previous = createDiscoveryPreferences(current);
  const patch = update?.patch && typeof update.patch === "object" ? update.patch : update;
  const clear = Array.isArray(update?.clear) ? update.clear : [];
  const next = { ...previous };

  for (const key of clear) {
    if (PREFERENCE_KEY_SET.has(key)) next[key] = null;
  }
  for (const [key, rawValue] of Object.entries(patch || {})) {
    if (!PREFERENCE_KEY_SET.has(key)) continue;
    next[key] = typeof rawValue === "string" ? rawValue.trim() || null : rawValue ?? null;
  }

  const changedKeys = DISCOVERY_PREFERENCE_KEYS.filter((key) => previous[key] !== next[key]);
  const clearedKeys = changedKeys.filter((key) => previous[key] != null && next[key] == null);
  const resultKeys = new Set(changedKeys.filter((key) => key !== "dateSignal"));
  const movieSelectionKeys = new Set(["cinemaId", "cinemaName", "city", "date", "genre", "language", "experience", "movieId", "movieTitle", "audience"]);
  const sessionSelectionKeys = new Set([...movieSelectionKeys, "preferredTime", "timeBand"]);
  const intersects = (keys) => [...resultKeys].some((key) => keys.has(key));

  return {
    preferences: next,
    changedKeys,
    clearedKeys,
    invalidates: {
      movieResults: resultKeys.size > 0,
      movieSelection: intersects(movieSelectionKeys),
      sessionResults: resultKeys.size > 0,
      sessionSelection: intersects(sessionSelectionKeys),
      seatSelection: intersects(sessionSelectionKeys),
      pricing: intersects(sessionSelectionKeys),
    },
  };
}

export function parseAndMergeDiscoveryPreferences(current, input, options = {}) {
  const update = extractDiscoveryPreferencePatch(input, options);
  return { ...mergeDiscoveryPreferences(current, update), update };
}

function fieldIsPresent(preferences, field) {
  if (field === "cinema") return Boolean(preferences.cinemaId || preferences.cinemaName);
  if (field === "location") return Boolean(preferences.cinemaId || preferences.cinemaName || preferences.city);
  if (field === "time") return Boolean(preferences.preferredTime || preferences.timeBand);
  if (field === "movie") return Boolean(preferences.movieId || preferences.movieTitle);
  if (field === "movieOrPreference") {
    return Boolean(preferences.movieId || preferences.movieTitle || preferences.genre || preferences.language || preferences.experience || preferences.audience);
  }
  return Boolean(preferences[field]);
}

/** Returns only caller-declared requirements that the guest has not supplied. */
export function getMissingDiscoveryCriteria(preferences, required = ["location", "date"]) {
  const current = createDiscoveryPreferences(preferences);
  return [...new Set(required)].filter((field) => !fieldIsPresent(current, field));
}

function splitValues(value) {
  const input = Array.isArray(value) ? value : [value];
  return input
    .flatMap((item) => String(item ?? "").split(/[,/|]+/))
    .map(normalizeKey)
    .filter(Boolean);
}

function movieGenres(movie) {
  return splitValues(movie?.genres ?? movie?.Genres ?? movie?.genre ?? movie?.Genre);
}

function movieLanguages(movie) {
  return splitValues(movie?.languages ?? movie?.Languages ?? [movie?.languageName, movie?.LanguageName, movie?.language, movie?.Language]);
}

function movieExperiences(movie) {
  return splitValues(movie?.experiences ?? movie?.Experiences ?? movie?.experience ?? movie?.Experience);
}

function sessionMovieId(session) {
  return String(session?.scheduledFilmId ?? session?.ScheduledFilmId ?? session?.movieId ?? session?.code ?? "").trim();
}

function sessionCinemaId(session) {
  return String(session?.cinemaId ?? session?.CinemaId ?? session?.cinemaCode ?? session?.CinemaCode ?? "").trim();
}

function sessionDate(session) {
  return String(session?.programmingDate ?? session?.ProgrammingDate ?? session?.date ?? session?.Date ?? session?.showtimeAt ?? session?.showtime ?? session?.Showtime ?? "").slice(0, 10);
}

function sessionTime(session) {
  const direct = String(session?.time ?? session?.Time ?? "").match(/\b([0-2]\d):([0-5]\d)\b/);
  if (direct) return `${direct[1]}:${direct[2]}`;
  const source = String(session?.showtimeAt ?? session?.showtime ?? session?.Showtime ?? "");
  const match = source.match(/T([0-2]\d):([0-5]\d)/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function sessionExperience(session) {
  return splitValues(session?.exp ?? session?.experience ?? session?.Experience ?? session?.experienceCode ?? session?.ExperienceCode ?? session?.sessionAttributesNames ?? session?.SessionAttributesNames);
}

function cinemaIdentity(cinema) {
  return String(cinema?.id ?? cinema?.ID ?? cinema?.code ?? "").trim();
}

function cityForCinemaId(cinemaId, cinemas) {
  const cinema = (cinemas || []).find((item) => cinemaIdentity(item) === String(cinemaId || ""));
  const direct = cinema?.city ?? cinema?.City;
  if (direct) return String(direct);
  return CINEMA_CITY_BY_ID[String(cinemaId || "")] || null;
}

function valuesMatch(values, requested) {
  const canonical = (value) => {
    const normalized = normalizeKey(value);
    if (["sci fi", "scifi", "science fiction"].includes(normalized)) return "science fiction";
    return normalized === "2d" ? "standard" : normalized;
  };
  const wanted = canonical(requested);
  if (!wanted) return true;
  return values.some((value) => {
    const canonicalValue = canonical(value);
    return canonicalValue === wanted
      || ` ${canonicalValue} `.includes(` ${wanted} `)
      || ` ${wanted} `.includes(` ${canonicalValue} `);
  });
}

function kidsFamilyMovie(movie) {
  const genres = movieGenres(movie);
  const tags = splitValues([movie?.audience, movie?.audiences, movie?.categories, movie?.Category]);
  return genres.some((genre) => ["family", "animation", "children", "kids"].includes(genre))
    || tags.some((tag) => /\b(?:family|children|kids)\b/.test(tag))
    || movieExperiences(movie).includes("kids");
}

function movieMatchesSpecific(movie, preferences) {
  if (preferences.movieId && movieIdentity(movie) !== String(preferences.movieId)) return false;
  if (!preferences.movieTitle) return true;
  const title = normalizeKey(movieTitle(movie));
  const wanted = normalizeKey(preferences.movieTitle);
  return title === wanted || phraseInText(title, wanted) || phraseInText(wanted, title);
}

function movieMatchesMetadata(movie, preferences, kidsSessionMovieIds, cinemas, { ignoreExperience = false } = {}) {
  if (!movieMatchesSpecific(movie, preferences)) return false;
  const directCinemaId = sessionCinemaId(movie);
  const directDate = sessionDate(movie);
  const directCity = movie?.city ?? movie?.City ?? (directCinemaId ? cityForCinemaId(directCinemaId, cinemas) : null);
  if (preferences.cinemaId && directCinemaId && directCinemaId !== String(preferences.cinemaId)) return false;
  if (preferences.city && directCity && normalizeKey(directCity) !== normalizeKey(preferences.city)) return false;
  if (preferences.date && directDate && directDate !== preferences.date) return false;
  if (preferences.genre && !valuesMatch(movieGenres(movie), preferences.genre)) return false;
  if (preferences.language && !valuesMatch(movieLanguages(movie), preferences.language)) return false;
  if (preferences.audience === "kids_family"
    && !kidsFamilyMovie(movie)
    && !kidsSessionMovieIds.has(movieIdentity(movie))) return false;
  if (!ignoreExperience && preferences.experience && movieExperiences(movie).length && !valuesMatch(movieExperiences(movie), preferences.experience)) return false;
  return true;
}

function toMinutes(time, programmingDayCutoffHour = 6) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute + (hour < programmingDayCutoffHour ? 1440 : 0);
}

function sessionStableId(session) {
  return String(session?.sessionId ?? session?.SessionId ?? session?.id ?? "");
}

function sortChronologically(sessions, cutoff) {
  return [...sessions].sort((left, right) => {
    const timeDifference = (toMinutes(sessionTime(left), cutoff) ?? Infinity) - (toMinutes(sessionTime(right), cutoff) ?? Infinity);
    return timeDifference || sessionStableId(left).localeCompare(sessionStableId(right));
  });
}

/**
 * Applies every supplied criterion. If a requested minute is unavailable,
 * sessions are ranked by distance and the closest suitable options are
 * returned with explicit fallback metadata.
 */
export function filterDiscoveryResults({
  movies = [],
  sessions = null,
  cinemas = [],
  preferences = EMPTY_DISCOVERY_PREFERENCES,
  timeToleranceMinutes = 60,
  nearestLimit = 3,
  maxFallbackMinutes = Infinity,
  programmingDayCutoffHour = 6,
} = {}) {
  const criteria = createDiscoveryPreferences(preferences);
  const movieList = Array.isArray(movies) ? movies : [];
  const cinemaList = Array.isArray(cinemas) ? cinemas : [];
  const filteredCinemas = cinemaList.filter((cinema) => {
    const id = cinemaIdentity(cinema);
    if (criteria.cinemaId && id !== String(criteria.cinemaId)) return false;
    if (criteria.cinemaName && !criteria.cinemaId && normalizeKey(cinema?.name ?? cinema?.Name) !== normalizeKey(criteria.cinemaName)) return false;
    if (criteria.city && normalizeKey(cityForCinemaId(id, cinemaList)) !== normalizeKey(criteria.city)) return false;
    return true;
  });
  const hasSessionCatalog = Array.isArray(sessions);
  const sessionList = hasSessionCatalog ? sessions : [];
  const kidsSessionMovieIds = new Set(sessionList
    .filter((session) => {
      const cinemaId = sessionCinemaId(session);
      if (criteria.cinemaId && cinemaId !== String(criteria.cinemaId)) return false;
      if (criteria.cinemaName && !criteria.cinemaId) {
        const cinema = cinemaList.find((item) => cinemaIdentity(item) === cinemaId);
        if (!cinema || normalizeKey(cinema.name ?? cinema.Name) !== normalizeKey(criteria.cinemaName)) return false;
      }
      if (criteria.city && normalizeKey(cityForCinemaId(cinemaId, cinemaList)) !== normalizeKey(criteria.city)) return false;
      if (criteria.date && sessionDate(session) !== criteria.date) return false;
      return true;
    })
    .filter((session) => valuesMatch(sessionExperience(session), "KIDS"))
    .map(sessionMovieId)
    .filter(Boolean));
  const moviesById = new Map(movieList.map((movie) => [movieIdentity(movie), movie]));

  const metadataMovies = movieList.filter((movie) => movieMatchesMetadata(
    movie,
    criteria,
    kidsSessionMovieIds,
    cinemas,
    { ignoreExperience: hasSessionCatalog },
  ));
  const allowedMovieIds = new Set(metadataMovies.map(movieIdentity).filter(Boolean));
  let baseSessions = sessionList.filter((session) => {
    const cinemaId = sessionCinemaId(session);
    if (criteria.cinemaId && cinemaId !== String(criteria.cinemaId)) return false;
    if (criteria.cinemaName && !criteria.cinemaId) {
      const cinema = (cinemas || []).find((item) => cinemaIdentity(item) === cinemaId);
      if (!cinema || normalizeKey(cinema.name ?? cinema.Name) !== normalizeKey(criteria.cinemaName)) return false;
    }
    if (criteria.city && normalizeKey(cityForCinemaId(cinemaId, cinemas)) !== normalizeKey(criteria.city)) return false;
    if (criteria.date && sessionDate(session) !== criteria.date) return false;
    if (criteria.experience && !valuesMatch(sessionExperience(session), criteria.experience)) return false;

    const filmId = sessionMovieId(session);
    const associatedMovie = moviesById.get(filmId);
    if (associatedMovie && !allowedMovieIds.has(filmId)) return false;
    if (!associatedMovie && (criteria.movieId || criteria.movieTitle || criteria.genre || criteria.language || criteria.audience)) {
      if (!movieMatchesMetadata(session, criteria, kidsSessionMovieIds, cinemas)) return false;
    }
    return true;
  });

  if (criteria.timeBand && TIME_BANDS[criteria.timeBand]) {
    const [start, end] = TIME_BANDS[criteria.timeBand];
    baseSessions = baseSessions.filter((session) => {
      const minutes = toMinutes(sessionTime(session), programmingDayCutoffHour);
      return minutes != null && minutes >= start && minutes < end;
    });
  }

  const timeMetadata = {
    requested: Boolean(criteria.preferredTime),
    requestedTime: criteria.preferredTime,
    exactTimeMatch: false,
    exactSessionCount: 0,
    usedNearestFallback: false,
    matchKind: criteria.preferredTime ? "unavailable" : "not_requested",
    closestDeltaMinutes: null,
    toleranceMinutes: timeToleranceMinutes,
    closestTimes: [],
  };

  let filteredSessions = sortChronologically(baseSessions, programmingDayCutoffHour);
  if (criteria.preferredTime && baseSessions.length) {
    const requestedMinutes = toMinutes(criteria.preferredTime, programmingDayCutoffHour);
    const ranked = requestedMinutes == null ? [] : baseSessions
      .map((session) => ({
        session,
        delta: Math.abs((toMinutes(sessionTime(session), programmingDayCutoffHour) ?? Infinity) - requestedMinutes),
      }))
      .filter((item) => Number.isFinite(item.delta))
      .sort((left, right) => left.delta - right.delta
        || (toMinutes(sessionTime(left.session), programmingDayCutoffHour) ?? Infinity) - (toMinutes(sessionTime(right.session), programmingDayCutoffHour) ?? Infinity)
        || sessionStableId(left.session).localeCompare(sessionStableId(right.session)));
    const exact = ranked.filter((item) => item.delta === 0);
    timeMetadata.exactTimeMatch = exact.length > 0;
    timeMetadata.exactSessionCount = exact.length;
    timeMetadata.closestDeltaMinutes = ranked[0]?.delta ?? null;

    if (exact.length) {
      const close = ranked
        .filter((item) => item.delta <= timeToleranceMinutes)
        .slice(0, Math.max(exact.length, Math.max(1, nearestLimit)));
      filteredSessions = close.map((item) => item.session);
      timeMetadata.matchKind = "exact";
    } else {
      const withinTolerance = ranked.filter((item) => item.delta <= timeToleranceMinutes);
      const candidates = withinTolerance.length ? withinTolerance : ranked;
      filteredSessions = candidates
        .filter((item) => item.delta <= maxFallbackMinutes)
        .slice(0, Math.max(1, nearestLimit))
        .map((item) => item.session);
      timeMetadata.usedNearestFallback = filteredSessions.length > 0;
      timeMetadata.matchKind = filteredSessions.length ? "nearest" : "unavailable";
    }
    timeMetadata.closestTimes = [...new Set(filteredSessions.map(sessionTime).filter(Boolean))];
  }

  let filteredMovies = metadataMovies;
  if (hasSessionCatalog) {
    const availableMovieIds = new Set(filteredSessions.map(sessionMovieId).filter(Boolean));
    const sessionsHaveMovieIds = sessionList.some((session) => sessionMovieId(session));
    if (sessionsHaveMovieIds || sessionList.length === 0) {
      filteredMovies = metadataMovies.filter((movie) => availableMovieIds.has(movieIdentity(movie)));
    }
  }

  let noResultsReason = null;
  if (!filteredMovies.length && !filteredSessions.length) {
    if (criteria.preferredTime && baseSessions.length) noResultsReason = "no_suitable_time";
    else if (criteria.experience) noResultsReason = "no_experience_match";
    else if (criteria.movieId || criteria.movieTitle) noResultsReason = "movie_unavailable_for_criteria";
    else noResultsReason = "no_results_for_criteria";
  }

  return {
    cinemas: filteredCinemas,
    movies: filteredMovies,
    sessions: filteredSessions,
    preferences: criteria,
    time: timeMetadata,
    counts: {
      inputMovies: movieList.length,
      inputSessions: sessionList.length,
      metadataMatchedMovies: metadataMovies.length,
      sessionsBeforeTimeFilter: baseSessions.length,
      returnedMovies: filteredMovies.length,
      returnedSessions: filteredSessions.length,
    },
    noResultsReason,
  };
}
