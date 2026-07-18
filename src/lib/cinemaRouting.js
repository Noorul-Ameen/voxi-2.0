const LOCATION_FILLER_WORDS = new Set([
  "a", "at", "book", "booking", "center", "centre", "cinema", "cinemas", "city", "film", "films", "for", "i", "in", "mall", "movie", "movies",
  "of", "please", "select", "show", "the", "ticket", "tickets", "to", "today", "tomorrow", "tonight", "vox", "want", "watch",
  "سينما", "فوكس", "في", "من", "اريد", "أريد", "اختار", "اختر",
]);

const BROAD_CITY_HINT = /\b(?:abu\s+dhabi|dubai|sharjah|ajman|fujairah)\b|(?:ابوظبي|أبوظبي|دبي|الشارقة|عجمان|الفجيرة)/i;
const EXPLICIT_VENUE_HINT = /\b(?:mall|center|centre|festival|mercato|burjuman|kempinski|megaplex|cineplex|hyatt|towers?|galleria|maryah|reem|wafi|yas|mirdif|deira|shindagha|jimi|hamra|zahia|nation|palm|jumeirah)\b|(?:مول|سنتر|فستيفال|ميركاتو|برجمان|كمبينسكي|ميجابلكس|حياة|تاورز|غاليريا|مارية|الريم|وافي|ياس|مردف|ديرة|الشندغة|الجيمي|الحمرا|الزاهية|نيشن|نخلة|جميرا)/i;

export const CINEMA_ALIASES = Object.freeze({
  "0036": ["abu dhabi mall", "أبوظبي مول", "ابوظبي مول"],
  "0009": ["al hamra mall", "الحمرا مول"],
  "0039": ["al jimi mall", "الجيمي مول", "الجيمي"],
  "0013": ["burjuman", "برجمان"],
  "0004": ["city centre ajman", "سيتي سنتر عجمان"],
  "0055": ["city centre al zahia", "سيتي سنتر الزاهية", "الزاهية"],
  // Observed voice transcription of "City Centre Deira".
  "0001": ["city centre deira", "city center deira", "deira city centre", "dcc", "citizen and data", "سيتي سنتر ديرة", "ديرة"],
  "0006": ["city centre fujairah", "سيتي سنتر الفجيرة", "الفجيرة"],
  "0005": ["city centre mirdif", "city center mirdif", "سيتي سنتر مردف", "مردف"],
  "0035": ["city centre sharjah", "سيتي سنتر الشارقة"],
  "0017": ["city centre shindagha", "سيتي سنتر الشندغة", "الشندغة"],
  "0105": ["dubai festival city", "festival city", "دبي فستيفال سيتي", "فستيفال سيتي"],
  "0045": ["kempinski", "kempinski hotel", "kempinski hotel at moe", "كمبينسكي"],
  "0015": ["megaplex", "cineplex grand hyatt", "ميجابلكس", "جراند حياة"],
  // Common speech-to-text variants are intentional. “Model Emirates” is a
  // frequent transcription of “Mall of the Emirates” in a voice turn.
  "0002": [
    "mall of the emirates", "mall of emirates", "mall emirates", "model emirates",
    "maul emirates", "mole emirates", "moe", "مول الإمارات", "مول الامارات",
  ],
  "0007": ["mercato", "ميركاتو"],
  "0014": ["nation towers", "نيشن تاورز"],
  "0049": ["palm jumeirah mall", "palm jumeirah", "نخلة جميرا", "بالم جميرا"],
  "0104": ["reem mall", "الريم مول", "ريم مول"],
  "0046": ["galleria al maryah", "the galleria al maryah island", "الغاليريا المارية", "جاليريا المارية"],
  "0057": ["wafi mall", "wafi city", "وافي مول", "وافي"],
  "0012": ["yas mall", "ياس مول"],
});

export function normalizeCinemaText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\bcenter\b/g, "centre")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stripVoxPrefix = (value) => normalizeCinemaText(value).replace(/^vox\s+/, "");

function meaningfulTokens(value) {
  return [...new Set(normalizeCinemaText(value)
    .split(" ")
    .filter((token) => token && !LOCATION_FILLER_WORDS.has(token)))];
}

function editDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function tokensMatch(left, right) {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 4) return false;
  return editDistance(left, right) <= (Math.max(left.length, right.length) >= 8 ? 2 : 1);
}

