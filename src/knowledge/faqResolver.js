import { VOX_FAQ_ENTRIES } from "./voxFaqData.js";
import { classifyBookingHistoryRequest, isDirectCancellationRequest } from "../lib/cancellationRouting.js";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "can", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "the", "to", "what", "when", "where", "which", "with", "you",
  "أو", "اين", "أين", "الى", "إلى", "انا", "أنا", "ان", "أن", "في", "عن", "على", "ما", "ماذا", "متى", "من", "هل", "هو", "هي", "كيف", "لي", "مع",
]);

export function normalizeFaqText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ڤ/g, "ف")
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRIVATE_EVENT_HINT = /\b(?:private|group|birthday|corporate|event|screening)\b|(?:عرض خاص|حجز مجموعة|حفلة عيد ميلاد|فعالية شركة|سينما كاملة)/;
const CANCELLATION_POLICY_HINT = /\b(?:can|could|how|when|where|policy|rules?|deadline|eligible|eligibility|possible)\b.{0,55}\b(?:cancel|refund|exchange)\b|\b(?:refund|cancellation)\s+(?:policy|rules?|deadline|eligibility)\b|(?:كيف|هل|سياسه|سياسة|شروط|متى|موعد|اقدر|أقدر|يمكن).{0,45}(?:الغاء|إلغاء|الغي|ألغي|استرداد|استرجاع)|(?:شروط|سياسه|سياسة|موعد).{0,30}(?:الاسترداد|الاسترجاع|الالغاء|الإلغاء)/;
const CANCELLATION_REQUEST_TO_ASSISTANT_HINT = /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:cancel|refund|void)\b.{0,40}\b(?:my|our|this|the)\s+(?:booking|reservation|tickets?)\b|(?:هل\s+)?(?:يمكنك|تقدر|تستطيع)\s+(?:ان\s+)?(?:تلغي|الغاء|ترجع|تسترد).{0,30}(?:حجزي|الحجز|تذكرتي|تذاكري|التذاكر)/;
const CANCELLATION_ACTION_HINT = /\b(?:please\s+)?(?:cancel|refund|void)\s+(?:(?:my|the|this)\s+)?(?:booking|reservation|tickets?)\b|\b(?:i|we)\s+(?:want|need|would like)\s+to\s+(?:cancel|refund|void)\b|\b(?:cancel|refund|void)\b.{0,40}\b(?:booking\s+(?:reference|ref)|wl[a-z0-9]+)\b|(?:الغي|ألغي|لغي|الغاء|إلغاء|رجع|استرد|استرجع).{0,35}(?:حجزي|الحجز|تذكرتي|تذاكري|التذاكر)|(?:ابي|أبي|ابغي|أبغي|ابغى|أبغى|عايز|بدي).{0,25}(?:الغي|ألغي|استرد|استرجع)/;
const BOOKING_HISTORY_ACTION_HINT = /\b(?:show|open|find|view)\s+(?:(?:me|my)\s+)?(?:booking|bookings|booking history|purchase history)\b|(?:اعرض|أعرض|افتح|أفتح|طلع|ورني).{0,30}(?:حجوزاتي|حجزي|سجل الحجوزات|سجل المشتريات)/;
const BOOKING_ACTION_HINT = /\b(?:book|reserve|buy|get)\b.{0,45}\b(?:tickets?|seats?|showtimes?|movie|film)\b|\b(?:i|we)\s+(?:want|need|would like)\s+(?:to\s+)?(?:book|reserve)\b|\b(?:show|find)\b.{0,28}\b(?:movies?|films?|showtimes?)\b|\b(?:one|two|three|four|\d+)\s+(?:tickets?|seats?)\b|(?:ابي|أبي|ابغي|أبغي|ابغى|أبغى|عايز|بدي|اريد|أريد).{0,30}(?:احجز|أحجز|حجز|تذكره|تذكرة|تذكرتين|مقعد)|(?:احجز|أحجز|احجزي|حجز لي).{0,30}(?:فيلم|تذكره|تذكرة|مقعد|عرض)/;

const PROGRAMMING_DISCOVERY_HINT = /\b(?:what(?:s| is)?|which\s+movies?|which\s+films?)\b.{0,32}\b(?:showing|playing|on)\b|\b(?:showing|playing)\b.{0,40}\b(?:today|tonight|tomorrow|cinema|movies?|films?)\b|(?:\u0645\u0627\u0630\u0627|\u0645\u0627|\u0648\u0634|\u0627\u064a\u0634).{0,28}(?:\u064a\u0639\u0631\u0636|\u0627\u0644\u0627\u0641\u0644\u0627\u0645|\u0627\u0644\u0639\u0631\u0648\u0636)/;

/**
 * FAQ retrieval must not swallow commands that should advance a live journey.
 * Policy questions remain eligible for curated answers; transactional commands
 * are returned to the agent/tool router instead.
 */
export function classifyFaqActionIntent(queryText) {
  const query = normalizeFaqText(queryText);
  if (!query || PRIVATE_EVENT_HINT.test(query)) return null;
  if (PROGRAMMING_DISCOVERY_HINT.test(query)) return "booking";
  if (isDirectCancellationRequest(queryText)) return "cancellation";
  if (CANCELLATION_REQUEST_TO_ASSISTANT_HINT.test(query)) return "cancellation";
  if (!CANCELLATION_POLICY_HINT.test(query) && CANCELLATION_ACTION_HINT.test(query)) return "cancellation";
  if (classifyBookingHistoryRequest(queryText).requested) return "booking_history";
  if (BOOKING_HISTORY_ACTION_HINT.test(query)) return "booking_history";
  if (BOOKING_ACTION_HINT.test(query)) return "booking";
  return null;
}

function tokens(value) {
  return normalizeFaqText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function localizedValues(value, locale) {
  const preferred = value?.[locale] || [];
  const fallback = value?.[locale === "ar" ? "en" : "ar"] || [];
  return [
    ...preferred.map((text) => ({ text, weight: 1 })),
    ...fallback.map((text) => ({ text, weight: 0.82 })),
  ];
}

function includesNormalizedPhrase(text, phrase) {
  if (!text || !phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function scorePhrase(query, queryTokens, phrase, weight) {
  const normalized = normalizeFaqText(phrase);
  if (!normalized) return 0;
  const phraseTokens = tokens(normalized);
  if (query === normalized) return 1000 * weight + phraseTokens.length;
  if (includesNormalizedPhrase(query, normalized)) return (240 + phraseTokens.length * 14) * weight;
  if (queryTokens.length > 1 && includesNormalizedPhrase(normalized, query)) return (150 + queryTokens.length * 10) * weight;

  const querySet = new Set(queryTokens);
  const overlap = phraseTokens.filter((token) => querySet.has(token)).length;
  if (!overlap) return 0;
  const coverage = overlap / Math.max(phraseTokens.length, 1);
  return (overlap * 18 + coverage * 50) * weight;
}

function scoreTag(query, queryTokens, tag, weight) {
  const normalized = normalizeFaqText(tag);
  if (!normalized) return 0;
  if (query === normalized) return 180 * weight;
  if (includesNormalizedPhrase(query, normalized)) return 70 * weight;
  const tagTokens = tokens(normalized);
  const querySet = new Set(queryTokens);
  const overlap = tagTokens.filter((token) => querySet.has(token)).length;
  return overlap * 28 * weight;
}

export function scoreFaqEntry(queryText, entry, { locale = "en" } = {}) {
  const activeLocale = locale === "ar" ? "ar" : "en";
  const query = normalizeFaqText(queryText);
  if (!query) return 0;
  const queryTokens = tokens(query);

  const phraseScore = localizedValues(entry.utterances, activeLocale)
    .reduce((best, item) => Math.max(best, scorePhrase(query, queryTokens, item.text, item.weight)), 0);
  const tagScore = localizedValues(entry.metadata.tags, activeLocale)
    .reduce((sum, item) => sum + scoreTag(query, queryTokens, item.text, item.weight), 0);
  return Math.round((phraseScore + tagScore) * 100) / 100;
}

function audienceMatches(entry, audience) {
  if (!audience || audience === "all") return true;
  return entry.metadata.audience.includes("all") || entry.metadata.audience.includes(audience);
}

function toResult(entry, score, locale) {
  const activeLocale = locale === "ar" ? "ar" : "en";
  return Object.freeze({
    id: entry.id,
    topic: entry.routingTopic || entry.topic,
    knowledgeTopic: entry.topic,
    intent: entry.intent || null,
    score,
    answer: entry.answer[activeLocale],
    locale: activeLocale,
    dataMode: entry.delivery.kind,
    needsLiveData: entry.delivery.kind === "api",
    delivery: entry.delivery,
    metadata: entry.metadata,
    entry,
  });
}

export function resolveFaqQuery(queryText, {
  locale = "en",
  audience = "all",
  limit = 3,
  minScore = 25,
  entries = VOX_FAQ_ENTRIES,
  includeActionIntents = false,
} = {}) {
  const activeLocale = locale === "ar" ? "ar" : "en";
  const safeLimit = Math.max(1, Math.min(Number(limit) || 1, 10));
  if (!includeActionIntents && classifyFaqActionIntent(queryText)) return [];
  return entries
    .filter((entry) => audienceMatches(entry, audience))
    .map((entry) => ({ entry, score: scoreFaqEntry(queryText, entry, { locale: activeLocale }) }))
    .filter((candidate) => candidate.score >= minScore)
    .sort((left, right) => (
      right.score - left.score ||
      (right.entry.priority || 0) - (left.entry.priority || 0) ||
      left.entry.id.localeCompare(right.entry.id)
    ))
    .slice(0, safeLimit)
    .map(({ entry, score }) => toResult(entry, score, activeLocale));
}

export function resolveFaqOne(queryText, options = {}) {
  return resolveFaqQuery(queryText, { ...options, limit: 1 })[0] || null;
}