function scoreAlias(query, alias) {
  if (!query || !alias) return 0;
  if (query === alias) return 1000 + alias.length;
  if (` ${query} `.includes(` ${alias} `)) return 800 + alias.length;

  const queryTokens = meaningfulTokens(query);
  const aliasTokens = meaningfulTokens(alias);
  if (!queryTokens.length || !aliasTokens.length) return 0;
  const matchedAliasTokens = aliasTokens.filter((aliasToken) => queryTokens.some((queryToken) => tokensMatch(queryToken, aliasToken)));
  if (!matchedAliasTokens.length) return 0;
  const aliasCoverage = matchedAliasTokens.length / aliasTokens.length;
  const queryCoverage = matchedAliasTokens.length / queryTokens.length;
  if (aliasTokens.length === 1 && queryTokens.length > 1) return 0;
  if (aliasCoverage < 0.75 || (matchedAliasTokens.length === 1 && aliasTokens.length > 1)) return 0;
  return 300 + aliasCoverage * 100 + queryCoverage * 40 + matchedAliasTokens.length;
}

/**
 * Resolve a cinema from an ID, a picker label, a natural-language reply, or a
 * common voice transcription. Ambiguous low-information replies are rejected
 * instead of silently choosing the wrong UAE location.
 */
export function resolveCinemaCandidate(cinemas, input, aliases = CINEMA_ALIASES) {
  const list = Array.isArray(cinemas) ? cinemas : [];
  const query = normalizeCinemaText(input);
  if (!query) return null;
  // A city is not a cinema. Several UAE cities contain multiple VOX venues,
  // while a city with one current catalog entry may gain another later. Never
  // turn “book in Abu Dhabi” into Abu Dhabi Mall without a venue-level signal.
  if (BROAD_CITY_HINT.test(query) && !EXPLICIT_VENUE_HINT.test(query)) return null;
  if (query === "emirates") return null;

  const idMatch = list.find((cinema) => normalizeCinemaText(cinema.id) === query);
  if (idMatch) return idMatch;

  const ranked = list
    .map((cinema) => {
      const names = [cinema.name, stripVoxPrefix(cinema.name), ...(aliases?.[cinema.id] || [])]
        .map(normalizeCinemaText)
        .filter(Boolean);
      const score = names.reduce((best, alias) => Math.max(best, scoreAlias(query, alias)), 0);
      return { cinema, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || String(left.cinema.id).localeCompare(String(right.cinema.id)));

  if (!ranked.length) return null;
  if (ranked[1] && ranked[0].score < 800 && ranked[0].score - ranked[1].score < 15) return null;
  return ranked[0].cinema;
}

/** A bare cinema reply advances an existing cinema/movie selection step. */
export function isCinemaSelectionTurn({ view, intent, actionIntent, hasFaq = false, cinemaMatch } = {}) {
  if (!cinemaMatch) return false;
  // The cinema picker is an explicit question in the active booking journey.
  // A location name can also match broad FAQ keywords (for example, "cinema"
  // or "Mall of the Emirates"), but that must not prevent the spoken reply
  // from advancing the picker.
  if (view === "cinemas") return true;
  if (hasFaq) return false;
  return actionIntent === "booking"
    || intent === "booking"
    || ["empty", "cinemas", "movies", "showtimes"].includes(view);
}

const CINEMA_SELECTION_HINT = /\b(?:choose|select|pick|use|go\s+with)\b|(?:اختار|اختر|اختاري|أختار|استخدم|ابي|أبي).{0,36}(?:سينما|مول|فوكس)/i;
const CINEMA_INFORMATION_HINT = /\b(?:opening|closing|opens?|closes?|hours?|parking|wheelchair|accessible|accessibility|address|located|location|directions|tell\s+me\s+about)\b|\b(?:what|when|where|why|how)\b.{0,55}\b(?:cinema|mall|location)\b|(?:متى|اوقات|أوقات|ساعات|مواقف|عنوان|موقع|وين|أين|كيف).{0,40}(?:السينما|سينما|المول|مول)/i;

/**
 * Distinguish a cinema answer from an informational question that merely names
 * a cinema. This prevents broad location FAQ tags from swallowing replies to
 * the visible cinema picker while leaving hours, parking, and access questions
 * on the FAQ path.
 */
export function isDirectCinemaSelectionUtterance({ text, view, cinemaMatch } = {}) {
  if (!cinemaMatch) return false;
  const query = normalizeCinemaText(text);
  if (!query) return false;
  if (CINEMA_SELECTION_HINT.test(query)) return true;
  if (CINEMA_INFORMATION_HINT.test(query)) return false;
  return ["empty", "cinemas", "movies", "showtimes"].includes(view) && query.split(" ").length <= 12;
}
