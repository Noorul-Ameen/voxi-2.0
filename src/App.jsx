import React, { Suspense, lazy, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BadgePercent, History, MapPin, Mic, MicOff, RotateCcw, Send, Sparkles } from "lucide-react";
import { C } from "./theme.js";
import { BookingCard, CinemaPicker, MovieGrid, SeatMap, Showtimes } from "./components/RichMedia.jsx";
import BookingHistory from "./components/BookingHistory.jsx";
import Checkout from "./components/Checkout.jsx";
import HandoverPanel from "./components/HandoverPanel.jsx";
import OffersPanel from "./components/OffersPanel.jsx";
import { appendBooking, BOOKING_STORAGE_KEY, clearBookings, findBooking, readBookings } from "./bookingStore.js";
import { DEMO_CARD_STORAGE_KEY, DEVICE_SESSION_EPOCH_KEY } from "./checkoutSafety.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import { HANDOVER_TRIGGER, buildHandoverPayload, isClarificationFailureReason, isSupportedHandoverReason, registerClarificationFailureAttempt } from "./lib/handoverSummary.js";
import { resolveFilmCandidate } from "./lib/fuzzyResolvers.js";
import { isCinemaSelectionTurn, isDirectCinemaSelectionUtterance, resolveCinemaCandidate } from "./lib/cinemaRouting.js";
import { CANCELLATION_TARGET_SELECTION_PURPOSE, bookingHistoryAgentContext, classifyBookingHistoryRequest, isCurrentBooking, isDirectCancellationRequest, resolveCancellationContinuation, resolveCancellationTarget, sortBookingsForDisplay } from "./lib/cancellationRouting.js";
import { resolveCancellationDecision as cancellationDecision } from "./lib/cancellationConfirmation.js";
import { CANCELLATION_CONFIRMATION_TTL_MS, armCancellationConfirmationTimerState, clearCancellationConfirmationTimerState, consumeCancellationConfirmationTimeout, createCancellationConfirmationTimerState, resumeCancellationConfirmationTimerState, suspendCancellationConfirmationTimerState } from "./lib/cancellationConfirmationTimer.js";
import { cancellationFlowMatchesBooking, planPausedCancellationRestoration, synchronizedCancellationRenderState } from "./lib/cancellationRestoration.js";
import { resolveConversationalCancellation } from "./lib/conversationalCancellationResolver.js";
import { CANCELLATION_JOURNAL_TTL_MS, classifyRefundFailure, hydrateCancellationJournal, normalizeCancellationJournal, withCancellationMutationLock } from "./lib/cancellationSafety.js";
import { normalizeElevenLabsMessageEvent } from "./lib/conversationMessage.js";
import { guardAgentStateClaim } from "./lib/agentStateTruth.js";
import { isCheckoutSeatEditTurn } from "./lib/checkoutConversationRouting.js";
import { normalizeCustomerFacingFields, normalizeCustomerFacingText } from "./lib/customerFacingText.js";
import { explicitLanguageRequest, resolveLanguageSignal } from "./lib/languageSwitch.js";
import { buildTransportHandoff, createConversationJourney, inferIntent, journeyDynamicVariables, journeyReducer, syncJourney } from "./lib/conversationJourney.js";
import { resolveProgrammingDateSelection, resolveVisibleSelectionProgrammingDate } from "./lib/programmingDateSelection.js";
import {
  cancelPausedRichJourney,
  capturePausedRichStage,
  completePausedRichJourney,
  createPausedRichJourney,
  endPausedRichJourney,
  expirePausedRichJourney,
  hidePausedRichStage,
  invalidatePausedRichStage,
  replacePausedRichJourney,
  restorePausedRichStage,
  richJourneyViewFromStage,
  selectRestorableRichStage,
} from "./lib/pausedRichJourney.js";
import { isResumeCheckoutTurn, isResumeOnlyTurn, pausedResumeTarget } from "./lib/pausedJourneyRouting.js";
import { createDiscoveryPreferences, extractDiscoveryPreferencePatch, filterDiscoveryResults, getMissingDiscoveryCriteria, isOpenEndedDiscoveryRequest, mergeDiscoveryPreferences, parseAndMergeDiscoveryPreferences, resolveDiscoveryMovieCandidate, shouldTreatAsDiscoveryFilterTurn, unresolvedMovieTitleCandidate } from "./lib/discoveryPreferences.js";
import { buildAuthoritativeDiscoveryContext, buildMovieSelectionGroundingContext } from "./lib/discoveryResultContext.js";
import { normalizeSeatIds, resolveSeatSelectionTurn, resolveSeatToolInput } from "./lib/seatRouting.js";
import { filterBookableSessions } from "./lib/showtimeAvailability.js";
import { startTransportWithRetirement } from "./lib/transportStart.js";
import { ELEVENLABS_WORKLET_PATHS, VOICE_MIC_PERMISSION_TIMEOUT_MS, VOICE_TRANSPORT_START_TIMEOUT_MS, voiceStartupErrorKey } from "./lib/voiceStartup.js";
import {
  VOICE_CANCELLATION_DECISION_TTL_MS,
  advanceVoiceCancellationUserTurn,
  buildCancellationCompletionMessage,
  cancellationDecisionOutputOwner,
  cancellationCompletionOutputOwner,
  captureVoiceCancellationDecision,
  consumeVoiceCancellationDecision,
  createVoiceCancellationDecisionState,
  invalidateVoiceCancellationDecision,
  syncVoiceCancellationConfirmation,
} from "./lib/voiceCancellationDecision.js";
import { VOXI_AGENT_PROMPT, VOXI_FIRST_MESSAGES, buildVoxiContext } from "./lib/voxiSession.js";
import { OFFER_META } from "./offers/offersData.js";
import { answerForOfferTopic, buildOfferFacts } from "./offers/offerFacts.js";
import { buildOfferEvaluationContext, shouldInvalidateOfferResult } from "./offers/offerContext.js";
import { resolveOffer, resolveOfferForBankAndCard } from "./offers/offerResolver.js";
import { resolveLocalOfferTextTurn } from "./offers/offerTextFallback.js";
import { VOX_FAQ_ENTRIES, buildFaqContextForQuery, classifyFaqActionIntent, serializeFaqContext } from "./knowledge/index.js";
import * as vista from "./vistaClient.js";

const ElevenLabsTransport = lazy(() => import("./components/ElevenLabsTransport.jsx"));

const CINEMAS = vista.getCinemas();
const PROGRAMMING_DATES = vista.getProgrammingDates();
const SEAT_PRICING_PREVIEW = vista.getSeatPricingPreview();
const DISCOVERY_MOVIE_CATALOG = vista.getDiscoveryMovieCatalog();
const stripVox = (name) => String(name || "").replace(/^VOX\s*[\u2014-]\s*/, "");
const norm = (value) => String(value ?? "").toLowerCase().trim();
const hasMeaningfulTurnContent = (value) => /[\p{L}\p{N}]/u.test(String(value || ""));
const isExplicitJourneyCancellationTurn = (value) => /\b(?:cancel|stop|abandon|end)\s+(?:this|my|the|current)?\s*(?:booking\s+)?(?:journey|process|flow|checkout)\b|(?:ألغ|الغ|أوقف|انه|أنهِ)\s+(?:رحلة|عملية|مسار)\s+(?:الحجز|الدفع)/iu.test(String(value || ""));
const isExplicitConversationEndTurn = (value) => /^(?:end|close|stop)\s+(?:the\s+)?(?:chat|conversation|session)|^(?:goodbye|bye|that(?:'|’)s all|thank you,? bye)|^(?:انه|أنهِ|اغلق|أغلق)\s+(?:المحادثة|الجلسة)|^(?:مع السلامة|وداعا)[.!?،]*$/iu.test(String(value || "").trim());
const localizedValue = (value, locale) => typeof value === "string" ? value : value?.[locale] || value?.en || "";
const isAgentWelcome = (value) => {
  const text = String(value || "");
  return /\bvox concierge\b|i can show you what(?:'|’)s playing, book your seats/i.test(text)
    || /(?:(?:i(?:'|’)m|i am) voxi|أنا\s+voxi).*(?:how can i help|كيف.*أساعد)/i.test(text);
};
const localizedOfferReason = (result, locale) => {
  if (locale !== "ar") return result?.reason || "No matching offer found.";
  if (result?.status === "eligible") return "البطاقة مدرجة ضمن الفئات المؤهلة، مع تأكيد الأهلية النهائية عند الدفع.";
  if (result?.status === "card_required") {
    const labels = {
      bank: "اسم البنك",
      card: "اسم البطاقة الدقيق",
      membership: "حالة عضوية VOX",
      channel: "قناة الحجز",
      format: "صيغة العرض",
      experience: "تجربة السينما",
      ticketCount: "عدد التذاكر",
      orderTotal: "إجمالي الطلب",
      monthlyTicketsUsed: "عدد التذاكر المستخدمة ضمن العرض هذا الشهر",
      monthlySpend: "الإنفاق الشهري المطلوب",
      cinema: "السينما",
      seatType: "فئة المقعد",
      checkoutVerification: "التحقق عند إتمام الحجز لدى VOX",
    };
    const missing = [...new Set((result?.missingFields || []).map((field) => labels[field] || field))];
    return missing.length
      ? `نحتاج إلى: ${missing.join("، ")} لتقييم العرض، وتبقى الأهلية النهائية مؤكدة عند الدفع.`
      : "نحتاج إلى تفاصيل إضافية عن البطاقة أو صيغة العرض أو فئة المقعد لتأكيد الأهلية.";
  }
  return "لا تتحقق جميع شروط العرض في السياق المحدد؛ راجع الشروط أو أكد الأهلية عند الدفع.";
};

const CONVERSATION_IDLE_MS = 15 * 60 * 1000;
const MAX_TICKETS = 10;
const VISIBLE_TRANSCRIPT_MESSAGES = 8;
const RICH_STAGE_TRANSCRIPT_MESSAGES = 4;
const IDLE_CANCELLATION_STATE = Object.freeze({ phase: "idle", bookingRef: null, demoOnly: false, refundRoute: null, message: null, error: null, retryAllowed: true, dismissAllowed: true, outcomeUnknown: false, journalStartedAt: null });
const sameSeatSelection = (left = [], right = []) => {
  const a = [...new Set(left.map((seat) => String(seat).toUpperCase()))].sort();
  const b = [...new Set(right.map((seat) => String(seat).toUpperCase()))].sort();
  return a.length === b.length && a.every((seat, index) => seat === b[index]);
};
const normalizeCinemaAsrForAgent = (text, cinema) => {
  const value = String(text || "");
  if (String(cinema?.id || "") !== "0001") return value;
  return value
    .replace(/\bdcc\b/giu, cinema.name)
    .replace(/\bcitizen\s+(?:and\s+)?data\b/giu, cinema.name);
};
const CANCELLATION_JOURNAL_KEY = "voxi_pending_cancellation_v1";
const CANCELLATION_JOURNAL_EVENT = "voxi:cancellation-journal-changed";
const notifyCancellationJournalChanged = (state) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CANCELLATION_JOURNAL_EVENT, { detail: { state } }));
};
const newDeviceSessionEpoch = (prefix = "session") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const isUsableDeviceSessionEpoch = (value) => /^session-[a-z0-9]+-[a-z0-9]+$/i.test(String(value || ""));
const readDeviceSessionEpoch = () => {
  if (typeof window === "undefined") return null;
  try {
    return String(window.localStorage.getItem(DEVICE_SESSION_EPOCH_KEY) || "").trim() || null;
  } catch {
    return null;
  }
};
const initializeDeviceSessionEpoch = () => {
  const existing = readDeviceSessionEpoch();
  if (existing) return existing;
  const created = newDeviceSessionEpoch();
  try {
    window.localStorage.setItem(DEVICE_SESSION_EPOCH_KEY, created);
    return readDeviceSessionEpoch() === created ? created : null;
  } catch {
    return null;
  }
};
let inMemoryCancellationJournal = null;
let cancellationJournalPrivacyFailure = false;
const readCancellationJournal = () => {
  const memoryEntry = hydrateCancellationJournal(inMemoryCancellationJournal);
  if (memoryEntry && inMemoryCancellationJournal?.owned === true) {
    return { ...memoryEntry, privacySanitizationFailed: cancellationJournalPrivacyFailure };
  }
  inMemoryCancellationJournal = null;
  cancellationJournalPrivacyFailure = false;
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CANCELLATION_JOURNAL_KEY) || "null");
    const hydrated = hydrateCancellationJournal(stored);
    if (hydrated) {
      const sanitized = normalizeCancellationJournal(stored);
      inMemoryCancellationJournal = { ...sanitized, owned: false };
      let privacySanitizationFailed = false;
      if (stored?.bookingRef || stored?.state !== sanitized.state) {
        try {
          window.localStorage.setItem(CANCELLATION_JOURNAL_KEY, JSON.stringify(sanitized));
          const verified = JSON.parse(window.localStorage.getItem(CANCELLATION_JOURNAL_KEY) || "null");
          privacySanitizationFailed = Boolean(verified?.bookingRef)
            || verified?.token !== sanitized.token
            || Number(verified?.startedAt) !== sanitized.startedAt
            || verified?.state !== sanitized.state;
        } catch {
          privacySanitizationFailed = true;
        }
      }
      cancellationJournalPrivacyFailure = privacySanitizationFailed;
      return { ...hydrated, privacySanitizationFailed };
    }
    window.localStorage.removeItem(CANCELLATION_JOURNAL_KEY);
  } catch {
    const unreadableJournal = {
      token: "unreadable-cancellation-journal",
      startedAt: Date.now(),
      state: "reconciliation_required",
    };
    inMemoryCancellationJournal = unreadableJournal;
    cancellationJournalPrivacyFailure = true;
    return { ...hydrateCancellationJournal(unreadableJournal), privacySanitizationFailed: true };
  }
  return null;
};
const writeCancellationJournal = () => {
  const entry = {
    token: `cancel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    startedAt: Date.now(),
    state: "pending",
  };
  inMemoryCancellationJournal = { ...entry, owned: true };
  cancellationJournalPrivacyFailure = false;
  let persisted = false;
  try {
    window.localStorage.setItem(CANCELLATION_JOURNAL_KEY, JSON.stringify(entry));
    const saved = JSON.parse(window.localStorage.getItem(CANCELLATION_JOURNAL_KEY) || "null");
    persisted = saved?.token === entry.token
      && Number(saved?.startedAt) === entry.startedAt
      && saved?.state === "pending"
      && !saved?.bookingRef;
  } catch {
    // The caller refuses to send a provider mutation without a durable lock.
  }
  notifyCancellationJournalChanged("pending");
  return { ...entry, persisted };
};
const markCancellationJournalForReconciliation = (token) => {
  const current = normalizeCancellationJournal(inMemoryCancellationJournal);
  if (!current || current.token !== token) return false;
  const entry = { ...current, state: "reconciliation_required", owned: true };
  inMemoryCancellationJournal = entry;
  try {
    window.localStorage.setItem(CANCELLATION_JOURNAL_KEY, JSON.stringify(normalizeCancellationJournal(entry)));
    const saved = JSON.parse(window.localStorage.getItem(CANCELLATION_JOURNAL_KEY) || "null");
    const persisted = saved?.token === entry.token
      && Number(saved?.startedAt) === entry.startedAt
      && saved?.state === "reconciliation_required"
      && !saved?.bookingRef;
    notifyCancellationJournalChanged("reconciliation_required");
    return persisted;
  } catch {
    notifyCancellationJournalChanged("reconciliation_required");
    return false;
  }
};
const clearCancellationJournal = (token) => {
  if (inMemoryCancellationJournal?.token === token) {
    inMemoryCancellationJournal = null;
    cancellationJournalPrivacyFailure = false;
  }
  if (typeof window === "undefined") return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CANCELLATION_JOURNAL_KEY) || "null");
    if (!stored || stored.token === token) window.localStorage.removeItem(CANCELLATION_JOURNAL_KEY);
  } catch {
    // Fail closed: an unreadable safety journal must never authorize a retry.
  } finally {
    notifyCancellationJournalChanged("cleared");
  }
};

const pad2 = (value) => String(value).padStart(2, "0");
const isoDate = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
const addDays = (date, days) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
const validCalendarDate = (year, month, day) => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() + 1 === month
    && candidate.getUTCDate() === day
    ? candidate
    : null;
};
const uaeToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

function requestedProgrammingDate(text) {
  const raw = String(text || "").normalize("NFKC").toLowerCase();
  const direct = raw.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || null;
  if (direct) return direct;

  const today = new Date(`${uaeToday()}T00:00:00Z`);
  if (/\b(day after tomorrow)\b|بعد\s+(?:غد|بكرة)/i.test(raw)) {
    const target = isoDate(addDays(today, 2));
    return target;
  }
  if (/\btomorrow\b|غد(?:ا|اً)?|بكرة/i.test(raw)) {
    return isoDate(addDays(today, 1));
  }
  if (/\b(?:today|tonight)\b|اليوم|الليلة/i.test(raw)) return isoDate(today);

  const monthNames = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
    sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  for (const [name, month] of Object.entries(monthNames)) {
    const match = raw.match(new RegExp(`(?:\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}\\b|\\b${name}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b)`));
    if (!match) continue;
    const day = Number(match[1] || match[2]);
    const monthDay = `${pad2(month)}-${pad2(day)}`;
    const publishedDate = PROGRAMMING_DATES.find((date) => date.slice(5) === monthDay);
    if (publishedDate) return publishedDate;
    let year = today.getUTCFullYear();
    let candidate = validCalendarDate(year, month, day);
    if (!candidate) return null;
    if (candidate < today) candidate = validCalendarDate(year += 1, month, day);
    return candidate ? isoDate(candidate) : null;
  }

  const numeric = raw.match(/(?:^|\D)(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?:\D|$)/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]) || Number(PROGRAMMING_DATES[0]?.slice(0, 4)) || today.getUTCFullYear();
    return `${year < 100 ? 2000 + year : year}-${pad2(month)}-${pad2(day)}`;
  }

  const ordinalText = raw.replace(/[,!?;:.]+/g, " ").replace(/\s+/g, " ").trim();
  const ordinalDay = raw.match(/\bon(?:(?:[\s,.-]+)(?:the|um+|uh+))*[\s,.-]+(\d{1,2})(?:st|nd|rd|th)\b(?=\s*(?:$|[,.!?;:]|\b(?:at|around|in|for|please)\b))/)
    || ordinalText.match(/^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?:\s+please)?$/);
  if (ordinalDay) {
    const day = Number(ordinalDay[1]);
    for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
      const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, day));
      if (candidate.getUTCDate() !== day || candidate < today) continue;
      return isoDate(candidate);
    }
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = weekdays.findIndex((weekday) => raw.includes(weekday));
  if (weekdayIndex >= 0) {
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = addDays(today, offset);
      if (candidate.getUTCDay() === weekdayIndex) return isoDate(candidate);
    }
  }
  return null;
}

function resolveDatePromptReply(text, availableDates = [], stage = {}) {
  if (stage?.view !== "discovery" || stage?.missing?.[0] !== "date") return null;
  const normalized = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[,!?;:.\u060c\u061f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/^(?:(?:on|the|day|\u064a\u0648\u0645|\u0628\u062a\u0627\u0631\u064a\u062e)\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:please|\u0645\u0646 \u0641\u0636\u0644\u0643))?$/iu);
  if (!match) return null;
  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const matches = [...new Set(availableDates)]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date)))
    .filter((date) => Number(String(date).slice(-2)) === day);
  return matches.length === 1 ? matches[0] : null;
}

function isProgrammingDateOnlyReply(text, resolvedDate = requestedProgrammingDate(text)) {
  if (!resolvedDate) return false;
  const normalized = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[,!?;:.\u060c\u061f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const month = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const day = "\\d{1,2}(?:st|nd|rd|th)?";
  const weekday = "(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)";
  return new RegExp(`^(?:today|tonight|tomorrow|day after tomorrow|${weekday}|(?:on|next|this)\\s+${weekday}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|(?:on\\s+)?(?:the\\s+)?${day}|(?:on\\s+)?(?:the\\s+)?${day}\\s+${month}|${month}\\s+${day})(?:\\s+please)?$`, "i").test(normalized);
}

function guardMovieDisplayClaim(text, stage = {}, locale = "en") {
  const value = String(text || "");
  const claimsMovieDisplay = /\b(?:i(?:'|\u2019)ve|i have)\s+(?:displayed|shown)\b[\s\S]{0,120}\b(?:movies?|films?|options?|choices?)\b|\b(?:i(?:'|\u2019)m|i am)\s+showing\b[\s\S]{0,120}\b(?:movies?|films?|options?|choices?)\b|\b(?:movies?|films?|options?|choices?)\b[\s\S]{0,80}\b(?:displayed|shown|listed|on (?:(?:the|your) )?screen)\b|(?:\u0639\u0631\u0636\u062a|\u0623\u0639\u0631\u0636)[\s\S]{0,100}(?:\u0627\u0644\u0623\u0641\u0644\u0627\u0645|\u0627\u0644\u0627\u0641\u0644\u0627\u0645|\u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a)|(?:\u0627\u0644\u0623\u0641\u0644\u0627\u0645|\u0627\u0644\u0627\u0641\u0644\u0627\u0645|\u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a)[\s\S]{0,80}(?:\u0645\u0639\u0631\u0648\u0636\u0629|\u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629)/iu.test(value);
  const claimsNoMovies = /\b(?:there (?:are|is)|i (?:do not|don't|cannot|can't) see|i (?:could not|couldn't|cannot|can't) find|we (?:do not|don't|cannot|can't) have)\s+(?:not\s+)?(?:any\s+)?(?:matching\s+)?(?:movies?|films?|options?)\b|\bno\s+(?:matching\s+)?(?:movies?|films?|options?)\b|(?:\u0644\u0627 \u062a\u0648\u062c\u062f|\u0644\u0645 \u0623\u062c\u062f|\u0644\u0645 \u0627\u062c\u062f)[\s\S]{0,60}(?:\u0623\u0641\u0644\u0627\u0645|\u0627\u0641\u0644\u0627\u0645|\u062e\u064a\u0627\u0631\u0627\u062a)/iu.test(value);
  if (!claimsMovieDisplay && !claimsNoMovies) return value;

  const visibleMovies = stage?.view === "movies" && Array.isArray(stage.movies) ? stage.movies : [];
  if (visibleMovies.length) {
    if (claimsMovieDisplay) return value;
    return locale === "ar"
      ? `تم عرض ${visibleMovies.length} من خيارات الأفلام المطابقة. اختر الفيلم الذي تفضله.`
      : `${visibleMovies.length} matching movie option${visibleMovies.length === 1 ? " is" : "s are"} displayed. Choose the movie you prefer.`;
  }
  if (stage?.view === "cinemas") {
    return String(stage.notice || "").trim() || (locale === "ar"
      ? "اختر موقعاً واحداً من مواقع ڤوكس سينما الإمارات الظاهرة. لم يتم عرض أفلام بعد."
      : "Choose one displayed VOX Cinemas UAE location. No movies are displayed yet.");
  }
  if (!["discovery", "loading", "movies"].includes(stage?.view)) return value;

  if (stage.view === "loading") {
    return locale === "ar"
      ? "جارٍ تحميل الأفلام المطابقة. ستظهر هنا عندما تكتمل النتائج."
      : "I'm loading the matching movies now. They will appear here when ready.";
  }
  if (stage.view === "discovery") {
    const question = String(stage.question || "").trim();
    if (question) return question;
    return locale === "ar"
      ? "لم يتم عرض أفلام بعد. أخبرني بالمعلومة المطلوبة للمتابعة."
      : "No movies are displayed yet. Tell me the requested preference to continue.";
  }
  if (claimsNoMovies) return value;
  return String(stage.error || stage.notice || "").trim() || (locale === "ar"
    ? "لا توجد أفلام تطابق جميع تفضيلاتك في هذا الموقع والتاريخ."
    : "No movies match all of your preferences at this cinema and date.");
}

function programmingDatesForCinema(cinemaOrId) {
  const cinemaId = typeof cinemaOrId === "string" ? cinemaOrId : cinemaOrId?.id;
  return cinemaId ? vista.getProgrammingDates({ cinemaId }) : PROGRAMMING_DATES;
}

function extractTicketQuantity(text) {
  const raw = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  if (/(?:شخصين|تذكرتين|مقعدين)/.test(raw)) return 2;
  const wordNumbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const arabicWordNumbers = {
    واحد: 1, واحدة: 1,
    اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2, اتنين: 2,
    ثلاثة: 3, ثلاث: 3,
    أربعة: 4, اربعة: 4, أربع: 4, اربع: 4,
    خمسة: 5, خمس: 5,
    ستة: 6, ست: 6,
    سبعة: 7, سبع: 7,
    ثمانية: 8, ثمان: 8,
    تسعة: 9, تسع: 9,
    عشرة: 10, عشر: 10,
  };
  const englishMatch = raw.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s*(?:people|persons?|tickets?|seats?)\b/);
  const englishAdjustment = raw.match(/\b(?:make|change|set|update)\s+(?:the\s+)?(?:number\s+of\s+)?(?:tickets?|seats?)\s+(?:to\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/);
  const arabicMatch = raw.match(/(?:^|[\s،,:;-])(واحد(?:ة)?|اثنان|اثنين|اثنتان|اثنتين|اتنين|ثلاثة|ثلاث|أربعة|اربعة|أربع|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|عشر|\d{1,2})\s*(?:أشخاص|اشخاص|شخص|تذاكر|تذكرة|تذكره|مقاعد|مقعد)(?=$|[\s،,.!؟?])/);
  const arabicAdjustment = raw.match(/(?:اجعل|غير|غيّر|عدل|عدّل)\s+(?:عدد\s+)?(?:التذاكر|المقاعد)\s+(?:إلى|الى)?\s*(واحد(?:ة)?|اثنان|اثنين|اثنتان|اثنتين|اتنين|ثلاثة|ثلاث|أربعة|اربعة|أربع|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|عشر|\d{1,2})/);
  const match = englishMatch || englishAdjustment || arabicMatch || arabicAdjustment;
  if (!match) return null;
  const quantity = Number(match[1]) || wordNumbers[match[1]] || arabicWordNumbers[match[1]] || 0;
  return quantity >= 1 && quantity <= MAX_TICKETS ? quantity : null;
}

const cancellationBookingSummary = (booking, locale = "en") => {
  const movie = booking?.movieTitle || booking?.movie || (locale === "ar" ? "فيلم غير محدد" : "Unknown movie");
  const cinemaName = booking?.cinemaName || booking?.cinema || (locale === "ar" ? "سينما غير محددة" : "Unknown cinema");
  const performanceDate = booking?.performanceDate || booking?.sourceDate || booking?.date || (locale === "ar" ? "تاريخ غير محدد" : "Unknown date");
  const showtime = booking?.showtime || booking?.time || (locale === "ar" ? "وقت غير محدد" : "Unknown time");
  const reference = booking?.ref || (locale === "ar" ? "غير متوفر" : "Unavailable");
  return locale === "ar"
    ? `الفيلم: ${movie}. السينما: ${cinemaName}. التاريخ: ${performanceDate}. الوقت: ${showtime}. مرجع الحجز: ${reference}.`
    : `Movie: ${movie}. Cinema: ${cinemaName}. Date: ${performanceDate}. Showtime: ${showtime}. Booking reference: ${reference}.`;
};

const focusedCancellationChoice = (candidates = [], locale = "en") => {
  const details = candidates.map((candidate, index) => {
    const position = candidate.position || index + 1;
    const movie = candidate.movie || (locale === "ar" ? "فيلم غير محدد" : "Unknown movie");
    const date = candidate.date || (locale === "ar" ? "تاريخ غير محدد" : "Unknown date");
    const showtime = candidate.showtime || (locale === "ar" ? "وقت غير محدد" : "Unknown time");
    const cinemaName = candidate.cinema || (locale === "ar" ? "سينما غير محددة" : "Unknown cinema");
    const reference = candidate.bookingRef || (locale === "ar" ? "غير متوفر" : "Unavailable");
    return `${position}. ${movie}, ${date}, ${showtime}, ${cinemaName}, ${locale === "ar" ? "المرجع" : "reference"} ${reference}`;
  });
  return locale === "ar"
    ? `وجدت أكثر من حجز مطابق:\n${details.join("\n")}\nأي حجز تريد إلغاءه؟`
    : `I found more than one matching booking:\n${details.join("\n")}\nWhich one would you like to cancel?`;
};

function sanitizeUserText(text) {
  let sensitive = false;
  const safeText = String(text || "")
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, () => { sensitive = true; return "[payment number removed]"; })
    .replace(/\b(cvv|cvc|otp|password|pin)\s*[:=-]?\s*\S+/gi, (_match, label) => {
      sensitive = true;
      return `${label} [removed]`;
    });
  return { safeText, sensitive };
}

function newConversationId() {
  try { return crypto.randomUUID(); } catch { return `voxi-${Date.now().toString(36)}`; }
}

export default function App() {
  const { locale, dir, t, setLocale, formatCurrency } = useI18n();
  const [, setCinemaCatalogVersion] = useState(0);
  const [messages, setMessages] = useState([]);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState({ view: "empty" });
  const [stageVisible, setStageVisible] = useState(true);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [booking, setBooking] = useState(null);
  const [bookings, setBookings] = useState(() => isUsableDeviceSessionEpoch(readDeviceSessionEpoch()) ? readBookings() : []);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [pendingOrder, setPendingOrder] = useState(null);
  const [cinema, setCinema] = useState(null);
  const [sessionMode, setSessionMode] = useState(null);
  const [startingMode, setStartingMode] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(vista.demoDate);
  useEffect(() => {
    let active = true;
    vista.loadCinemas().then((cinemas) => {
      if (!active) return;
      CINEMAS.splice(0, CINEMAS.length, ...cinemas);
      setCinemaCatalogVersion((version) => version + 1);
    }).catch((error) => console.error("Cinema directory could not load", error));
    return () => { active = false; };
  }, []);
  const appConversationIdRef = useRef(newConversationId());
  const [journey, dispatchJourney] = useReducer(journeyReducer, appConversationIdRef.current, createConversationJourney);
  const [pausedJourney, setPausedJourney] = useState(() => createPausedRichJourney({
    sessionId: appConversationIdRef.current,
    journeyId: appConversationIdRef.current,
  }));
  // A spoken quantity is only a target that helps the guest choose seats.
  // The actual ticket count is always derived from selectedSeats.length.
  const [requestedSeatTarget, setRequestedSeatTarget] = useState(null);
  const [seatQuote, setSeatQuote] = useState(null);
  const [discoveryPreferences, setDiscoveryPreferences] = useState(() => createDiscoveryPreferences());
  const [transportGeneration, setTransportGeneration] = useState(0);
  const [transportEnabled, setTransportEnabled] = useState(false);
  const [transportStatus, setTransportStatus] = useState("disconnected");
  const [cancellationState, setCancellationState] = useState(IDLE_CANCELLATION_STATE);
  const deviceSessionEpochRef = useRef(undefined);
  if (deviceSessionEpochRef.current === undefined) deviceSessionEpochRef.current = initializeDeviceSessionEpoch();

  // Cancellation tools return promptly so the agent can speak each prompt.
  // The ref is the synchronous source for SDK callbacks; cancellationState is
  // its renderable mirror for the shared text, voice, and touch experience.
  const cancelTimerRef = useRef(null);
  const cancellationConfirmationTimerStateRef = useRef(createCancellationConfirmationTimerState());
  const cancellationJournalTimerRef = useRef(null);
  const cancellationFlowRef = useRef(null);
  const cancellationIntentAuthorizationRef = useRef(null);
  const pendingVoiceCancellationDecisionRef = useRef(createVoiceCancellationDecisionState());
  const pendingVoiceCancellationDecisionTimerRef = useRef(null);
  const cancellationInFlightRef = useRef(false);
  const cancellationLockPendingRef = useRef(false);
  const cancellationLockPromiseRef = useRef(null);
  const cancellationOperationRef = useRef(0);
  const mountedRef = useRef(true);
  const seatConfirmationInFlightRef = useRef(new Map());
  const uiSeatConfirmationKeyRef = useRef(null);

  // Voice-resolution caches and non-recursive return-navigation snapshots.
  const filmsRef = useRef([]);
  const filmsCinemaRef = useRef("");
  const filmsDateRef = useRef("");
  const filmRequestsRef = useRef(new Map());
  const sessionsRef = useRef([]);
  const sessionsFilmRef = useRef("");
  const discoverySessionsRef = useRef(new Map());
  const pendingDiscoveryTurnRef = useRef("");
  const planRef = useRef([]);
  const planContextRef = useRef(null);
  const cinemaReturnRef = useRef(null);
  const movieReturnPreferencesRef = useRef(null);
  const historyReturnRef = useRef(null);
  const historyContextRef = useRef(null);
  const bookingOpenedFromHistoryRef = useRef(false);
  const offersReturnRef = useRef(null);
  const checkoutStageRef = useRef(null);
  const checkoutPaymentActiveRef = useRef(false);
  const pausedJourneyRef = useRef(pausedJourney);
  const cancellationPausedRef = useRef(false);
  const renderTopicRef = useRef("general_enquiry");
  const restoredStageToolGuardRef = useRef(null);

  // Current-value refs make client-tool calls deterministic even when the SDK
  // invokes a handler between React renders.
  const stageRef = useRef(stage);
  const stageVisibleRef = useRef(stageVisible);
  const stageRevisionRef = useRef(0);
  const cinemaRef = useRef(cinema);
  const bookingRef = useRef(booking);
  const pendingOrderRef = useRef(pendingOrder);
  const seatsRef = useRef(selectedSeats);
  const messagesRef = useRef(messages);
  const localeRef = useRef(locale);
  const scheduleDateRef = useRef(scheduleDate);
  const userRequestedDateRef = useRef(null);
  const requestedSeatTargetRef = useRef(requestedSeatTarget);
  const discoveryPreferencesRef = useRef(discoveryPreferences);
  const seatQuoteRequestRef = useRef(0);
  const lastOfferRef = useRef(null);
  const clarificationFailuresRef = useRef(0);
  const clarificationFailureLogRef = useRef([]);
  const conversationIdRef = appConversationIdRef;
  const bookingJourneyIdRef = useRef(appConversationIdRef.current);
  const transportConversationIdRef = useRef(null);
  const journeyRef = useRef(journey);
  const lastActivityRef = useRef(Date.now());
  const sessionModeRef = useRef(null);
  const requestedSessionModeRef = useRef(null);
  const sessionStartRef = useRef(null);
  const sessionEpochRef = useRef(0);
  const requestedSessionEpochRef = useRef(null);
  const transportGenerationRef = useRef(0);
  const transportRef = useRef(null);
  const switchingSessionRef = useRef(false);
  const lastSentTextRef = useRef(null);
  const pendingTypedMessagesRef = useRef([]);
  const hasStartedConversationRef = useRef(false);
  const hasDisplayedWelcomeRef = useRef(false);
  const continuationSessionRef = useRef(false);
  const pendingLanguageSwitchRef = useRef(null);
  const disconnectReasonRef = useRef("ended");
  const suppressDisconnectNoticeRef = useRef(false);
  const requestEpochRef = useRef(0);

  const setCancellationFlow = useCallback((nextFlow) => {
    const resolved = typeof nextFlow === "function" ? nextFlow(cancellationFlowRef.current) : nextFlow;
    const customerSafe = normalizeCustomerFacingFields(resolved, ["refundRoute", "message", "error"]);
    const currentDecisionState = pendingVoiceCancellationDecisionRef.current;
    const nextDecisionState = syncVoiceCancellationConfirmation(currentDecisionState, customerSafe || {});
    if (currentDecisionState.pending && !nextDecisionState.pending) {
      window.clearTimeout(pendingVoiceCancellationDecisionTimerRef.current);
      pendingVoiceCancellationDecisionTimerRef.current = null;
    }
    pendingVoiceCancellationDecisionRef.current = nextDecisionState;
    if (!customerSafe || !["route_confirmation", "final_confirmation"].includes(customerSafe.phase)) {
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
      cancellationConfirmationTimerStateRef.current = clearCancellationConfirmationTimerState(
        cancellationConfirmationTimerStateRef.current,
        customerSafe ? "confirmation_phase_ended" : "cancellation_flow_cleared",
      );
    }
    if (!customerSafe) cancellationPausedRef.current = false;
    cancellationFlowRef.current = customerSafe || null;
    setCancellationState(customerSafe ? {
      phase: customerSafe.phase || "idle",
      bookingRef: customerSafe.bookingRef || null,
      demoOnly: Boolean(customerSafe.demoOnly),
      refundRoute: customerSafe.refundRoute || null,
      message: customerSafe.message || null,
      error: customerSafe.error || null,
      retryAllowed: customerSafe.retryAllowed !== false,
      dismissAllowed: customerSafe.dismissAllowed !== false,
      outcomeUnknown: Boolean(customerSafe.outcomeUnknown),
      journalStartedAt: Number.isFinite(Number(customerSafe.journalStartedAt)) ? Number(customerSafe.journalStartedAt) : null,
    } : IDLE_CANCELLATION_STATE);
    return customerSafe || null;
  }, []);

  const clearPendingVoiceCancellationDecision = () => {
    window.clearTimeout(pendingVoiceCancellationDecisionTimerRef.current);
    pendingVoiceCancellationDecisionTimerRef.current = null;
    pendingVoiceCancellationDecisionRef.current = invalidateVoiceCancellationDecision(pendingVoiceCancellationDecisionRef.current);
  };

  const scheduleCancellationConfirmationTimer = (nextState) => {
    window.clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = null;
    cancellationConfirmationTimerStateRef.current = nextState;
    if (nextState.status !== "armed") return nextState;
    const generation = nextState.generation;
    const delay = Math.max(0, Number(nextState.expiresAt) - Date.now());
    cancelTimerRef.current = window.setTimeout(() => {
      const timeout = consumeCancellationConfirmationTimeout(
        cancellationConfirmationTimerStateRef.current,
        { generation, now: Date.now() },
      );
      cancellationConfirmationTimerStateRef.current = timeout.state;
      cancelTimerRef.current = null;
      if (timeout.fire) dismissPendingCancellation("confirmation_timeout");
    }, delay);
    return nextState;
  };

  const clearCancellationConfirmationTimer = (reason = "cleared") => scheduleCancellationConfirmationTimer(
    clearCancellationConfirmationTimerState(cancellationConfirmationTimerStateRef.current, reason),
  );

  const armCancellationConfirmationTimer = (flow = cancellationFlowRef.current) => {
    let next = armCancellationConfirmationTimerState(cancellationConfirmationTimerStateRef.current, {
      bookingRef: flow?.bookingRef,
      phase: flow?.phase,
      now: Date.now(),
    });
    if (cancellationPausedRef.current && next.status === "armed") {
      next = suspendCancellationConfirmationTimerState(next, {
        bookingRef: flow?.bookingRef,
        phase: flow?.phase,
      });
    }
    return scheduleCancellationConfirmationTimer(next);
  };

  const suspendCancellationConfirmationTimer = (flow = cancellationFlowRef.current) => scheduleCancellationConfirmationTimer(
    suspendCancellationConfirmationTimerState(cancellationConfirmationTimerStateRef.current, {
      bookingRef: flow?.bookingRef,
      phase: flow?.phase,
    }),
  );

  const resumeCancellationConfirmationTimer = (flow = cancellationFlowRef.current) => scheduleCancellationConfirmationTimer(
    resumeCancellationConfirmationTimerState(cancellationConfirmationTimerStateRef.current, {
      bookingRef: flow?.bookingRef,
      phase: flow?.phase,
      now: Date.now(),
    }),
  );

  const beginMeaningfulCancellationUserTurn = () => {
    clearPendingVoiceCancellationDecision();
    pendingVoiceCancellationDecisionRef.current = advanceVoiceCancellationUserTurn(pendingVoiceCancellationDecisionRef.current);
    return pendingVoiceCancellationDecisionRef.current.userTurn;
  };

  const capturePendingVoiceCancellationDecision = (decision) => {
    const flow = cancellationFlowRef.current;
    const result = captureVoiceCancellationDecision(pendingVoiceCancellationDecisionRef.current, {
      decision,
      bookingRef: flow?.bookingRef,
      phase: flow?.phase,
      retryAllowed: flow?.retryAllowed,
      dismissAllowed: flow?.dismissAllowed,
      outcomeUnknown: flow?.outcomeUnknown,
      now: Date.now(),
    });
    clearPendingVoiceCancellationDecision();
    pendingVoiceCancellationDecisionRef.current = result.state;
    const pending = result.pending;
    if (!pending) return null;
    pendingVoiceCancellationDecisionTimerRef.current = window.setTimeout(() => {
      if (pendingVoiceCancellationDecisionRef.current.pending?.decisionNonce === pending.decisionNonce) clearPendingVoiceCancellationDecision();
    }, VOICE_CANCELLATION_DECISION_TTL_MS);
    return pending;
  };

  const consumePendingVoiceCancellationDecision = ({ requestedRef, flow }) => {
    const result = consumeVoiceCancellationDecision(pendingVoiceCancellationDecisionRef.current, {
      requestedRef,
      flowBookingRef: flow?.bookingRef,
      flowPhase: flow?.phase,
      flowRetryAllowed: flow?.retryAllowed,
      flowDismissAllowed: flow?.dismissAllowed,
      flowOutcomeUnknown: flow?.outcomeUnknown,
      paused: cancellationPausedRef.current,
      now: Date.now(),
    });
    pendingVoiceCancellationDecisionRef.current = result.state;
    if (!result.state.pending) {
      window.clearTimeout(pendingVoiceCancellationDecisionTimerRef.current);
      pendingVoiceCancellationDecisionTimerRef.current = null;
    }
    return result;
  };

  const deviceSessionIsCurrent = () => {
    const storedEpoch = readDeviceSessionEpoch();
    return Boolean(isUsableDeviceSessionEpoch(deviceSessionEpochRef.current) && storedEpoch === deviceSessionEpochRef.current);
  };

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { stageVisibleRef.current = stageVisible; }, [stageVisible]);
  useEffect(() => { cinemaRef.current = cinema; }, [cinema]);
  useEffect(() => { bookingRef.current = booking; }, [booking]);
  useEffect(() => { pendingOrderRef.current = pendingOrder; }, [pendingOrder]);
  useEffect(() => { seatsRef.current = selectedSeats; }, [selectedSeats]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { localeRef.current = locale; }, [locale]);
  useEffect(() => { scheduleDateRef.current = scheduleDate; }, [scheduleDate]);
  useEffect(() => { requestedSeatTargetRef.current = requestedSeatTarget; }, [requestedSeatTarget]);
  useEffect(() => { discoveryPreferencesRef.current = discoveryPreferences; }, [discoveryPreferences]);
  useEffect(() => { journeyRef.current = journey; }, [journey]);
  useEffect(() => { pausedJourneyRef.current = pausedJourney; }, [pausedJourney]);

  useEffect(() => {
    const next = syncJourney(journeyRef.current, {
      locale,
      cinema,
      scheduleDate,
      stage,
      selectedSeats,
      ticketQuantity: selectedSeats.length || pendingOrder?.seats?.length || booking?.seats?.length || null,
      pendingOrder,
      booking,
      transportConversationId: transportConversationIdRef.current,
    });
    journeyRef.current = next;
    dispatchJourney({ type: "sync", payload: {
      locale,
      cinema,
      scheduleDate,
      stage,
      selectedSeats,
      ticketQuantity: selectedSeats.length || pendingOrder?.seats?.length || booking?.seats?.length || null,
      pendingOrder,
      booking,
      transportConversationId: transportConversationIdRef.current,
    } });
  }, [booking, cinema, locale, pendingOrder, scheduleDate, selectedSeats, stage]);

  const say = useCallback((role, text) => {
    const at = new Date().toISOString();
    const customerSafeText = role === "user" ? text : normalizeCustomerFacingText(text);
    const message = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, role, text: customerSafeText, at };
    lastActivityRef.current = Date.now();
    setMessages((current) => {
      const next = [...current, message];
      messagesRef.current = next;
      return next;
    });
    return message;
  }, []);

  const updateIntentFromText = useCallback((text) => {
    const intent = inferIntent({ view: stageRef.current?.view, text, previousIntent: journeyRef.current.intent });
    if (!intent || intent === journeyRef.current.intent) return intent;
    journeyRef.current = { ...journeyRef.current, intent, lastActivityAt: new Date().toISOString() };
    dispatchJourney({ type: "intent", intent });
    return intent;
  }, []);

  const resolveCinema = (idOrName) => resolveCinemaCandidate(CINEMAS, idOrName);

  const ensureFilms = useCallback(async (cinemaId = cinemaRef.current?.id, requestedDate = scheduleDateRef.current) => {
    if (!cinemaId) return [];
    if (filmsRef.current.length && filmsCinemaRef.current === cinemaId && filmsDateRef.current === requestedDate) return filmsRef.current;
    const requestKey = `${cinemaId}:${requestedDate}`;
    let request = filmRequestsRef.current.get(requestKey);
    if (!request) {
      request = vista.getScheduledFilms(cinemaId, requestedDate);
      filmRequestsRef.current.set(requestKey, request);
    }
    try {
      const movies = await request;
      if (cinemaRef.current?.id === cinemaId && scheduleDateRef.current === requestedDate) {
        filmsRef.current = movies;
        filmsCinemaRef.current = cinemaId;
        filmsDateRef.current = requestedDate;
        sessionsRef.current = [];
        sessionsFilmRef.current = "";
      }
      return movies;
    } finally {
      if (filmRequestsRef.current.get(requestKey) === request) filmRequestsRef.current.delete(requestKey);
    }
  }, []);

  const resolveFilm = (idOrTitle) => resolveFilmCandidate(filmsRef.current, idOrTitle);

  const resolveSession = (sessions, sessionId, showtime) => {
    if (!sessions.length || (!sessionId && !showtime)) return { session: null, reason: "not_found", matches: [] };
    const byId = sessionId
      ? sessions.find((item) => [item.sessionId, ...(item.sessionIds || [])].some((id) => String(id) === String(sessionId)))
      : null;
    if (byId) return { session: byId, reason: null, matches: [byId] };
    const timeMatches = showtime
      ? sessions.filter((item) => norm(item.time) === norm(showtime) || norm(showtime).includes(norm(item.time)))
      : [];
    if (timeMatches.length === 1) return { session: timeMatches[0], reason: null, matches: timeMatches };
    return { session: null, reason: timeMatches.length > 1 ? "ambiguous" : "not_found", matches: timeMatches };
  };

  const resetClarificationFailures = () => {
    clarificationFailuresRef.current = 0;
    clarificationFailureLogRef.current = [];
  };

  const dismissPendingCancellation = (reason = "dismissed", { force = false } = {}) => {
    const journal = readCancellationJournal();
    const providerMutationActive = cancellationLockPendingRef.current
      || cancellationInFlightRef.current
      || cancellationFlowRef.current?.phase === "processing"
      || Boolean(journal);
    if (providerMutationActive && !force) return false;
    clearPendingVoiceCancellationDecision();
    cancellationOperationRef.current += 1;
    cancellationLockPendingRef.current = false;
    cancellationLockPromiseRef.current = null;
    cancellationInFlightRef.current = false;
    clearCancellationConfirmationTimer(reason);
    cancellationPausedRef.current = false;
    if (reason !== "confirmation_timeout") {
      const withoutCancellation = invalidatePausedRichStage(pausedJourneyRef.current, {
        views: ["cancellation"],
        reason,
      });
      if (withoutCancellation !== pausedJourneyRef.current) {
        pausedJourneyRef.current = withoutCancellation;
        setPausedJourney(withoutCancellation);
      }
    }
    setCancellationFlow(null);
    return true;
  };

  const clearPendingOrder = () => {
    if (checkoutPaymentActiveRef.current) return false;
    pendingOrderRef.current = null;
    checkoutStageRef.current = null;
    setPendingOrder(null);
    const withoutCheckout = invalidatePausedRichStage(pausedJourneyRef.current, {
      views: ["checkout"],
      reason: "pending_checkout_cleared",
    });
    if (withoutCheckout !== pausedJourneyRef.current) {
      pausedJourneyRef.current = withoutCheckout;
      setPausedJourney(withoutCheckout);
    }
    return true;
  };

  const clearSeatSelection = ({ clearPlan = true, clearTarget = false } = {}) => {
    requestEpochRef.current += 1;
    seatQuoteRequestRef.current += 1;
    seatConfirmationInFlightRef.current.clear();
    uiSeatConfirmationKeyRef.current = null;
    clearPendingOrder();
    seatsRef.current = [];
    setSelectedSeats([]);
    setSeatQuote(null);
    if (clearPlan) {
      planRef.current = [];
      planContextRef.current = null;
      const withoutSeats = invalidatePausedRichStage(pausedJourneyRef.current, {
        views: ["seatmap", "checkout"],
        reason: "seat_context_cleared",
      });
      if (withoutSeats !== pausedJourneyRef.current) {
        pausedJourneyRef.current = withoutSeats;
        setPausedJourney(withoutSeats);
      }
    }
    if (clearTarget) {
      requestedSeatTargetRef.current = null;
      setRequestedSeatTarget(null);
    }
  };

  const refreshSeatQuote = async (seatIds) => {
    const current = stageRef.current;
    const planContext = planContextRef.current;
    const normalizedSeats = [...new Set((seatIds || []).map((seat) => String(seat).toUpperCase()))].sort();
    const seatKey = normalizedSeats.join(",");
    const requestId = ++seatQuoteRequestRef.current;
    if (!normalizedSeats.length || current.view !== "seatmap" || !planContext) {
      setSeatQuote(null);
      return null;
    }
    const selectedSeatDetails = (planRef.current || [])
      .flatMap((row) => row.seats || [])
      .filter((seat) => normalizedSeats.includes(String(seat.id).toUpperCase()));
    setSeatQuote({ seatKey, loading: true, quote: null, error: null });
    try {
      const quote = await vista.getPricingQuote(planContext.cinemaId, planContext.sessionId, selectedSeatDetails);
      const quoteViewIsCurrent = stageRef.current.view === "seatmap";
      const stillCurrent = requestId === seatQuoteRequestRef.current
        && quoteViewIsCurrent
        && planContextRef.current === planContext
        && sameSeatSelection(seatsRef.current, normalizedSeats);
      if (!stillCurrent) return null;
      setSeatQuote({ seatKey, loading: false, quote, error: null });
      return quote;
    } catch (error) {
      if (requestId !== seatQuoteRequestRef.current || !sameSeatSelection(seatsRef.current, normalizedSeats)) return null;
      setSeatQuote({ seatKey, loading: false, quote: null, error: normalizeCustomerFacingText(error?.message || "Pricing is unavailable.") });
      return null;
    }
  };

  const commitPausedJourney = useCallback((nextModel) => {
    pausedJourneyRef.current = nextModel;
    setPausedJourney(nextModel);
    return nextModel;
  }, []);

  const pausedSnapshotStage = (nextStage) => {
    if (!nextStage || typeof nextStage !== "object") return nextStage;
    const cancellationFlow = cancellationFlowRef.current;
    const cancellationBookingMatches = !cancellationPausedRef.current
      && nextStage.view === "booking"
      && Boolean(cancellationFlow?.bookingRef)
      && norm(nextStage.booking?.ref || bookingRef.current?.ref) === norm(cancellationFlow.bookingRef)
      && ["checking", "route_confirmation", "final_confirmation", "processing", "error"].includes(cancellationFlow.phase);
    const stageWithPurpose = cancellationBookingMatches
      ? { ...nextStage, purpose: CANCELLATION_TARGET_SELECTION_PURPOSE }
      : nextStage;
    return {
      ...stageWithPurpose,
      pausedContext: {
        cinema: cinemaRef.current,
        booking: bookingRef.current,
        scheduleDate: scheduleDateRef.current,
        selectedSeats: [...seatsRef.current],
        requestedSeatTarget: requestedSeatTargetRef.current,
        discoveryPreferences: discoveryPreferencesRef.current,
        plan: planRef.current,
        planContext: planContextRef.current,
        pendingOrder: pendingOrderRef.current,
        historyFilter,
        cancellationFlow: cancellationFlowRef.current ? { ...cancellationFlowRef.current } : null,
      },
    };
  };

  const showStage = useCallback((nextStage) => {
    const next = normalizeCustomerFacingFields(nextStage || { view: "empty" }, ["label", "notice", "error", "question", "reason"]);
    if (checkoutPaymentActiveRef.current && stageRef.current?.view === "checkout" && next.view !== "checkout") return false;
    if (next.view !== "offers" && lastOfferRef.current) lastOfferRef.current = null;
    const richView = richJourneyViewFromStage(next);
    if (richView) {
      renderTopicRef.current = ["history", "booking", "cancellation"].includes(richView) ? "booking_records" : "booking";
      const captured = capturePausedRichStage(pausedJourneyRef.current, pausedSnapshotStage(next), {
        sessionId: appConversationIdRef.current,
        journeyId: bookingJourneyIdRef.current,
        contextVersion: stageRevisionRef.current + 1,
      });
      commitPausedJourney(captured);
    } else if (next.view === "offers") {
      renderTopicRef.current = "offers";
    }
    stageRevisionRef.current += 1;
    stageRef.current = next;
    stageVisibleRef.current = true;
    lastActivityRef.current = Date.now();
    setStage(next);
    setStageVisible(true);
    return true;
  }, [commitPausedJourney, historyFilter]);

  const pauseRichRenderingForTopicChange = useCallback((reason = "topic_change", topic = "general_enquiry") => {
    if (checkoutPaymentActiveRef.current) return { hidden: false, reason: "payment_in_progress", pausedView: null };
    clearPendingVoiceCancellationDecision();
    const current = stageRef.current;
    const richView = richJourneyViewFromStage(current);
    let pausedView = null;
    if (richView) {
      let model = capturePausedRichStage(pausedJourneyRef.current, pausedSnapshotStage(current), {
        sessionId: appConversationIdRef.current,
        journeyId: bookingJourneyIdRef.current,
        contextVersion: stageRevisionRef.current,
      });
      model = hidePausedRichStage(model, { reason });
      commitPausedJourney(model);
      pausedView = model.resumeView || richView;
    }
    if (cancellationFlowRef.current?.bookingRef) {
      cancellationPausedRef.current = true;
      if (["route_confirmation", "final_confirmation"].includes(cancellationFlowRef.current.phase)) {
        suspendCancellationConfirmationTimer(cancellationFlowRef.current);
      }
    }
    renderTopicRef.current = topic;
    stageVisibleRef.current = false;
    setStageVisible(false);
    return { hidden: current.view !== "empty", reason, pausedView };
  }, [commitPausedJourney, historyFilter]);

  const clearPausedJourneyForLifecycle = useCallback((event, reason) => {
    const current = pausedJourneyRef.current;
    const next = event === "completed"
      ? completePausedRichJourney(current, { reason })
      : event === "cancelled"
        ? cancelPausedRichJourney(current, { reason })
        : event === "expired"
          ? expirePausedRichJourney(current, { reason })
          : endPausedRichJourney(current, { reason });
    cancellationPausedRef.current = false;
    restoredStageToolGuardRef.current = null;
    return commitPausedJourney(next);
  }, [commitPausedJourney]);

  const replacePausedJourneyForNewBooking = useCallback((reason = "new_booking_started") => {
    const nextJourneyId = newConversationId();
    bookingJourneyIdRef.current = nextJourneyId;
    const next = replacePausedRichJourney(pausedJourneyRef.current, {
      sessionId: appConversationIdRef.current,
      journeyId: nextJourneyId,
      reason,
    });
    cancellationPausedRef.current = false;
    restoredStageToolGuardRef.current = null;
    renderTopicRef.current = "booking";
    return commitPausedJourney(next);
  }, [commitPausedJourney]);

  const handleCheckoutPaymentState = useCallback((active) => {
    checkoutPaymentActiveRef.current = Boolean(active);
  }, []);

  const activeCheckoutStage = () => {
    const order = pendingOrderRef.current;
    if (!order?.checkoutId) return null;
    const snapshot = checkoutStageRef.current;
    if (!snapshot || snapshot.order?.checkoutId !== order.checkoutId) return null;
    return {
      ...snapshot,
      view: "checkout",
      order,
      plan: snapshot.plan?.length ? snapshot.plan : planRef.current,
      planMeta: snapshot.planMeta || vista.getResultMeta(snapshot.plan?.length ? snapshot.plan : planRef.current),
    };
  };

  const evaluateCheckoutOfferTurn = (turn) => {
    const checkout = activeCheckoutStage();
    if (!checkout || !turn?.bankName) return null;
    const context = buildOfferEvaluationContext({
      view: "checkout",
      originView: "checkout",
      checkout: checkout.order,
      eligibility: { channel: "web" },
    });
    const result = turn.cardName
      ? resolveOfferForBankAndCard(turn.bankName, turn.cardName, context)
      : resolveOffer(turn.bankName, context);
    const toolLocale = localeRef.current;
    const topicAnswer = answerForOfferTopic(result?.offer, result?.cardProfile, toolLocale, turn.detailTopic || "summary");
    const reason = turn.cardName ? localizedOfferReason(result, toolLocale) : "";
    const advisory = toolLocale === "ar" && result?.advisory
      ? "قد تُطلب عضوية ڤوكس مسجلة، ويتم التأكيد النهائي للأهلية عند الدفع."
      : result?.advisory || "";
    return {
      answer: [topicAnswer, reason, advisory].filter(Boolean).join(" "),
      result,
      context,
      checkout,
    };
  };

  const restoreActiveCheckout = () => {
    const checkout = activeCheckoutStage();
    if (!checkout) return false;
    const snapshot = checkoutStageRef.current;
    const checkoutCinema = snapshot.cinema
      || resolveCinema(checkout.order.cinemaId)
      || resolveCinema(checkout.order.cinemaName)
      || { id: checkout.order.cinemaId, name: checkout.order.cinemaName };
    cinemaRef.current = checkoutCinema;
    setCinema(checkoutCinema);
    const checkoutDate = snapshot.scheduleDate || checkout.order.programmingDate || checkout.order.sourceDate || checkout.order.date;
    if (checkoutDate) {
      scheduleDateRef.current = checkoutDate;
      setScheduleDate(checkoutDate);
    }
    const restoredSeats = [...(snapshot.selectedSeats || checkout.order.seats || [])];
    seatsRef.current = restoredSeats;
    setSelectedSeats(restoredSeats);
    planRef.current = snapshot.plan?.length ? snapshot.plan : planRef.current;
    planContextRef.current = snapshot.planContext || planContextRef.current;
    if (snapshot.seatQuote) setSeatQuote(snapshot.seatQuote);
    dismissPendingCancellation("checkout_resumed");
    return showStage(checkout);
  };

  const preserveActiveCheckoutForTool = (toolName) => {
    const checkout = activeCheckoutStage();
    if (!checkout) return null;
    if (!stageVisibleRef.current) {
      return JSON.stringify({
        shown: false,
        checkoutPreserved: true,
        checkoutId: checkout.order.checkoutId,
        blockedTool: toolName,
        reason: "paused_topic",
        instruction: "The unpaid checkout is safely paused and hidden while the guest discusses another topic. Do not reopen or replace it unless the guest explicitly asks to continue the booking, return to checkout, or edit seats.",
      });
    }
    restoreActiveCheckout();
    return JSON.stringify({
      shown: "checkout",
      alreadyShown: true,
      checkoutId: checkout.order.checkoutId,
      seats: checkout.order.seats,
      total: checkout.order.total,
      currency: checkout.order.currency,
      blockedTool: toolName,
      instruction: "An unpaid checkout is active. Do not restart movie, showtime, or seat selection unless the guest explicitly starts a replacement booking. The guest can use Edit seats or ask to return to checkout.",
    });
  };

  const preservePausedTopicForTool = (toolName) => {
    const restoredGuard = restoredStageToolGuardRef.current;
    if (restoredGuard?.journeyId === bookingJourneyIdRef.current) {
      return JSON.stringify({
        shown: stageVisibleRef.current ? stageRef.current.view : false,
        alreadyShown: stageVisibleRef.current,
        restored: true,
        restoredView: restoredGuard.view,
        blockedTool: toolName,
        reason: "restored_stage_waiting_for_guest_selection",
        instruction: "The widget has just restored the exact paused step requested by the guest. A delayed reply or tool call from the previous topic must not advance it. Acknowledge the restored panel and wait for the guest to make the next movie, showtime, seat, or checkout choice.",
      });
    }
    if (stageVisibleRef.current || renderTopicRef.current === "booking") return null;
    const paused = selectRestorableRichStage(pausedJourneyRef.current);
    if (!paused) return null;
    return JSON.stringify({
      shown: false,
      paused: true,
      pausedView: paused.view,
      blockedTool: toolName,
      reason: "unrelated_topic_active",
      instruction: "A previous rich booking step is paused and hidden. Answer the current topic without changing booking rendering. Restore it only after an explicit continue or return request.",
    });
  };

  const preserveActiveCancellationForTool = (toolName) => {
    const flow = cancellationFlowRef.current;
    if (!flow?.bookingRef || !["checking", "route_confirmation", "final_confirmation", "processing"].includes(flow.phase)) return null;
    return JSON.stringify({
      shown: stageRef.current.view,
      blockedTool: toolName,
      reason: "cancellation_in_progress",
      bookingRef: flow.bookingRef,
      phase: flow.phase,
      paused: cancellationPausedRef.current,
      instruction: cancellationPausedRef.current
        ? "A cancellation check or confirmation is paused while the guest discusses another topic. Keep it hidden and preserve its state until the guest asks to resume cancellation."
        : "A cancellation check or confirmation is active. Continue only with that cancellation until the guest confirms, declines, or changes topic.",
    });
  };

  const commitDiscoveryPreferences = (update) => {
    const merged = mergeDiscoveryPreferences(discoveryPreferencesRef.current, update);
    discoveryPreferencesRef.current = merged.preferences;
    setDiscoveryPreferences(merged.preferences);
    if (merged.invalidates.seatSelection && (seatsRef.current.length || pendingOrderRef.current || planContextRef.current)) {
      clearSeatSelection();
    }
    return merged;
  };

  const applyDiscoveryPreferencesFromText = (text, overrides = {}) => {
    let merged = parseAndMergeDiscoveryPreferences(discoveryPreferencesRef.current, text, {
      cinemas: CINEMAS,
      movies: [...DISCOVERY_MOVIE_CATALOG, ...filmsRef.current, stageRef.current.movie].filter(Boolean),
      now: new Date(),
      timeZone: "Asia/Dubai",
    });
    if (Object.keys(overrides).length) {
      const withOverrides = mergeDiscoveryPreferences(merged.preferences, { patch: overrides });
      merged = {
        ...withOverrides,
        update: merged.update,
        changedKeys: [...new Set([...merged.changedKeys, ...withOverrides.changedKeys])],
        invalidates: Object.fromEntries(Object.keys(withOverrides.invalidates).map((key) => [key, merged.invalidates[key] || withOverrides.invalidates[key]])),
      };
    }
    discoveryPreferencesRef.current = merged.preferences;
    setDiscoveryPreferences(merged.preferences);
    if (merged.invalidates.seatSelection && (seatsRef.current.length || pendingOrderRef.current || planContextRef.current)) clearSeatSelection();
    return merged;
  };

  const isDiscoveryRequest = (text) => {
    if (explicitLanguageRequest(text)) return false;
    const signal = extractDiscoveryPreferencePatch(text, {
      cinemas: CINEMAS,
      movies: [...DISCOVERY_MOVIE_CATALOG, ...filmsRef.current, stageRef.current.movie].filter(Boolean),
      now: new Date(),
      timeZone: "Asia/Dubai",
    });
    const genericRequest = /\b(?:movie|film|watch|playing|showtime|cinema)\b|(?:فيلم|سينما|موعد عرض|أشاهد|اشاهد)/iu.test(String(text || ""));
    const datePromptReply = Boolean(resolveDatePromptReply(
      text,
      programmingDatesForCinema(cinemaRef.current),
      stageRef.current,
    ));
    const barePreferenceReply = stageRef.current.view === "discovery"
      && stageRef.current.missing?.[0] === "preference"
      && String(text || "").trim().split(/\s+/).length >= 1;
    return signal.hasDiscoverySignal || genericRequest || datePromptReply || barePreferenceReply;
  };

  const isDiscoveryFilterTurn = (text) => {
    const signal = extractDiscoveryPreferencePatch(text, {
      cinemas: CINEMAS,
      movies: [...DISCOVERY_MOVIE_CATALOG, ...filmsRef.current, stageRef.current.movie].filter(Boolean),
      now: new Date(),
      timeZone: "Asia/Dubai",
    });
    return shouldTreatAsDiscoveryFilterTurn(text, {
      view: stageRef.current.view,
      missing: stageRef.current.missing,
      signal,
    });
  };

  const isLanguageControlTurn = (text) => Boolean(explicitLanguageRequest(text) || resolveLanguageSignal({
    role: "user",
    text,
    currentLocale: localeRef.current,
    pendingLocale: pendingLanguageSwitchRef.current,
  }).nextLocale);

  const discoveryMissingCriteria = (preferences = discoveryPreferencesRef.current) => {
    const missing = getMissingDiscoveryCriteria(preferences, ["cinema", "date"]);
    const hasNarrowingPreference = Boolean(
      preferences.movieId || preferences.movieTitle || preferences.preferredTime || preferences.timeBand
      || preferences.genre || preferences.language || preferences.experience || preferences.audience
    );
    if (!hasNarrowingPreference) missing.push("preference");
    return missing;
  };

  const discoveryQuestion = (missing) => {
    const field = missing?.[0];
    if (localeRef.current === "ar") {
      if (field === "cinema") return "أي موقع من ڤوكس سينما تفضّل؟";
      if (field === "date") return "ما التاريخ الذي تفضّله؟";
      return "ما الذي تفضّله؟ يمكنك ذكر فيلم أو وقت أو نوع أو لغة أو تجربة سينمائية أو أفلام عائلية.";
    }
    if (field === "cinema") return "Which VOX Cinemas UAE location would you like?";
    if (field === "date") return "What date would you like to go?";
    return "What would you prefer? You can name a movie, time, genre, language, cinema experience, or family choice.";
  };

  const showDiscoveryPrompt = (missing, preferences = discoveryPreferencesRef.current) => {
    const question = discoveryQuestion(missing);
    showStage({ view: "discovery", missing, question, preferences });
    return { shown: "discovery question", missing, question, preferences };
  };

  const filterCurrentSessions = (sessions) => filterBookableSessions(sessions, { now: new Date(), programmingDayCutoffHour: 6 });

  const loadDiscoveryForCinema = async (target, requestedDate, initialPreferences = discoveryPreferencesRef.current, rawTurn = "") => {
    const epoch = beginAsyncRequest();
    showStage({ view: "loading", label: t("app.loadingMovies") });
    const revision = stageRevisionRef.current;
    let movies;
    try {
      movies = await ensureFilms(target.id, requestedDate);
    } catch (error) {
      const reason = error?.message || "Movie results could not be loaded.";
      if (requestIsCurrent(epoch, revision, target.id, requestedDate)) showStage({ view: "movies", movies: [], error: reason });
      return { shown: false, reason };
    }
    if (!requestIsCurrent(epoch, revision, target.id, requestedDate)) return { shown: false, stale: true, reason: "The booking criteria changed while movies were loading." };

    let preferences = initialPreferences;
    const unresolvedTitleTurn = pendingDiscoveryTurnRef.current;
    if (rawTurn) {
      const reparsed = parseAndMergeDiscoveryPreferences(preferences, rawTurn, {
        cinemas: CINEMAS,
        movies,
        now: new Date(),
        timeZone: "Asia/Dubai",
      });
      preferences = reparsed.preferences;
      discoveryPreferencesRef.current = preferences;
      setDiscoveryPreferences(preferences);
    }
    if (unresolvedTitleTurn && !preferences.movieId && !preferences.movieTitle) {
      const unresolvedSignal = extractDiscoveryPreferencePatch(unresolvedTitleTurn, {
        cinemas: CINEMAS,
        movies,
        now: new Date(),
        timeZone: "Asia/Dubai",
      });
      const title = unresolvedMovieTitleCandidate(unresolvedTitleTurn, unresolvedSignal) || unresolvedTitleTurn;
      const resolvedMovie = resolveDiscoveryMovieCandidate(movies, title);
      pendingDiscoveryTurnRef.current = "";
      if (resolvedMovie) {
        preferences = commitDiscoveryPreferences({ patch: { movieId: resolvedMovie.id, movieTitle: resolvedMovie.title } }).preferences;
      } else {
        const message = localeRef.current === "ar"
          ? `لم أتمكن من مطابقة «${title}» مع الأفلام المنشورة في هذا الموقع والتاريخ. تحقق من اسم الفيلم أو اختر فيلماً أو تاريخاً آخر.`
          : `I couldn't match “${title}” to a movie published at this cinema on this date. Check the title, or choose another movie or date.`;
        showStage({ view: "movies", movies: [], error: message, errorCode: "movie_title_unresolved", preferences });
        return { shown: "movie title clarification", movies: [], preferences, reason: message, errorCode: "movie_title_unresolved" };
      }
    }
    const freshMissing = discoveryMissingCriteria(preferences);
    if (freshMissing.includes("preference") && !isOpenEndedDiscoveryRequest(rawTurn)) {
      pendingDiscoveryTurnRef.current = "";
      return showDiscoveryPrompt(["preference"], preferences);
    }

    const metadata = filterDiscoveryResults({ movies, sessions: null, cinemas: CINEMAS, preferences });
    const sessionGroups = await Promise.all(metadata.movies.map(async (movie) => {
      try {
        const rows = await vista.getSessions(target.id, movie.id, requestedDate);
        return { movie, rows: rows.map((session) => ({ ...session, cinemaId: target.id, scheduledFilmId: movie.id, movieId: movie.id })), failed: false };
      } catch (error) {
        console.error("VOXi showtime request failed", {
          operation: "getSessions",
          cinemaId: target.id,
          movieId: movie.id,
          programmingDate: requestedDate,
          code: error?.code || null,
          status: error?.status || null,
        });
        return { movie, rows: [], failed: true, error };
      }
    }));
    if (!requestIsCurrent(epoch, revision, target.id, requestedDate)) return { shown: false, stale: true, reason: "The booking criteria changed while showtimes were loading." };
    const failedGroups = sessionGroups.filter((group) => group.failed);
    if (metadata.movies.length && failedGroups.length === metadata.movies.length) {
      const reason = "Showtime availability could not be loaded. Please retry.";
      showStage({ view: "movies", movies: [], error: reason });
      return { shown: false, reason, retryAvailable: true, failedMovieCount: failedGroups.length };
    }
    const availability = filterCurrentSessions(sessionGroups.flatMap((group) => group.rows));
    const result = filterDiscoveryResults({
      movies,
      sessions: availability.available,
      cinemas: CINEMAS,
      preferences,
      timeToleranceMinutes: 45,
      nearestLimit: 4,
    });
    discoverySessionsRef.current = new Map(result.movies.map((movie) => [
      movie.id,
      result.sessions.filter((session) => String(session.movieId || session.scheduledFilmId) === String(movie.id)),
    ]));
    const enrichedMovies = result.movies.map((movie) => ({
      ...movie,
      relevantSessions: discoverySessionsRef.current.get(movie.id) || [],
    }));
    const requestedTime = result.time.requestedTime;
    let notice = result.time.usedNearestFallback
      ? (localeRef.current === "ar"
        ? `لا يوجد عرض عند ${requestedTime}. أقرب الأوقات المناسبة: ${result.time.closestTimes.join("، ")}.`
        : `No showtime is available at ${requestedTime}. Showing the closest suitable times: ${result.time.closestTimes.join(", ")}.`)
      : result.time.exactTimeMatch
        ? (localeRef.current === "ar"
          ? `تتوفر عروض عند ${requestedTime} مع أقرب الخيارات المناسبة.`
          : `Showtimes at ${requestedTime} are available, with the closest suitable options.`)
        : null;
    if (failedGroups.length) {
      const partialNotice = localeRef.current === "ar"
        ? `تعذر التحقق من مواعيد ${failedGroups.length} من الأفلام؛ النتائج المعروضة جزئية.`
        : `Showtimes for ${failedGroups.length} movie${failedGroups.length === 1 ? "" : "s"} could not be verified, so these results are partial.`;
      notice = [notice, partialNotice].filter(Boolean).join(" ");
    }
    const error = !enrichedMovies.length
      ? (localeRef.current === "ar" ? "لا توجد أفلام تطابق جميع تفضيلاتك في هذا الموقع والتاريخ." : "No movies match all of your preferences at this cinema and date.")
      : null;
    showStage({ view: "movies", movies: enrichedMovies, discovery: result, notice, error, expiredSessionCount: availability.expired.length });
    resetClarificationFailures();
    return {
      shown: enrichedMovies.length ? "filtered movie list" : "empty filtered movie list",
      cinema: { id: target.id, name: target.name },
      selectedDate: requestedDate,
      preferences,
      movies: enrichedMovies.map((movie) => ({ id: movie.id, title: movie.title, showtimes: (movie.relevantSessions || []).map((session) => ({ sessionId: session.sessionId, time: session.time, experience: session.exp })) })),
      time: result.time,
      expiredSessionCount: availability.expired.length,
      failedMovieCount: failedGroups.length,
      reason: error,
    };
  };

  const findAvailableCinemasForMovie = async (preferences) => {
    const candidates = filterDiscoveryResults({ cinemas: CINEMAS, preferences: { ...preferences, cinemaId: null, cinemaName: null } }).cinemas;
    const matches = await Promise.all(candidates.map(async (candidate) => {
      try {
        const movies = await vista.getScheduledFilms(candidate.id, preferences.date);
        const metadata = filterDiscoveryResults({ movies, cinemas: CINEMAS, preferences: { ...preferences, cinemaId: candidate.id } });
        if (!metadata.movies.length) return null;
        const groups = await Promise.all(metadata.movies.map(async (movie) => (await vista.getSessions(candidate.id, movie.id, preferences.date))
          .map((session) => ({ ...session, cinemaId: candidate.id, scheduledFilmId: movie.id, movieId: movie.id }))));
        const availability = filterCurrentSessions(groups.flat());
        const filtered = filterDiscoveryResults({ movies, sessions: availability.available, cinemas: CINEMAS, preferences: { ...preferences, cinemaId: candidate.id } });
        return filtered.movies.length ? candidate : null;
      } catch (error) {
        return { failed: true, candidate, error };
      }
    }));
    return {
      cinemas: matches.filter((match) => match && !match.failed),
      failedCinemaCount: matches.filter((match) => match?.failed).length,
      checkedCinemaCount: candidates.length,
    };
  };

  const routeDiscoveryTurn = async (text, { cinemaOverride = null, dateOverride = null, preferencesAlreadyApplied = false } = {}) => {
    const rawTurn = String(text || "").trim();
    const acceptsAnyMovie = isOpenEndedDiscoveryRequest(rawTurn);
    const rawPreferencePatch = extractDiscoveryPreferencePatch(rawTurn, {
      cinemas: CINEMAS,
      movies: [...DISCOVERY_MOVIE_CATALOG, ...filmsRef.current].filter(Boolean),
      now: new Date(),
      timeZone: "Asia/Dubai",
    });
    const directCinemaReply = Boolean(cinemaOverride && isDirectCinemaSelectionUtterance({
      text: rawTurn,
      view: stageRef.current.view,
      cinemaMatch: cinemaOverride,
    }));
    const plausibleBareTitleReply = stageRef.current.view === "discovery"
      && stageRef.current.missing?.[0] === "preference"
      && !rawPreferencePatch.hasDiscoverySignal
      && !/^(?:any|anything|something|whatever|movies?|films?|showtimes?|options?|choices?|yes|no|no thanks?|not now|maybe later|thanks?|thank you|hello|hi|hey|bye|goodbye|أي|اي|أي شيء|اي شيء|أفلام|افلام|خيارات|نعم|لا|لا شكرا|ليس الآن|شكرا|مرحبا|وداعا)$/iu.test(rawTurn);
    const dateOnlyReply = isProgrammingDateOnlyReply(
      rawTurn,
      dateOverride || rawPreferencePatch.patch.date || requestedProgrammingDate(rawTurn),
    );
    const likelyUnresolvedTitle = rawTurn && !directCinemaReply && !dateOnlyReply && !rawPreferencePatch.patch.movieTitle && (
      unresolvedMovieTitleCandidate(rawTurn, rawPreferencePatch)
      || plausibleBareTitleReply
    );
    if (likelyUnresolvedTitle) pendingDiscoveryTurnRef.current = rawTurn;
    else if (
      directCinemaReply || rawPreferencePatch.patch.movieId || rawPreferencePatch.patch.movieTitle
      || rawPreferencePatch.clear.includes("movieId") || rawPreferencePatch.clear.includes("movieTitle")
      || /\b(?:any movie|another movie|something else|start over|reset)\b|(?:فيلم آخر|فيلم اخر|ابدأ من جديد)/iu.test(rawTurn)
    ) pendingDiscoveryTurnRef.current = "";
    const combinedRawTurn = [pendingDiscoveryTurnRef.current, rawTurn].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" ");
    const overrides = {
      ...(cinemaOverride ? { cinemaId: cinemaOverride.id, cinemaName: cinemaOverride.name } : {}),
      ...(dateOverride ? { date: dateOverride, dateSignal: "explicit" } : {}),
    };
    const merged = preferencesAlreadyApplied
      ? { preferences: discoveryPreferencesRef.current }
      : applyDiscoveryPreferencesFromText(text, overrides);
    const preferences = Object.keys(overrides).length && preferencesAlreadyApplied
      ? commitDiscoveryPreferences({ patch: overrides }).preferences
      : merged.preferences;
    const rejectsCurrentCinema = rawPreferencePatch.clear.includes("cinemaId")
      || rawPreferencePatch.clear.includes("cinemaName")
      || Boolean(rawPreferencePatch.patch.city && !rawPreferencePatch.patch.cinemaId);
    if (rejectsCurrentCinema && !cinemaOverride) {
      cinemaRef.current = null;
      setCinema(null);
      filmsRef.current = [];
      filmsCinemaRef.current = "";
      filmsDateRef.current = "";
      sessionsRef.current = [];
      sessionsFilmRef.current = "";
      clearSeatSelection();
    }
    const target = resolveCinema(preferences.cinemaId || preferences.cinemaName) || cinemaOverride || (rejectsCurrentCinema ? null : cinemaRef.current);
    const missing = discoveryMissingCriteria({
      ...preferences,
      cinemaId: target?.id || preferences.cinemaId,
      cinemaName: target?.name || preferences.cinemaName,
    });
    if (!target) {
      let cinemas = filterDiscoveryResults({ cinemas: CINEMAS, preferences }).cinemas;
      if ((preferences.movieId || preferences.movieTitle) && preferences.date) {
        const scanEpoch = beginAsyncRequest();
        showStage({ view: "loading", label: localeRef.current === "ar" ? "جارٍ التحقق من المواقع المتاحة…" : "Checking available cinemas…" });
        const scanRevision = stageRevisionRef.current;
        const availability = await findAvailableCinemasForMovie(preferences);
        if (requestEpochRef.current !== scanEpoch || stageRevisionRef.current !== scanRevision) return { shown: false, stale: true, reason: "The discovery request changed while cinema availability was loading." };
        cinemas = availability.cinemas;
        if (availability.failedCinemaCount) {
          const reason = availability.failedCinemaCount === availability.checkedCinemaCount
            ? (localeRef.current === "ar" ? "تعذر التحقق من توفر هذا الفيلم في المواقع حالياً. حاول مرة أخرى." : "Cinema availability for this movie could not be verified. Please retry.")
            : (localeRef.current === "ar" ? "تعذر التحقق من بعض المواقع؛ القائمة المعروضة جزئية." : "Some cinema locations could not be checked, so this list is partial.");
          showStage({ view: "cinemas", cinemas, notice: reason, preferences, error: availability.failedCinemaCount === availability.checkedCinemaCount, retryAvailable: true });
          return { shown: cinemas.length ? "partial filtered cinema picker" : false, cinemas, partial: true, failedCinemaCount: availability.failedCinemaCount, reason, preferences };
        }
        if (!cinemas.length) {
          const title = preferences.movieTitle || "that movie";
          const question = localeRef.current === "ar"
            ? `لا يتوفر ${title} في أي موقع من ڤوكس سينما الإمارات في ${preferences.date}. اختر فيلماً أو تاريخاً آخر.`
            : `${title} is not available at any VOX Cinemas UAE location on ${preferences.date}. Choose another movie or date.`;
          showStage({ view: "discovery", missing: ["movie_or_date"], question, preferences, errorCode: "movie_unavailable_for_date" });
          return { shown: "movie unavailable clarification", cinemas: [], missing: ["movie_or_date"], preferences, reason: question };
        }
      }
      cinemaReturnRef.current = { view: "empty" };
      showStage({ view: "cinemas", cinemas, notice: discoveryQuestion(["cinema"]), preferences });
      return { shown: "filtered cinema picker", cinemas: cinemas.map(({ id, name }) => ({ id, name })), missing: ["cinema"], preferences };
    }
    if (target.id !== cinemaRef.current?.id) {
      cinemaRef.current = target;
      setCinema(target);
      filmsRef.current = [];
      filmsCinemaRef.current = "";
      filmsDateRef.current = "";
      sessionsRef.current = [];
      sessionsFilmRef.current = "";
      clearSeatSelection();
    }
    if (missing[0] === "date") return showDiscoveryPrompt(missing, preferences);
    const availableDates = programmingDatesForCinema(target);
    if (!availableDates.includes(preferences.date)) {
      userRequestedDateRef.current = preferences.date;
      showUnavailableProgrammingDate(preferences.date);
      return { shown: false, reason: `No published programming is available for ${preferences.date}.`, availableDates };
    }
    if (preferences.date !== scheduleDateRef.current) applyProgrammingDate(preferences.date, "discovery_date_changed", availableDates);
    if (missing.includes("preference") && !pendingDiscoveryTurnRef.current && !acceptsAnyMovie) return showDiscoveryPrompt(missing.filter((item) => item === "preference"), preferences);
    const result = await loadDiscoveryForCinema(target, preferences.date, preferences, combinedRawTurn);
    if (discoveryPreferencesRef.current.movieId || discoveryPreferencesRef.current.movieTitle) pendingDiscoveryTurnRef.current = "";
    return result;
  };

  useEffect(() => {
    const refreshBookingStateFromStorage = ({ clearMissing = false } = {}) => {
      let refreshedBookings;
      try {
        refreshedBookings = readBookings({ strict: true });
      } catch (error) {
        console.error("Booking history could not be refreshed after a storage change", error);
        return;
      }
      setBookings(refreshedBookings);
      const visible = bookingRef.current;
      if (!visible?.ref) return;
      const refreshed = refreshedBookings.find((item) => norm(item.ref) === norm(visible.ref));
      if (refreshed) {
        bookingRef.current = refreshed;
        setBooking(refreshed);
        if (stageRef.current.view === "booking") showStage({ view: "booking", booking: refreshed });
        if (refreshed.cancelled && norm(cancellationFlowRef.current?.bookingRef) === norm(refreshed.ref)) setCancellationFlow(null);
      } else if (clearMissing) {
        bookingRef.current = null;
        setBooking(null);
        if (stageRef.current.view === "booking") showStage({ view: "empty" });
        setCancellationFlow(null);
      }
    };
    const onLocalCancellationJournalChange = () => {
      syncCancellationJournalUi();
      refreshBookingStateFromStorage();
    };
    const onCrossTabStorage = (event) => {
      if (event.key === CANCELLATION_JOURNAL_KEY) {
        if (inMemoryCancellationJournal?.owned !== true) {
          inMemoryCancellationJournal = null;
          cancellationJournalPrivacyFailure = false;
        }
        syncCancellationJournalUi();
        refreshBookingStateFromStorage();
        return;
      }
      if (event.key !== BOOKING_STORAGE_KEY && event.key !== null) return;
      refreshBookingStateFromStorage({ clearMissing: event.newValue === null });
    };
    window.addEventListener(CANCELLATION_JOURNAL_EVENT, onLocalCancellationJournalChange);
    window.addEventListener("storage", onCrossTabStorage);
    return () => {
      window.removeEventListener(CANCELLATION_JOURNAL_EVENT, onLocalCancellationJournalChange);
      window.removeEventListener("storage", onCrossTabStorage);
    };
  }, [showStage, setCancellationFlow]);

  const captureHistoryReturn = () => {
    historyReturnRef.current = stageRef.current;
    historyContextRef.current = {
      cinema: cinemaRef.current,
      booking: bookingRef.current,
      bookingOpenedFromHistory: bookingOpenedFromHistoryRef.current,
      scheduleDate: scheduleDateRef.current,
      selectedSeats: [...seatsRef.current],
    };
  };

  const activeCancellationMutation = () => {
    const flow = cancellationFlowRef.current;
    const journal = readCancellationJournal();
    const pendingJournal = journal && !journal.orphaned ? journal : null;
    if (!cancellationLockPendingRef.current && !cancellationInFlightRef.current && flow?.phase !== "processing" && !pendingJournal) return null;
    return {
      found: true,
      bookingRef: flow?.bookingRef || null,
      confirmationRequired: false,
      phase: "processing",
      refundRoute: flow?.refundRoute || null,
      simulationOnly: Boolean(flow?.demoOnly),
      message: flow?.message || (localeRef.current === "ar" ? "جارٍ إتمام طلب الإلغاء الحالي. انتظر حتى يكتمل قبل بدء طلب آخر." : "The current cancellation is still processing. Wait for it to finish before starting another request."),
    };
  };

  const cancellationReconciliationRequired = () => {
    const journal = readCancellationJournal();
    if (!journal?.orphaned) return null;
    const result = {
      found: true,
      eligible: false,
      confirmationRequired: false,
      phase: "reconciliation_required",
      reason: "provider_reconciliation_required",
      bookingRef: null,
      retryAllowed: false,
      dismissAllowed: false,
      outcomeUnknown: true,
      journalStartedAt: journal.startedAt,
      message: localeRef.current === "ar"
        ? "تعذر التحقق من نتيجة طلب إلغاء سابق. تم إيقاف جميع طلبات الإلغاء الجديدة على هذا الجهاز ولم يتم إرسال طلب جديد. تحقق من حجوزاتك عبر خدمة إدارة الحجز الرسمية من VOX أو تواصل مع الدعم."
        : "The result of an earlier cancellation request could not be verified. All new cancellation requests on this device are paused and no new request was sent. Check your bookings in the official VOX Manage Booking service or contact support.",
    };
    if (mountedRef.current) {
      setCancellationFlow({ phase: "error", bookingRef: null, demoOnly: false, refundRoute: null, error: result.reason, message: result.message, retryAllowed: false, dismissAllowed: false, outcomeUnknown: true, journalStartedAt: journal.startedAt });
    }
    return result;
  };

  const syncCancellationJournalUi = () => {
    window.clearTimeout(cancellationJournalTimerRef.current);
    cancellationJournalTimerRef.current = null;
    const journal = readCancellationJournal();
    if (!journal) {
      if (cancellationFlowRef.current?.outcomeUnknown) setCancellationFlow(null);
      return null;
    }
    if (journal.orphaned) return cancellationReconciliationRequired();
    const message = localeRef.current === "ar"
      ? "طلب إلغاء سابق ما زال بانتظار الحالة النهائية. تم إخفاء رمز الحجز المحتمل تأثره، ولن يتم إرسال طلب إلغاء آخر."
      : "An earlier cancellation request is still awaiting its final status. The potentially affected booking QR is hidden and no new cancellation request will be sent.";
    const result = {
      found: true,
      confirmed: false,
      confirmationRequired: false,
      phase: "processing",
      reason: "provider_outcome_pending",
      bookingRef: null,
      message,
      retryAllowed: false,
      dismissAllowed: false,
      outcomeUnknown: true,
      journalStartedAt: journal.startedAt,
    };
    if (mountedRef.current) setCancellationFlow(result);
    const remaining = Math.max(0, (journal.startedAt + CANCELLATION_JOURNAL_TTL_MS) - Date.now());
    cancellationJournalTimerRef.current = window.setTimeout(() => {
      const latest = readCancellationJournal();
      if (!latest || latest.token !== journal.token) return syncCancellationJournalUi();
      markCancellationJournalForReconciliation(journal.token);
      cancellationReconciliationRequired();
    }, remaining + 25);
    return result;
  };

  useEffect(() => {
    syncCancellationJournalUi();
    return () => window.clearTimeout(cancellationJournalTimerRef.current);
  }, []);

  const beginAsyncRequest = () => {
    requestEpochRef.current += 1;
    return requestEpochRef.current;
  };

  const requestIsCurrent = (epoch, revision, cinemaId, requestedDate) => (
    requestEpochRef.current === epoch
    && stageRevisionRef.current === revision
    && (!cinemaId || cinemaRef.current?.id === cinemaId)
    && (!requestedDate || scheduleDateRef.current === requestedDate)
  );

  const loadingErrorMessage = (subject = "results") => localeRef.current === "ar"
    ? `تعذر تحميل ${subject === "seats" ? "خريطة المقاعد" : "النتائج"}. حاول مرة أخرى.`
    : `Voxi couldn't load the ${subject}. Please try again.`;

  const queuePendingEcho = (text) => {
    const pending = { text, at: Date.now() };
    lastSentTextRef.current = pending;
    pendingTypedMessagesRef.current.push(pending);
    pendingTypedMessagesRef.current = pendingTypedMessagesRef.current
      .filter((item) => Date.now() - item.at < 30_000)
      .slice(-10);
  };

  const dismissStaleTransactionalView = ({ text, actionIntent, historyRequested, cancellationReply = false } = {}) => {
    const current = stageRef.current;
    if (!["booking", "history"].includes(current.view)) return false;
    const refersToDisplayedBooking = /\b(?:this|that|my|the)\s+(?:booking|reservation|tickets?)\b|\b(?:booking|reservation)\s+(?:reference|ref|details?)\b|(?:هذا|هذه|حجزي|الحجز|التذاكر)/i.test(String(text || ""));
    const keepsTransactionalView = historyRequested
      || actionIntent === "booking_history"
      || actionIntent === "cancellation"
      || cancellationReply
      || Boolean(cancellationFlowRef.current)
      || refersToDisplayedBooking;
    if (keepsTransactionalView) return false;

    const startsNewBooking = actionIntent === "booking" || isDiscoveryRequest(text);
    if (startsNewBooking) return false;
    pauseRichRenderingForTopicChange("transactional_topic_changed", "general_enquiry");
    return true;
  };

  const prepareFaqContext = useCallback((query) => {
    const activeLocale = localeRef.current;
    const current = stageRef.current;
    const faq = buildFaqContextForQuery(query, {
      locale: activeLocale,
      minScore: 35,
      liveData: {
        "cinema-locations-hours": {
          locations: CINEMAS.map((item) => ({ id: item.id, name: item.name })),
          selectedCinema: cinemaRef.current ? { id: cinemaRef.current.id, name: cinemaRef.current.name } : null,
        },
        "experience-availability": {
          cinema: cinemaRef.current?.name || null,
          movie: current.movie?.title || null,
          sessions: sessionsRef.current.map((session) => ({ time: session.time, experience: session.exp })),
        },
        "bank-and-card-offers": lastOfferRef.current ? {
          id: lastOfferRef.current.offer?.id,
          eligibility: lastOfferRef.current.status,
        } : null,
      },
    });
    if (!faq.matches.length) return faq;
    const primary = faq.matches[0];
    const inferred = inferIntent({ view: "empty", text: query, previousIntent: null });
    const faqIntent = primary.topic === "offers"
      ? "offers"
      : ["cancellations_refunds", "booking_refund"].includes(primary.topic)
        ? "cancellation"
        : inferred === "booking"
          ? "booking"
          : "general_enquiry";
    const preserveBookingIntent = ["movies", "showtimes", "seatmap", "checkout", "booking", "history"].includes(current?.view);
    if (!preserveBookingIntent) {
      journeyRef.current = { ...journeyRef.current, intent: faqIntent };
      dispatchJourney({ type: "intent", intent: faqIntent });
    }
    return faq;
  }, []);

  const pauseRenderingForUnrelatedTurn = ({
    decision,
    historyRequested,
    directCancellation,
    directSeatSelection,
    directCinemaSelection,
    resumeTarget,
    languageControlTurn,
    localOfferTurn,
    discoveryFilterTurn,
    actionIntent,
    faq,
  } = {}) => {
    if (!stageVisibleRef.current || !richJourneyViewFromStage(stageRef.current)) return false;
    const transactional = decision !== null
      || historyRequested
      || directCancellation
      || directSeatSelection
      || directCinemaSelection
      || resumeTarget
      || languageControlTurn
      || localOfferTurn
      || discoveryFilterTurn
      || actionIntent === "booking"
      || actionIntent === "booking_history"
      || actionIntent === "cancellation";
    if (transactional) return false;
    if (!faq?.matches?.length && actionIntent !== null) return false;
    pauseRichRenderingForTopicChange(faq?.matches?.length ? "faq_topic_change" : "general_topic_change", "general_enquiry");
    return true;
  };

  useEffect(() => {
    filmsRef.current = [];
    filmsCinemaRef.current = "";
    filmsDateRef.current = "";
    sessionsRef.current = [];
    sessionsFilmRef.current = "";
    if (cinema?.id) ensureFilms(cinema.id, scheduleDate).catch(() => {});
  }, [cinema?.id, ensureFilms, scheduleDate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPendingVoiceCancellationDecision();
      clearCancellationConfirmationTimer("widget_unmounted");
      if (!readCancellationJournal() && !cancellationLockPendingRef.current) dismissPendingCancellation("widget_unmounted", { force: true });
    };
  }, []);

  const applyProgrammingDate = (nextDate, reason = "date_changed", availableDates = programmingDatesForCinema(cinemaRef.current)) => {
    if (!availableDates.includes(nextDate) || nextDate === scheduleDateRef.current) return false;
    userRequestedDateRef.current = null;
    dismissPendingCancellation(reason);
    clearPendingOrder();
    resetClarificationFailures();
    scheduleDateRef.current = nextDate;
    setScheduleDate(nextDate);
    filmsRef.current = [];
    filmsCinemaRef.current = "";
    filmsDateRef.current = "";
    sessionsRef.current = [];
    sessionsFilmRef.current = "";
    clearSeatSelection();
    return true;
  };

  const captureUserProgrammingDate = (text, availableDates = programmingDatesForCinema(cinemaRef.current)) => {
    const requestedDate = requestedProgrammingDate(text)
      || resolveDatePromptReply(text, availableDates, stageRef.current);
    if (!requestedDate) return { requestedDate: null, unavailableDate: null };
    if (availableDates.includes(requestedDate)) {
      userRequestedDateRef.current = null;
      return { requestedDate, unavailableDate: null };
    }
    userRequestedDateRef.current = requestedDate;
    return { requestedDate: null, unavailableDate: requestedDate };
  };

  const showUnavailableProgrammingDate = (date) => {
    const message = t("app.dateUnavailable", { date });
    if (cinemaRef.current && ["empty", "loading", "cinemas", "movies", "showtimes"].includes(stageRef.current.view)) {
      showStage({ view: "movies", movies: [], error: message, errorCode: "date_unavailable" });
    }
    say("system", message);
    return message;
  };

  const resolveClientToolProgrammingDate = (text, availableDates, { fallbackToFirst = true } = {}) => {
    const decision = resolveProgrammingDateSelection({
      availableDates,
      userRequestedDate: userRequestedDateRef.current,
      toolRequestedDate: requestedProgrammingDate(text),
      selectedDate: scheduleDateRef.current,
      fallbackToFirst,
    });
    if (!decision.blocked && decision.source === "user") userRequestedDateRef.current = null;
    return decision;
  };

  const applyUtteranceBookingDetails = (text, { actionIntent = null, hasFaq = false } = {}) => {
    const mentionedCinema = resolveCinema(text);
    const bookingContext = isCinemaSelectionTurn({
      view: stageRef.current.view,
      intent: journeyRef.current.intent,
      actionIntent,
      hasFaq,
      cinemaMatch: mentionedCinema,
    }) || (!hasFaq && (actionIntent === "booking" || journeyRef.current.intent === "booking"));
    if (!bookingContext) return { cinema: null, requestedSeatTarget: null };
    if (mentionedCinema && mentionedCinema.id !== cinemaRef.current?.id) {
      dismissPendingCancellation("cinema_changed_in_conversation");
      clearPendingOrder();
      cinemaRef.current = mentionedCinema;
      setCinema(mentionedCinema);
      filmsRef.current = [];
      filmsCinemaRef.current = "";
      filmsDateRef.current = "";
      sessionsRef.current = [];
      sessionsFilmRef.current = "";
      clearSeatSelection();
      const cinemaDates = programmingDatesForCinema(mentionedCinema);
      if (cinemaDates.length && !cinemaDates.includes(scheduleDateRef.current)) {
        scheduleDateRef.current = cinemaDates[0];
        setScheduleDate(cinemaDates[0]);
      }
    }
    const quantity = extractTicketQuantity(text);
    if (quantity) {
      requestedSeatTargetRef.current = quantity;
      setRequestedSeatTarget(quantity);
    }
    return { cinema: mentionedCinema, requestedSeatTarget: quantity };
  };

  const finalizeSeats = async (seatIds) => {
    const current = stageRef.current;
    const planContext = planContextRef.current;
    if (current.view !== "seatmap" || !planContext || planContext.cinemaId !== cinemaRef.current?.id || String(planContext.sessionId) !== String(current.session?.sessionId)) {
      return { valid: [], total: 0, stale: true };
    }
    if (!filterCurrentSessions([{ ...current.session, date: current.session?.date || scheduleDateRef.current }]).available.length) {
      return { valid: [], total: 0, reason: "showtime_expired" };
    }
    const plan = planRef.current || [];
    const all = plan.flatMap((row) => row.seats);
    const availableSeatIds = all.filter((seat) => seat.status === 0).map((seat) => seat.id);
    const requested = normalizeSeatIds(seatIds, availableSeatIds);
    if (requested.length > MAX_TICKETS) {
      return { valid: [], total: 0, reason: "ticket_limit", requestedQuantity: requested.length };
    }
    const valid = requested.filter((id) => all.some((seat) => seat.id === id && seat.status === 0));
    if (!valid.length) return { valid: [], total: 0, reason: "no_seats", requestedQuantity: requested.length };
    seatsRef.current = [...valid];
    setSelectedSeats([...valid]);
    const movie = current.movie;
    const session = current.session;
    const selectedCinema = cinemaRef.current;
    const selectedSeatDetails = valid.map((id) => all.find((item) => item.id === id)).filter(Boolean);
    const selectionIsCurrent = () => stageRef.current.view === "seatmap"
      && planContextRef.current === planContext
      && cinemaRef.current?.id === selectedCinema?.id
      && String(stageRef.current.session?.sessionId) === String(session?.sessionId)
      && sameSeatSelection(seatsRef.current, valid);
    let quote;
    try {
      quote = await vista.getPricingQuote(selectedCinema?.id, session?.sessionId, selectedSeatDetails);
    } catch (error) {
      if (!selectionIsCurrent()) return { valid: [], total: 0, stale: true };
      return { valid, total: 0, reason: "pricing_unavailable", detail: error?.message || "Pricing is unavailable." };
    }
    if (!selectionIsCurrent()) return { valid: [], total: 0, stale: true };
    if (!filterCurrentSessions([{ ...session, date: session?.date || scheduleDateRef.current }]).available.length) {
      return { valid: [], total: 0, reason: "showtime_expired" };
    }
    const total = Number(quote?.total);
    if (!Number.isFinite(total)) return { valid, total: 0, reason: "pricing_unavailable" };
    setSeatQuote({ seatKey: [...valid].sort().join(","), loading: false, quote, error: null });
    const planMeta = vista.getResultMeta(plan);
    if (valid.length && selectedCinema) {
      const programmingDate = session?.date || scheduleDateRef.current;
      const sourceDate = session?.sourceDate || programmingDate;
      const showtimeHour = Number(String(session?.time || "").slice(0, 2));
      const performanceDate = Number.isFinite(showtimeHour) && showtimeHour < 6
        ? new Date(new Date(`${programmingDate}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
        : programmingDate;
      const showtimeAt = performanceDate && session?.time
        ? `${performanceDate}T${session.time}:00+04:00`
        : null;
      const order = {
        movieId: movie?.id,
        movieTitle: movie?.title,
        cinemaId: selectedCinema.id,
        cinemaName: selectedCinema.name,
        sessionId: session?.sessionId,
        date: performanceDate,
        sourceDate,
        performanceDate,
        programmingDate,
        showtimeAt,
        experience: session?.exp,
        screen: session?.screen,
        showtime: session?.time,
        seats: valid,
        subtotal: quote?.subtotal != null && Number.isFinite(Number(quote.subtotal)) ? Number(quote.subtotal) : null,
        fees: Array.isArray(quote?.fees) ? quote.fees : [],
        feeTotal: quote?.feeTotal != null && Number.isFinite(Number(quote.feeTotal)) ? Number(quote.feeTotal) : null,
        total,
        currency: quote?.currency || selectedCinema.currency || "AED",
        tint: movie?.tint,
        posterUrl: movie?.posterUrl,
        ticketQuantity: valid.length,
        demo: quote?.demo === true,
        verified: false,
        pricingVerified: quote?.verified === true,
        pricingMode: quote?.demo === true ? "demo" : "live",
        quoteId: quote?.quoteId || null,
        inventoryVerified: planMeta?.verified === true,
        reservationVerified: false,
        transactionWarning: quote?.warning || planMeta?.warning || null,
        checkoutId: `checkout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      };
      seatsRef.current = [...valid];
      setSelectedSeats([...valid]);
      pendingOrderRef.current = order;
      setPendingOrder(order);
      const checkoutStage = {
        ...current,
        view: "checkout",
        order,
        movie,
        session,
        cinema: selectedCinema,
        scheduleDate: programmingDate,
        selectedSeats: [...valid],
        plan,
        planContext,
        seatQuote: { seatKey: [...valid].sort().join(","), loading: false, quote, error: null },
      };
      checkoutStageRef.current = checkoutStage;
      showStage(checkoutStage);
      resetClarificationFailures();
    }
    return { valid, total, quote };
  };

  const restorePausedSnapshotContext = (snapshot) => {
    const context = snapshot?.pausedContext;
    if (!context) return;
    if (context.cinema !== undefined) {
      cinemaRef.current = context.cinema || null;
      setCinema(context.cinema || null);
    }
    if (context.booking !== undefined) {
      bookingRef.current = context.booking || null;
      setBooking(context.booking || null);
    }
    if (context.scheduleDate) {
      scheduleDateRef.current = context.scheduleDate;
      setScheduleDate(context.scheduleDate);
    }
    if (Array.isArray(context.selectedSeats)) {
      seatsRef.current = [...context.selectedSeats];
      setSelectedSeats([...context.selectedSeats]);
    }
    if (context.requestedSeatTarget !== undefined) {
      requestedSeatTargetRef.current = context.requestedSeatTarget || null;
      setRequestedSeatTarget(context.requestedSeatTarget || null);
    }
    if (context.discoveryPreferences) {
      discoveryPreferencesRef.current = context.discoveryPreferences;
      setDiscoveryPreferences(context.discoveryPreferences);
    }
    if (Array.isArray(context.plan)) planRef.current = context.plan;
    if (context.planContext) planContextRef.current = context.planContext;
    if (context.historyFilter) setHistoryFilter(context.historyFilter);
  };

  const sessionMatchesOrder = (session, order) => [session?.sessionId, ...(session?.sessionIds || [])]
    .filter(Boolean)
    .some((id) => String(id) === String(order?.sessionId));

  const revalidatePausedCheckout = async (snapshot) => {
    const checkout = activeCheckoutStage() || (snapshot?.order?.checkoutId ? { ...snapshot, view: "checkout" } : null);
    const order = pendingOrderRef.current;
    if (!checkout || !order?.checkoutId || checkout.order?.checkoutId !== order.checkoutId) {
      return { restored: false, validation: { session: false, availability: false, pricing: false }, reason: "checkout_identity_changed" };
    }
    let currentSessions;
    try {
      currentSessions = await vista.getSessions(order.cinemaId, order.movieId, order.programmingDate || order.sourceDate || order.date);
    } catch (error) {
      return { restored: false, validation: { session: false }, reason: error?.message || "session_revalidation_failed" };
    }
    const session = currentSessions.find((candidate) => sessionMatchesOrder(candidate, order));
    const sessionCurrent = session && filterCurrentSessions([{ ...session, date: session.date || order.programmingDate || order.date }]).available.length > 0;
    if (!sessionCurrent) {
      clearSeatSelection({ clearTarget: false });
      sessionsRef.current = filterCurrentSessions(currentSessions).available;
      sessionsFilmRef.current = String(order.movieId || "");
      const movie = checkout.movie || stageRef.current.movie || resolveFilm(order.movieId) || { id: order.movieId, title: order.movieTitle };
      showStage({ view: "showtimes", movie, sessions: sessionsRef.current, notice: localeRef.current === "ar" ? "لم يعد موعد العرض السابق متاحاً. اختر موعداً جديداً." : "The previous showtime is no longer available. Choose another showtime." });
      return { restored: false, validation: { session: false, availability: false, pricing: false }, reason: "showtime_unavailable" };
    }
    let plan;
    try {
      plan = await vista.getSeatPlan(order.cinemaId, order.sessionId);
    } catch (error) {
      return { restored: false, validation: { session: true, availability: false }, reason: error?.message || "seat_revalidation_failed" };
    }
    const allSeats = plan.flatMap((row) => row.seats || []);
    const selectedDetails = (order.seats || []).map((seatId) => allSeats.find((seat) => String(seat.id).toUpperCase() === String(seatId).toUpperCase())).filter(Boolean);
    const seatsAvailable = selectedDetails.length === (order.seats || []).length && selectedDetails.every((seat) => seat.status === 0);
    const movie = checkout.movie || stageRef.current.movie || resolveFilm(order.movieId) || { id: order.movieId, title: order.movieTitle };
    const planContext = { cinemaId: order.cinemaId, sessionId: order.sessionId, movieId: order.movieId, programmingDate: order.programmingDate || order.sourceDate || order.date };
    planRef.current = plan;
    planContextRef.current = planContext;
    if (!seatsAvailable) {
      clearPendingOrder();
      seatsRef.current = [];
      setSelectedSeats([]);
      setSeatQuote(null);
      showStage({ view: "seatmap", movie, session, plan, planMeta: vista.getResultMeta(plan) });
      say("system", localeRef.current === "ar" ? "تغير توفر المقاعد أثناء توقف الحجز. اختر مقاعد متاحة للمتابعة." : "Seat availability changed while the booking was paused. Choose available seats to continue.");
      return { restored: false, validation: { session: true, availability: false, pricing: false }, reason: "selected_seats_unavailable" };
    }
    let quote;
    try {
      quote = await vista.getPricingQuote(order.cinemaId, order.sessionId, selectedDetails);
    } catch (error) {
      showStage({ view: "seatmap", movie, session, plan, planMeta: vista.getResultMeta(plan) });
      say("system", localeRef.current === "ar" ? "تعذر تحديث السعر الآن. بقيت المقاعد محددة، فحاول المتابعة مرة أخرى." : "The price could not be refreshed. Your seats remain selected, so please try continuing again.");
      return { restored: false, validation: { session: true, availability: true, pricing: false }, reason: error?.message || "pricing_revalidation_failed" };
    }
    const total = Number(quote?.total);
    if (!Number.isFinite(total)) return { restored: false, validation: { session: true, availability: true, pricing: false }, reason: "pricing_unverified" };
    const updatedOrder = {
      ...order,
      showtime: session.time || order.showtime,
      experience: session.exp || order.experience,
      screen: session.screen || order.screen,
      seats: selectedDetails.map((seat) => seat.id),
      ticketQuantity: selectedDetails.length,
      subtotal: Number.isFinite(Number(quote.subtotal)) ? Number(quote.subtotal) : null,
      fees: Array.isArray(quote.fees) ? quote.fees : [],
      feeTotal: Number.isFinite(Number(quote.feeTotal)) ? Number(quote.feeTotal) : null,
      total,
      currency: quote.currency || order.currency || "AED",
      quoteId: quote.quoteId || null,
      pricingVerified: quote.verified === true,
      pricingMode: quote.demo === true ? "demo" : "live",
      transactionWarning: quote.warning || order.transactionWarning || null,
    };
    const quoteState = { seatKey: [...updatedOrder.seats].sort().join(","), loading: false, quote, error: null };
    pendingOrderRef.current = updatedOrder;
    setPendingOrder(updatedOrder);
    seatsRef.current = [...updatedOrder.seats];
    setSelectedSeats([...updatedOrder.seats]);
    setSeatQuote(quoteState);
    const nextCheckout = {
      ...checkout,
      view: "checkout",
      order: updatedOrder,
      movie,
      session,
      cinema: checkout.cinema || cinemaRef.current,
      scheduleDate: updatedOrder.programmingDate || updatedOrder.sourceDate || updatedOrder.date,
      selectedSeats: [...updatedOrder.seats],
      plan,
      planContext,
      planMeta: vista.getResultMeta(plan),
      seatQuote: quoteState,
    };
    checkoutStageRef.current = nextCheckout;
    showStage(nextCheckout);
    return { restored: true, validation: { session: true, availability: true, pricing: true }, stage: nextCheckout };
  };

  const restorePausedJourney = async ({ target = "last", source = "conversation" } = {}) => {
    restoredStageToolGuardRef.current = null;
    const requestedView = ["last", "journey"].includes(target) ? undefined : target;
    const entry = target === "journey"
      ? ["checkout", "seatmap", "showtimes", "movies"].map((view) => selectRestorableRichStage(pausedJourneyRef.current, { view })).find(Boolean) || null
      : selectRestorableRichStage(pausedJourneyRef.current, { view: requestedView });
    if (!entry && ["checkout", "journey"].includes(target) && activeCheckoutStage()) {
      const result = await revalidatePausedCheckout(activeCheckoutStage());
      if (result.restored) {
        renderTopicRef.current = "booking";
        restoredStageToolGuardRef.current = { view: "checkout", journeyId: bookingJourneyIdRef.current, restoredAt: Date.now() };
      }
      return result;
    }
    if (!entry) return { restored: false, reason: "nothing_to_restore", target };
    if (entry.view === "cancellation") {
      const snapshot = entry.snapshot;
      let refreshedBookings = [];
      let storageError = null;
      try {
        refreshedBookings = readBookings({ strict: true });
      } catch (error) {
        storageError = error;
      }
      const targetSelection = snapshot?.view === "history" && Array.isArray(snapshot.candidateRefs);
      if (targetSelection) {
        if (storageError) return { restored: false, reason: "booking_storage_unavailable", target: "cancellation", source };
        if (activeCancellationMutation() || cancellationFlowRef.current) {
          return { restored: false, reason: "another_cancellation_active", target: "cancellation", source };
        }
        const candidateRefs = new Set(snapshot.candidateRefs.map(norm));
        const currentCandidates = refreshedBookings.filter((item) => candidateRefs.has(norm(item.ref)) && isCurrentBooking(item));
        if (!currentCandidates.length) {
          const withoutSelection = invalidatePausedRichStage(pausedJourneyRef.current, {
            views: ["cancellation"],
            reason: "no_active_cancellation_candidates",
          });
          if (withoutSelection !== pausedJourneyRef.current) commitPausedJourney(withoutSelection);
          cancellationPausedRef.current = false;
          setHistoryFilter("active");
          setBookings([]);
          showStage({ view: "history", bookings: [] });
          return { restored: false, reason: "no_active_bookings", target: "cancellation", source };
        }
        const restored = restorePausedRichStage(pausedJourneyRef.current, {
          view: "cancellation",
          validation: { booking: true },
          sessionId: appConversationIdRef.current,
          journeyId: bookingJourneyIdRef.current,
        });
        commitPausedJourney(restored.model);
        if (!restored.stage) return { restored: false, reason: restored.plan.outcome, target: "cancellation", source };
        const targetStage = {
          ...restored.stage,
          view: "history",
          purpose: CANCELLATION_TARGET_SELECTION_PURPOSE,
          candidateRefs: currentCandidates.map((item) => item.ref),
          bookings: currentCandidates,
        };
        cancellationPausedRef.current = false;
        setCancellationFlow(null);
        setHistoryFilter("active");
        setBookings(currentCandidates);
        renderTopicRef.current = "booking_records";
        showStage(targetStage);
        restoredStageToolGuardRef.current = { view: "cancellation", journeyId: bookingJourneyIdRef.current, restoredAt: Date.now() };
        return { restored: true, revalidated: true, targetSelection: true, stage: targetStage, target: "cancellation", source };
      }
      const snapshotRef = snapshot?.booking?.ref
        || snapshot?.pausedContext?.booking?.ref
        || snapshot?.pausedContext?.cancellationFlow?.bookingRef
        || null;
      const refreshedBooking = refreshedBookings.find((item) => norm(item.ref) === norm(snapshotRef)) || null;
      const currentProviderBooking = norm(bookingRef.current?.ref) === norm(snapshotRef) ? bookingRef.current : null;
      const snapshotBooking = [snapshot?.booking, snapshot?.pausedContext?.booking]
        .find((item) => item?.ref && norm(item.ref) === norm(snapshotRef)) || null;
      const restorationBooking = refreshedBooking || currentProviderBooking || snapshotBooking;
      const restorationPlan = planPausedCancellationRestoration({
        snapshot,
        currentFlow: cancellationFlowRef.current,
        storedBooking: refreshedBooking,
        bookingIsCurrent: Boolean(refreshedBooking && isCurrentBooking(refreshedBooking)),
        currentBooking: currentProviderBooking,
        currentBookingIsCurrent: Boolean(currentProviderBooking && isCurrentBooking(currentProviderBooking)),
      });
      const invalidatePausedCancellation = (reason) => {
        const next = invalidatePausedRichStage(pausedJourneyRef.current, {
          views: ["cancellation"],
          reason,
        });
        if (next !== pausedJourneyRef.current) commitPausedJourney(next);
      };
      const restoreBookingWithoutConfirmation = (reason) => {
        invalidatePausedCancellation(reason);
        cancellationPausedRef.current = false;
        restoredStageToolGuardRef.current = null;
        if (!activeCancellationMutation()) dismissPendingCancellation(reason);
        const safeBooking = restorationBooking
          || (norm(bookingRef.current?.ref) === norm(snapshotRef) ? bookingRef.current : null);
        if (safeBooking?.ref) {
          bookingRef.current = safeBooking;
          setBooking(safeBooking);
          showStage({ view: "booking", booking: safeBooking });
        } else {
          showStage({ view: "empty" });
        }
        return {
          restored: false,
          reason: storageError ? "booking_storage_unavailable" : reason,
          target: "cancellation",
          bookingOnly: Boolean(safeBooking?.ref),
          source,
        };
      };

      if (restorationPlan.reason === "another_cancellation_active") {
        return { restored: false, reason: restorationPlan.reason, target: "cancellation", source };
      }
      if (restorationPlan.action === "booking_only") {
        return restoreBookingWithoutConfirmation(restorationPlan.reason);
      }

      if (restorationPlan.action === "reuse_current") {
        const restored = restorePausedRichStage(pausedJourneyRef.current, {
          view: "cancellation",
          validation: { booking: true },
          sessionId: appConversationIdRef.current,
          journeyId: bookingJourneyIdRef.current,
        });
        commitPausedJourney(restored.model);
        if (!restored.stage) return restoreBookingWithoutConfirmation(restored.plan.outcome);
        const synchronizedStage = {
          ...restored.stage,
          view: "booking",
          booking: restorationBooking,
          purpose: CANCELLATION_TARGET_SELECTION_PURPOSE,
          pausedContext: {
            ...restored.stage.pausedContext,
            booking: restorationBooking,
            cancellationFlow: { ...restorationPlan.flow },
          },
        };
        restorePausedSnapshotContext(synchronizedStage);
        cancellationPausedRef.current = false;
        renderTopicRef.current = "booking_records";
        showStage(synchronizedStage);
        if (["route_confirmation", "final_confirmation"].includes(restorationPlan.flow.phase)) {
          const resumed = resumeCancellationConfirmationTimer(restorationPlan.flow);
          if (resumed.status !== "armed") armCancellationConfirmationTimer(restorationPlan.flow);
        }
        restoredStageToolGuardRef.current = { view: "cancellation", journeyId: bookingJourneyIdRef.current, restoredAt: Date.now() };
        return { restored: true, revalidated: true, reusedActiveFlow: true, stage: synchronizedStage, target: "cancellation", source };
      }

      if (!dismissPendingCancellation("resume_cancellation_revalidation")) {
        return restoreBookingWithoutConfirmation("cancellation_processing");
      }
      invalidatePausedCancellation("resume_cancellation_revalidation");
      cancellationPausedRef.current = false;
      bookingRef.current = restorationBooking;
      setBooking(restorationBooking);
      showStage({ view: "booking", booking: restorationBooking });
      let result;
      try {
        const rawResult = await showBookingForAuthorizedCancellation(
          { bookingRef: restorationPlan.bookingRef },
          ["ui", "offers_back"].includes(source) ? "ui_action" : "direct_user_turn",
        );
        result = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
      } catch (error) {
        console.warn("Paused cancellation could not be revalidated", error);
        return restoreBookingWithoutConfirmation("cancellation_revalidation_failed");
      }
      const revalidatedFlow = cancellationFlowRef.current;
      if (!cancellationFlowMatchesBooking(revalidatedFlow, restorationPlan.bookingRef)) {
        return restoreBookingWithoutConfirmation(result?.reason || "cancellation_revalidation_failed");
      }
      const revalidatedBooking = norm(bookingRef.current?.ref) === norm(restorationPlan.bookingRef)
        ? bookingRef.current
        : restorationBooking;
      const revalidatedStage = {
        view: "booking",
        booking: revalidatedBooking,
        purpose: CANCELLATION_TARGET_SELECTION_PURPOSE,
      };
      cancellationPausedRef.current = false;
      renderTopicRef.current = "booking_records";
      showStage(revalidatedStage);
      if (["route_confirmation", "final_confirmation"].includes(revalidatedFlow.phase)) {
        armCancellationConfirmationTimer(revalidatedFlow);
      }
      restoredStageToolGuardRef.current = { view: "cancellation", journeyId: bookingJourneyIdRef.current, restoredAt: Date.now() };
      return { restored: true, revalidated: true, result, stage: revalidatedStage, target: "cancellation", source };
    }
    if (entry.view === "checkout") {
      const result = await revalidatePausedCheckout(entry.snapshot);
      const restored = restorePausedRichStage(pausedJourneyRef.current, {
        view: "checkout",
        validation: result.validation,
        sessionId: appConversationIdRef.current,
        journeyId: bookingJourneyIdRef.current,
      });
      commitPausedJourney(restored.model);
      if (result.restored) {
        renderTopicRef.current = "booking";
        restoredStageToolGuardRef.current = { view: "checkout", journeyId: bookingJourneyIdRef.current, restoredAt: Date.now() };
      }
      return { ...result, target: "checkout", source };
    }

    const snapshot = entry.snapshot;
    const validation = {};
    if (["showtimes", "seatmap"].includes(entry.view)) {
      const sessionSource = entry.view === "showtimes" ? snapshot.sessions || [] : [snapshot.session].filter(Boolean);
      validation.session = entry.view === "showtimes"
        ? filterCurrentSessions(sessionSource).available.length > 0
        : filterCurrentSessions(sessionSource.map((session) => ({ ...session, date: session.date || snapshot.pausedContext?.scheduleDate }))).available.length > 0;
      if (entry.view === "seatmap") {
        try {
          const plan = await vista.getSeatPlan(snapshot.pausedContext?.cinema?.id || cinemaRef.current?.id, snapshot.session?.sessionId);
          const selected = snapshot.pausedContext?.selectedSeats || [];
          const allSeats = plan.flatMap((row) => row.seats || []);
          validation.availability = selected.every((seatId) => allSeats.some((seat) => String(seat.id).toUpperCase() === String(seatId).toUpperCase() && seat.status === 0));
          if (validation.availability) {
            snapshot.plan = plan;
            snapshot.planMeta = vista.getResultMeta(plan);
            snapshot.pausedContext.plan = plan;
          }
        } catch {
          validation.availability = false;
        }
      }
    }
    if (["history", "booking", "cancellation"].includes(entry.view)) {
      const refreshedBookings = readBookings();
      const candidateRefs = Array.isArray(snapshot.candidateRefs) ? snapshot.candidateRefs : [];
      const refreshedCandidates = candidateRefs.filter((candidateRef) => (
        refreshedBookings.some((item) => norm(item.ref) === norm(candidateRef) && isCurrentBooking(item))
      ));
      if (candidateRefs.length) snapshot.candidateRefs = refreshedCandidates;
      validation.booking = entry.view === "history"
        || (entry.view === "cancellation" && refreshedCandidates.length > 0)
        || Boolean(refreshedBookings.find((item) => norm(item.ref) === norm(snapshot.booking?.ref || snapshot.pausedContext?.booking?.ref)) || bookingRef.current?.ref);
      if (["history", "cancellation"].includes(entry.view)) {
        const visibleRefs = entry.view === "cancellation" && refreshedCandidates.length ? new Set(refreshedCandidates.map(norm)) : null;
        setBookings(refreshedBookings.filter((item) => (
          (!visibleRefs || visibleRefs.has(norm(item.ref)))
          && (historyFilter !== "active" || isCurrentBooking(item))
        )));
      }
      const refreshedBooking = refreshedBookings.find((item) => norm(item.ref) === norm(snapshot.booking?.ref || snapshot.pausedContext?.booking?.ref));
      if (refreshedBooking) {
        snapshot.booking = refreshedBooking;
        snapshot.pausedContext.booking = refreshedBooking;
      }
    }
    const restored = restorePausedRichStage(pausedJourneyRef.current, {
      view: entry.view,
      validation,
      sessionId: appConversationIdRef.current,
      journeyId: bookingJourneyIdRef.current,
    });
    commitPausedJourney(restored.model);
    if (!restored.stage) return { restored: false, reason: restored.plan.outcome, failed: restored.plan.failed, target: entry.view };
    restorePausedSnapshotContext(restored.stage);
    renderTopicRef.current = ["history", "booking", "cancellation"].includes(entry.view) ? "booking_records" : "booking";
    showStage(restored.stage);
    restoredStageToolGuardRef.current = { view: entry.view, journeyId: bookingJourneyIdRef.current, restoredAt: Date.now() };
    return { restored: true, stage: restored.stage, target: entry.view, source };
  };

  const pausedRestoreContext = (result) => {
    if (result?.restored) {
      const validation = result.validation
        ? ` Revalidation: session ${result.validation.session === true ? "current" : "not required"}, seats ${result.validation.availability === true ? "available" : "not required"}, pricing ${result.validation.pricing === true ? "refreshed" : "not required"}.`
        : "";
      return `The widget restored the paused ${result.target || result.stage?.view || "booking"} step.${validation} Continue from the visible panel without restarting the journey or repeating completed questions.`;
    }
    if (result?.reason === "showtime_unavailable") return "The old showtime is no longer available. The widget displayed current showtimes and cleared incompatible seat and checkout state. Ask the guest to choose another showtime.";
    if (result?.reason === "selected_seats_unavailable") return "The selected seats are no longer available. The widget displayed the refreshed seat map and cleared the old checkout. Ask the guest to select available seats.";
    return `The requested paused step could not be restored (${result?.reason || "nothing_to_restore"}). Do not claim that an old panel is visible. Ask the guest what they would like to do next.`;
  };

  const abandonActiveBookingJourney = (reason = "guest_cancelled_active_journey") => {
    if (checkoutPaymentActiveRef.current || activeCancellationMutation()) return false;
    clearSeatSelection({ clearTarget: true });
    bookingRef.current = null;
    bookingOpenedFromHistoryRef.current = false;
    setBooking(null);
    cinemaRef.current = null;
    setCinema(null);
    discoveryPreferencesRef.current = createDiscoveryPreferences();
    setDiscoveryPreferences(discoveryPreferencesRef.current);
    filmsRef.current = [];
    filmsCinemaRef.current = "";
    filmsDateRef.current = "";
    sessionsRef.current = [];
    sessionsFilmRef.current = "";
    planRef.current = [];
    planContextRef.current = null;
    clearPausedJourneyForLifecycle("cancelled", reason);
    renderTopicRef.current = "general_enquiry";
    showStage({ view: "empty" });
    journeyRef.current = { ...journeyRef.current, intent: "general_enquiry", cinema: null, movie: null, session: null, selectedSeats: [] };
    dispatchJourney({ type: "intent", intent: "general_enquiry" });
    return true;
  };

  const beginReplacementBookingJourney = (reason = "new_booking_replaced_previous") => {
    const hasPreviousJourney = Boolean(
      pendingOrderRef.current?.checkoutId
      || seatsRef.current.length
      || bookingRef.current?.ref
      || richJourneyViewFromStage(stageRef.current)
      || selectRestorableRichStage(pausedJourneyRef.current),
    );
    if (!hasPreviousJourney) {
      renderTopicRef.current = "booking";
      return false;
    }
    replacePausedJourneyForNewBooking(reason);
    clearSeatSelection({ clearTarget: true });
    bookingRef.current = null;
    bookingOpenedFromHistoryRef.current = false;
    setBooking(null);
    historyReturnRef.current = null;
    historyContextRef.current = null;
    offersReturnRef.current = null;
    return true;
  };

  const seatConfirmationKey = (seatIds) => [
    cinemaRef.current?.id || "",
    stageRef.current.session?.sessionId || "",
    [...(seatIds || [])].sort().join(","),
  ].join("|");

  const priceSeatSelection = (seatIds) => {
    const key = seatConfirmationKey(seatIds);
    const existing = seatConfirmationInFlightRef.current.get(key);
    if (existing) return existing;
    let trackedPromise;
    trackedPromise = Promise.resolve()
      .then(() => finalizeSeats(seatIds))
      .finally(() => {
        if (seatConfirmationInFlightRef.current.get(key) === trackedPromise) {
          seatConfirmationInFlightRef.current.delete(key);
        }
      });
    seatConfirmationInFlightRef.current.set(key, trackedPromise);
    return trackedPromise;
  };

  const handlePaid = async ({ label, checkoutId }) => {
    const order = pendingOrderRef.current;
    if (!order || checkoutId !== order.checkoutId) return;
    if (!filterCurrentSessions([{ date: order.programmingDate || order.date, time: order.showtime }]).available.length) {
      checkoutPaymentActiveRef.current = false;
      const currentMovie = stageRef.current.movie;
      const currentSessions = filterCurrentSessions(sessionsRef.current).available;
      clearSeatSelection();
      say("system", localeRef.current === "ar" ? "انتهى موعد العرض قبل إتمام العملية، لذلك لم يتم حفظ الحجز. اختر موعداً مستقبلياً." : "The showtime started before completion, so no booking was saved. Choose a future showtime.");
      showStage({ view: "showtimes", movie: currentMovie, sessions: currentSessions });
      return false;
    }
    const paymentSessionEpoch = sessionEpochRef.current;
    const paymentStageRevision = stageRevisionRef.current;
    const ref = `WL${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const completed = {
      ...order,
      ref,
      paidWith: label,
      cancelled: false,
      demo: true,
      verified: false,
      paymentStatus: "simulated_not_charged",
      bookingStatus: "summary_saved",
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    };
    let persistenceFailure = null;
    try {
      const storageLock = await withCancellationMutationLock(
        typeof navigator !== "undefined" ? navigator.locks : null,
        () => {
          if (!deviceSessionIsCurrent()) return { saved: false, reason: "stale_device_session" };
          if (!filterCurrentSessions([{ date: order.programmingDate || order.date, time: order.showtime }]).available.length) {
            return { saved: false, reason: "showtime_expired" };
          }
          if (sessionEpochRef.current !== paymentSessionEpoch
            || stageRevisionRef.current !== paymentStageRevision
            || pendingOrderRef.current?.checkoutId !== checkoutId
            || stageRef.current.view !== "checkout"
            || stageRef.current.order?.checkoutId !== checkoutId) {
            return { saved: false, reason: "stale_checkout" };
          }
          appendBooking(completed);
          return { saved: true, reason: null };
        },
      );
      if (!storageLock.acquired || !storageLock.result?.saved) {
        persistenceFailure = storageLock.reason || storageLock.result?.reason || "booking_storage_busy";
      }
    } catch (error) {
      persistenceFailure = error;
    }
    if (persistenceFailure) {
      if (String(persistenceFailure) === "showtime_expired") {
        checkoutPaymentActiveRef.current = false;
        const currentMovie = stageRef.current.movie;
        const currentSessions = filterCurrentSessions(sessionsRef.current).available;
        clearSeatSelection();
        showStage({ view: "showtimes", movie: currentMovie, sessions: currentSessions });
        say("system", localeRef.current === "ar" ? "انتهى موعد العرض قبل حفظ الحجز، ولم يتم تحصيل أي مبلغ." : "The showtime started before the booking could be saved. No payment was taken.");
        return false;
      }
      if (["stale_checkout", "stale_device_session"].includes(String(persistenceFailure))) {
        checkoutPaymentActiveRef.current = false;
        const staleReason = String(persistenceFailure);
        if (staleReason === "stale_checkout"
          && deviceSessionIsCurrent()
          && pendingOrderRef.current?.checkoutId === checkoutId) {
          restoreActiveCheckout();
        }
        say("system", localeRef.current === "ar"
          ? "تغيرت جلسة الدفع قبل حفظ ملخص الحجز. لم يتم تحصيل أي مبلغ. راجع الخطوة الظاهرة على الشاشة ثم حاول مرة أخرى."
          : "The checkout session changed before the booking summary could be saved. No payment was taken. Review the step shown on screen, then try again.");
        conversation.sendContextualUpdate?.(`The checkout completion was rejected as ${staleReason}. No payment was charged and no booking summary was saved. Keep the current authoritative panel visible and do not claim payment, reservation, booking confirmation, a reference, or a QR.`);
        return false;
      }
      const retryOrder = { ...order, checkoutId: `checkout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
      const retryStage = { ...checkoutStageRef.current, view: "checkout", order: retryOrder };
      pendingOrderRef.current = retryOrder;
      setPendingOrder(retryOrder);
      checkoutPaymentActiveRef.current = false;
      checkoutStageRef.current = retryStage;
      showStage(retryStage);
      say("system", localeRef.current === "ar"
        ? "تعذر حفظ ملخص الحجز على هذا الجهاز. لم يتم تحصيل أي مبلغ."
        : "The booking summary could not be saved on this device. No payment was taken.");
      return false;
    }
    setBookings(readBookings());
    bookingRef.current = completed;
    bookingOpenedFromHistoryRef.current = false;
    checkoutPaymentActiveRef.current = false;
    clearPendingOrder();
    requestedSeatTargetRef.current = null;
    setRequestedSeatTarget(null);
    setBooking(completed);
    showStage({ view: "booking", booking: completed });
    clearPausedJourneyForLifecycle("completed", "booking_completed");
    say("system", t("app.paymentSimulated", { method: label, ref }));
    resetClarificationFailures();
    conversation.sendContextualUpdate?.(`The widget saved a non-verified booking summary with reference ${ref} for ${order.movieTitle} at ${order.cinemaName} on ${order.performanceDate || order.date} ${order.showtime}, seats ${order.seats.join(", ")}, total ${order.currency || "AED"} ${order.total}. ${label} was selected on the review card, but no payment was charged and no VOX inventory was reserved. The deterministic system notice already states this outcome, so do not add another completion response. Never describe this summary as confirmed, paid, reserved, an admission ticket, or a ready QR.`);
    return true;
  };

  /* ========================================================================
   * CLIENT TOOLS: the six original names stay unchanged. show_seat_map is
   * non-blocking and select_seats remains the only voice seat-confirmation
   * path. Phase C and D append show_offers and handover_to_agent.
   * ====================================================================== */
  const clientTools = {
    show_movie_selection: async ({ cinemaId, cinemaName, date, displayDate, scheduleDate: toolDate } = {}) => {
      const pausedTopicGuard = preservePausedTopicForTool("show_movie_selection");
      if (pausedTopicGuard) return pausedTopicGuard;
      const cancellationGuard = preserveActiveCancellationForTool("show_movie_selection");
      if (cancellationGuard) return cancellationGuard;
      const checkoutGuard = preserveActiveCheckoutForTool("show_movie_selection");
      if (checkoutGuard) return checkoutGuard;
      dismissPendingCancellation("new_journey");
      const requested = resolveCinema(cinemaId) || resolveCinema(cinemaName);
      const target = requested || cinemaRef.current;
      if ((cinemaId || cinemaName) && !requested) {
        return JSON.stringify({ shown: false, reason: `No matching VOX Cinemas UAE location was found for ${cinemaName || cinemaId}. Ask the guest to choose from the cinema picker.` });
      }
      if (!target) {
        cinemaReturnRef.current = { view: "empty" };
        clearSeatSelection();
        const filteredCinemas = filterDiscoveryResults({ cinemas: CINEMAS, preferences: discoveryPreferencesRef.current }).cinemas;
        showStage({ view: "cinemas", cinemas: filteredCinemas, notice: discoveryQuestion(["cinema"]), preferences: discoveryPreferencesRef.current });
        resetClarificationFailures();
        return JSON.stringify({
          shown: "cinema picker",
          cinemas: filteredCinemas.map((item) => ({ id: item.id, name: item.name })),
          retainedPreferences: discoveryPreferencesRef.current,
          instruction: "Ask only for the missing VOX Cinemas UAE location. Retain every movie, date, time, genre, language, experience, and audience preference already supplied.",
        });
      }
      const availableDates = programmingDatesForCinema(target);
      const requestedDateText = toolDate || displayDate || date || discoveryPreferencesRef.current.date;
      if (!requestedDateText) {
        cinemaRef.current = target;
        setCinema(target);
        const preferences = commitDiscoveryPreferences({ patch: { cinemaId: target.id, cinemaName: target.name } }).preferences;
        return JSON.stringify(showDiscoveryPrompt(["date"], preferences));
      }
      const dateDecision = resolveClientToolProgrammingDate(requestedDateText, availableDates);
      if (dateDecision.blocked) {
        return JSON.stringify({ shown: false, requestedDate: dateDecision.unavailableDate, availableDates, reason: `No published programming is available for ${dateDecision.unavailableDate} at ${target.name}. Do not substitute another date; ask the guest to choose one of the published dates.` });
      }
      const requestedDate = dateDecision.date;
      if (!requestedDate) {
        return JSON.stringify({ shown: false, cinema: { id: target.id, name: target.name }, availableDates, reason: "No future programming dates are published for this cinema." });
      }
      const preferences = commitDiscoveryPreferences({ patch: {
        cinemaId: target.id,
        cinemaName: target.name,
        date: requestedDate,
        dateSignal: dateDecision.source || discoveryPreferencesRef.current.dateSignal || "explicit",
      } }).preferences;
      if (target.id !== cinemaRef.current?.id) {
        cinemaRef.current = target;
        setCinema(target);
        filmsRef.current = [];
        filmsCinemaRef.current = "";
        filmsDateRef.current = "";
        sessionsRef.current = [];
        sessionsFilmRef.current = "";
      }
      if (requestedDate !== scheduleDateRef.current) applyProgrammingDate(requestedDate, "tool_date_changed", availableDates);
      clearSeatSelection();
      const missing = discoveryMissingCriteria(preferences).filter((item) => item !== "cinema" && item !== "date");
      if (missing.length) return JSON.stringify(showDiscoveryPrompt(missing, preferences));
      return JSON.stringify(await loadDiscoveryForCinema(target, requestedDate, preferences));
    },

    show_showtimes: async ({ movieId, movieTitle, date, displayDate, scheduleDate: toolDate } = {}) => {
      const pausedTopicGuard = preservePausedTopicForTool("show_showtimes");
      if (pausedTopicGuard) return pausedTopicGuard;
      const cancellationGuard = preserveActiveCancellationForTool("show_showtimes");
      if (cancellationGuard) return cancellationGuard;
      const checkoutGuard = preserveActiveCheckoutForTool("show_showtimes");
      if (checkoutGuard) return checkoutGuard;
      dismissPendingCancellation("new_journey");
      if (!cinemaRef.current) {
        showStage({ view: "cinemas" });
        return JSON.stringify({ shown: false, reason: "A VOX Cinemas UAE location must be selected first. The cinema picker is displayed." });
      }
      const cinemaId = cinemaRef.current.id;
      const availableDates = programmingDatesForCinema(cinemaId);
      const requestedDateText = toolDate || displayDate || date;
      const hasRequestedMovie = Boolean(movieId || movieTitle);
      const visibleMovie = resolveFilm(movieId) || resolveFilm(movieTitle);
      const hasVisibleSelection = Boolean(
        hasRequestedMovie
        && visibleMovie
        && filmsCinemaRef.current === cinemaId
        && filmsDateRef.current,
      );
      const dateDecision = resolveVisibleSelectionProgrammingDate({
        availableDates,
        userRequestedDate: userRequestedDateRef.current,
        toolRequestedDate: requestedDateText,
        selectedDate: scheduleDateRef.current,
        visibleDate: filmsDateRef.current,
        hasVisibleSelection,
      });
      if (dateDecision.blocked) return JSON.stringify({ shown: false, requestedDate: dateDecision.unavailableDate, availableDates, reason: `No published programming is available for ${dateDecision.unavailableDate} at ${cinemaRef.current.name}. Do not substitute another date; ask the guest to choose one of the published dates.` });
      const requestedDate = dateDecision.date;
      if (!requestedDate) return JSON.stringify({ shown: false, availableDates, reason: "No future programming dates are published for this cinema." });
      if (requestedDate !== scheduleDateRef.current) applyProgrammingDate(requestedDate, "tool_date_changed", availableDates);
      clearSeatSelection();
      const epoch = beginAsyncRequest();
      const revision = stageRevisionRef.current;
      try {
        await ensureFilms(cinemaId, requestedDate);
      } catch (error) {
        return JSON.stringify({ shown: false, reason: error?.message || "Movie results could not be loaded." });
      }
      if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return JSON.stringify({ shown: false, reason: "The cinema, date, or active task changed while showtimes were loading." });
      const currentSelectedMovie = ["showtimes", "seatmap"].includes(stageRef.current.view)
        ? stageRef.current.movie
        : null;
      const movie = (hasVisibleSelection && filmsDateRef.current === requestedDate ? visibleMovie : null)
        || resolveFilm(movieId)
        || resolveFilm(movieTitle)
        || (!hasRequestedMovie ? currentSelectedMovie : null);
      if (!movie) return JSON.stringify({ shown: false, movieSelected: false, reason: hasRequestedMovie
        ? `No matching movie was found for ${movieTitle || movieId}. Ask the guest to choose a title from the displayed movie list.`
        : "No movie has been selected. A generic reference does not identify a title; ask the guest to say or tap one exact displayed movie. Do not claim a choice or showtime." });
      let sessions;
      try {
        sessions = await vista.getSessions(cinemaId, movie.id, requestedDate);
      } catch (error) {
        console.error("VOXi showtime request failed", {
          operation: "getSessions",
          cinemaId,
          movieId: movie.id,
          programmingDate: requestedDate,
          code: error?.code || null,
          status: error?.status || null,
        });
        if (requestIsCurrent(epoch, revision, cinemaId, requestedDate)) {
          showStage({ view: "showtimes", movie, sessions: [], error: loadingErrorMessage("showtimes"), retryAvailable: true });
        }
        return JSON.stringify({ shown: false, reason: error?.message || "Showtimes could not be loaded.", retryAvailable: true });
      }
      if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return JSON.stringify({ shown: false, reason: "The cinema, date, movie, or active task changed while showtimes were loading." });
      const availability = filterCurrentSessions(sessions.map((session) => ({ ...session, cinemaId, scheduledFilmId: movie.id, movieId: movie.id })));
      const preferences = commitDiscoveryPreferences({ patch: { movieId: movie.id, movieTitle: movie.title, cinemaId, cinemaName: cinemaRef.current.name, date: requestedDate } }).preferences;
      const filtered = filterDiscoveryResults({ movies: [movie], sessions: availability.available, cinemas: CINEMAS, preferences });
      sessions = filtered.sessions;
      sessionsRef.current = sessions;
      sessionsFilmRef.current = movie.id;
      clearPendingOrder();
      const notice = filtered.time.usedNearestFallback
        ? (localeRef.current === "ar" ? `لا يوجد عرض عند ${filtered.time.requestedTime}. هذه أقرب الأوقات المناسبة.` : `No exact ${filtered.time.requestedTime} showtime is available. These are the closest suitable times.`)
        : null;
      showStage({ view: "showtimes", movie, sessions, notice, expiredSessionCount: availability.expired.length });
      resetClarificationFailures();
      return JSON.stringify({
        movie: movie.title,
        cinema: cinemaRef.current.name,
        date: requestedDate,
        showtimes: sessions.map((session) => ({ sessionId: session.sessionId, time: session.time, experience: session.exp, screen: session.screen, language: movie.language, seatsAvailable: session.seatsAvailable })),
        time: filtered.time,
        expiredSessionCount: availability.expired.length,
      });
    },

    show_seat_map: async ({ movieTitle, sessionId, showtime, ticketQuantity: requestedQuantity, date, displayDate, scheduleDate: toolDate } = {}) => {
      const pausedTopicGuard = preservePausedTopicForTool("show_seat_map");
      if (pausedTopicGuard) return pausedTopicGuard;
      const cancellationGuard = preserveActiveCancellationForTool("show_seat_map");
      if (cancellationGuard) return cancellationGuard;
      const checkoutGuard = preserveActiveCheckoutForTool("show_seat_map");
      if (checkoutGuard) return checkoutGuard;
      dismissPendingCancellation("new_journey");
      if (!cinemaRef.current) {
        showStage({ view: "cinemas" });
        return JSON.stringify({ shown: false, reason: "A VOX Cinemas UAE location must be selected first. The cinema picker is displayed." });
      }
      const cinemaId = cinemaRef.current.id;
      const availableDates = programmingDatesForCinema(cinemaId);
      const requestedDateText = toolDate || displayDate || date;
      const current = stageRef.current;
      const visibleMovie = resolveFilm(movieTitle) || (!movieTitle ? current.movie : null);
      const hasVisibleSelection = Boolean(
        visibleMovie
        && filmsCinemaRef.current === cinemaId
        && filmsDateRef.current
        && ["showtimes", "seatmap"].includes(current.view),
      );
      const dateDecision = resolveVisibleSelectionProgrammingDate({
        availableDates,
        userRequestedDate: userRequestedDateRef.current,
        toolRequestedDate: requestedDateText,
        selectedDate: scheduleDateRef.current,
        visibleDate: filmsDateRef.current,
        hasVisibleSelection,
      });
      if (dateDecision.blocked) return JSON.stringify({ shown: false, requestedDate: dateDecision.unavailableDate, availableDates, reason: `No published programming is available for ${dateDecision.unavailableDate} at ${cinemaRef.current.name}. Do not substitute another date; ask the guest to choose one of the published dates.` });
      const requestedDate = dateDecision.date;
      if (!requestedDate) return JSON.stringify({ shown: false, availableDates, reason: "No future programming dates are published for this cinema." });
      if (requestedDate !== scheduleDateRef.current) applyProgrammingDate(requestedDate, "tool_date_changed", availableDates);
      if (requestedQuantity != null) {
        const target = Math.max(1, Math.min(MAX_TICKETS, Math.trunc(Number(requestedQuantity)) || 1));
        requestedSeatTargetRef.current = target;
        setRequestedSeatTarget(target);
      }
      const sameVisibleSessionRequest = ["seatmap", "checkout"].includes(current.view)
        && (!movieTitle || norm(current.movie?.title) === norm(movieTitle) || norm(current.order?.movieTitle) === norm(movieTitle))
        && (!sessionId || String(current.session?.sessionId || current.order?.sessionId) === String(sessionId))
        && (!showtime || norm(current.session?.time || current.order?.showtime) === norm(showtime))
        && requestedDate === scheduleDateRef.current;
      if (current.view === "checkout" && sameVisibleSessionRequest && pendingOrderRef.current?.checkoutId) {
        return JSON.stringify({ shown: "checkout", alreadyShown: true, requestedSeatTarget: requestedSeatTargetRef.current, seats: pendingOrderRef.current.seats, instruction: "Checkout is already displayed. Do not reopen or clear the seat map." });
      }
      if (!sameVisibleSessionRequest) clearSeatSelection();
      const epoch = beginAsyncRequest();
      const revision = stageRevisionRef.current;
      try {
        await ensureFilms(cinemaId, requestedDate);
      } catch (error) {
        return JSON.stringify({ shown: false, reason: error?.message || "Movie results could not be loaded." });
      }
      if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return JSON.stringify({ shown: false, reason: "The cinema, date, or active task changed while the seat map was loading." });
      const movie = (hasVisibleSelection && filmsDateRef.current === requestedDate ? visibleMovie : null)
        || resolveFilm(movieTitle)
        || (!movieTitle ? current.movie : null);
      if (!movie) return JSON.stringify({ shown: false, reason: `No matching movie was found for ${movieTitle}. Ask the guest to choose a title from the displayed movie list.` });
      let sessions = sessionsRef.current;
      if (!sessions.length || sessionsFilmRef.current !== movie?.id) {
        try {
          sessions = movie ? await vista.getSessions(cinemaId, movie.id, requestedDate) : [];
        } catch (error) {
          return JSON.stringify({ shown: false, reason: error?.message || "Showtimes could not be loaded." });
        }
        if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return JSON.stringify({ shown: false, reason: "The cinema, date, movie, or active task changed while the seat map was loading." });
        sessionsRef.current = sessions;
        sessionsFilmRef.current = movie?.id || "";
      }
      const availability = filterCurrentSessions(sessions.map((item) => ({ ...item, cinemaId, scheduledFilmId: movie.id, movieId: movie.id })));
      sessions = filterDiscoveryResults({ movies: [movie], sessions: availability.available, cinemas: CINEMAS, preferences: discoveryPreferencesRef.current }).sessions;
      sessionsRef.current = sessions;
      const resolution = resolveSession(sessions, sessionId, showtime);
      const session = resolution.session;
      if (!session) {
        const options = resolution.matches.map((item) => ({ sessionId: item.sessionId, time: item.time, experience: item.exp, screen: item.screen }));
        return JSON.stringify({
          shown: false,
          reason: resolution.reason === "ambiguous"
            ? `More than one session starts at ${showtime}. Ask the guest to choose an experience, then use its sessionId.`
            : `No current, bookable session was found for ${showtime || sessionId || "the requested showtime"}. Ask the guest to choose one of the displayed showtimes.`,
          options,
          expiredSessionCount: availability.expired.length,
        });
      }
      if (sameVisibleSessionRequest && current.view === "seatmap" && planRef.current.length
        && planContextRef.current?.cinemaId === cinemaId
        && String(planContextRef.current?.sessionId) === String(session.sessionId)) {
        const available = planRef.current.flatMap((row) => row.seats).filter((seat) => seat.status === 0).map((seat) => seat.id);
        return JSON.stringify({
          shown: "seat map",
          alreadyShown: true,
          availableSeats: available,
          selectedSeats: seatsRef.current,
          requestedSeatTarget: requestedSeatTargetRef.current,
          instruction: "The same seat map is already visible. Preserve tapped seats and guide the guest toward their requested target without reopening the map.",
        });
      }
      let plan;
      try {
        plan = await vista.getSeatPlan(cinemaId, session.sessionId);
      } catch (error) {
        return JSON.stringify({ shown: false, reason: error?.message || "The seat map could not be loaded." });
      }
      if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return JSON.stringify({ shown: false, reason: "The cinema, date, showtime, or active task changed while the seat map was loading." });
      const planMeta = vista.getResultMeta(plan);
      planRef.current = plan;
      planContextRef.current = { cinemaId, sessionId: session.sessionId };
      clearPendingOrder();
      showStage({ view: "seatmap", movie, session, plan, planMeta });
      resetClarificationFailures();
      const available = plan.flatMap((row) => row.seats).filter((seat) => seat.status === 0).map((seat) => seat.id);
      return JSON.stringify({
        shown: "seat map",
        availableSeats: available,
        dataMode: planMeta?.mode || null,
        inventoryVerified: planMeta?.verified === true,
        inventoryMismatch: planMeta?.inventoryMismatch === true,
        warning: planMeta?.warning || null,
        requestedSeatTarget: requestedSeatTargetRef.current,
        instruction: requestedSeatTargetRef.current
          ? `The guest's conversational target is ${requestedSeatTargetRef.current} seats. Guide them to choose that many, but the selected seats are the only source of ticket count and price. When they answer, call select_seats with those labels. They may also tap the map.`
          : "Ask the guest which seats they'd like. The selected seats determine the ticket count and price. When they answer, call select_seats with those seat labels. They may also tap the map.",
      });
    },

    select_seats: async ({ seats } = {}) => {
      const pausedTopicGuard = preservePausedTopicForTool("select_seats");
      if (pausedTopicGuard) return pausedTopicGuard;
      const cancellationGuard = preserveActiveCancellationForTool("select_seats");
      if (cancellationGuard) return cancellationGuard;
      const availableSeatIds = (planRef.current || [])
        .flatMap((row) => row.seats || [])
        .filter((seat) => seat.status === 0)
        .map((seat) => seat.id);
      const seatInput = resolveSeatToolInput(seats, { availableSeatIds, currentSeats: seatsRef.current });
      const { provided: seatArgumentProvided, seats: ids, invalidSeats } = seatInput;
      if (invalidSeats.length) {
        return JSON.stringify({
          confirmed: false,
          invalidSeats,
          reason: `These seats are invalid or unavailable: ${invalidSeats.join(", ")}. Ask the guest to choose only available seats shown on the map.`,
        });
      }
      const activeOrder = pendingOrderRef.current;
      if (activeOrder?.checkoutId) {
        if (stageRef.current.view !== "checkout") restoreActiveCheckout();
        const matchesActiveOrder = (!seatArgumentProvided && !ids.length)
          || sameSeatSelection(ids, activeOrder.seats || []);
        return JSON.stringify(matchesActiveOrder
          ? {
            confirmed: true,
            alreadyConfirmed: true,
            seats: activeOrder.seats,
            total: activeOrder.total,
            currency: activeOrder.currency || "AED",
            next: "Checkout is already displayed. Ask the guest to complete payment on screen. Do not call select_seats again.",
          }
          : {
            confirmed: false,
            reason: "Checkout is already displayed for different seats. Ask the guest to use Edit seats before changing seats.",
          });
      }
      const result = await priceSeatSelection(ids);
      if (result.stale) {
        const completedOrder = pendingOrderRef.current;
        const matchingCheckoutIsVisible = stageRef.current.view === "checkout"
          && stageRef.current.order?.checkoutId === completedOrder?.checkoutId;
        if (matchingCheckoutIsVisible && completedOrder?.checkoutId && sameSeatSelection(ids, completedOrder.seats || [])) {
          return JSON.stringify({
            confirmed: true,
            alreadyConfirmed: true,
            seats: completedOrder.seats,
            total: completedOrder.total,
            currency: completedOrder.currency || "AED",
            next: "Checkout is already displayed. Ask the guest to complete payment on screen. Do not call select_seats again.",
          });
        }
        const currentView = stageRef.current.view;
        return JSON.stringify({
          confirmed: false,
          stale: true,
          currentView,
          reason: currentView === "seatmap"
            ? "The seat selection changed while pricing was loading. Use the seats currently shown in the widget and try again."
            : `Seat confirmation stopped because the widget moved to ${currentView}. Continue from the panel currently displayed.`,
        });
      }
      if (!result.valid.length) {
        const reason = result.reason === "ticket_limit"
          ? `A booking can contain at most ${MAX_TICKETS} tickets.`
          : result.reason === "showtime_expired"
            ? "That showtime has already started and is no longer bookable. Return to showtimes and choose a future session."
          : result.reason === "pricing_unavailable"
              ? `Pricing could not be verified: ${result.detail || "try again"}. Do not continue to checkout.`
              : "None of those seats are available. Ask the guest to choose from the available seats shown on the map.";
        return JSON.stringify({ confirmed: false, reason });
      }
      const dropped = ids.filter((id) => !result.valid.includes(id));
      return JSON.stringify({
        confirmed: true,
        seats: result.valid,
        total: result.total,
        currency: "AED",
        pricingVerified: result.quote?.verified === true,
        simulationOnly: result.quote?.demo === true,
        next: "Checkout is displayed. Ask the guest to complete payment on screen. Do not ask for card details by voice.",
        note: dropped.length ? `Unavailable and skipped: ${dropped.join(", ")}` : undefined,
      });
    },

    show_booking_summary: ({ movieTitle, screen, showtime, seats, ref, total } = {}) => {
      const pausedTopicGuard = preservePausedTopicForTool("show_booking_summary");
      if (pausedTopicGuard) return pausedTopicGuard;
      const cancellationGuard = preserveActiveCancellationForTool("show_booking_summary");
      if (cancellationGuard) return cancellationGuard;
      const checkoutGuard = preserveActiveCheckoutForTool("show_booking_summary");
      if (checkoutGuard) return checkoutGuard;
      dismissPendingCancellation("booking_summary");
      const storedRecord = findBooking(ref);
      const activeRecord = bookingRef.current?.ref && norm(bookingRef.current.ref) === norm(ref) ? bookingRef.current : null;
      const displayed = storedRecord || activeRecord;
      if (!displayed) {
        return JSON.stringify({ shown: false, verified: false, bookingRef: ref || null, reason: "No matching locally stored or active booking was found for that reference. Ask the guest to check it." });
      }
      const film = resolveFilm(movieTitle || displayed?.movieTitle);
      const performanceDate = displayed.performanceDate || displayed.sourceDate || displayed.date || null;
      const withTint = {
        ...displayed,
        date: performanceDate,
        performanceDate,
        tint: displayed.tint || film?.tint || stageRef.current.movie?.tint,
      };
      const locallyStored = Boolean(storedRecord);
      const providerVerified = !locallyStored && withTint.verified === true;
      bookingRef.current = withTint;
      bookingOpenedFromHistoryRef.current = false;
      setBooking(withTint);
      showStage({ view: "booking", booking: withTint });
      resetClarificationFailures();
      return JSON.stringify({
        shown: true,
        source: locallyStored ? "local_device_storage" : "active_provider_result",
        locallyStored,
        verified: providerVerified,
        providerVerified,
        simulationOnly: locallyStored || withTint.demo === true || !providerVerified,
        bookingRef: withTint.ref,
        cinema: withTint.cinemaName || null,
        performanceDate,
        status: withTint.bookingStatus || (withTint.cancelled ? "cancelled" : "locally_stored"),
        refundRoute: withTint.refundRoute || null,
        refundStatus: withTint.refundStatus || null,
        refundReference: withTint.refundReference || null,
      });
    },

    show_booking_for_cancellation: async ({ bookingRef: requestedRef } = {}) => {
      const intentAuthorization = cancellationIntentAuthorizationRef.current;
      cancellationIntentAuthorizationRef.current = null;
      if (checkoutPaymentActiveRef.current) return JSON.stringify({ found: false, reason: "payment_in_progress", instruction: "Payment authorization is in progress. Keep checkout visible and ask the guest to wait for the result." });
      const existingFlow = cancellationFlowRef.current;
      const processingMutation = activeCancellationMutation();
      if (processingMutation) {
        clearPendingVoiceCancellationDecision();
        return JSON.stringify(processingMutation);
      }
      const voiceDecisionConsumption = consumePendingVoiceCancellationDecision({ requestedRef, flow: existingFlow });
      const pendingVoiceDecision = voiceDecisionConsumption.pending;
      if (pendingVoiceDecision) {
        const outcome = handleCancellationDecision(pendingVoiceDecision.decision, { source: "voice_tool" });
        const authoritativeResult = outcome?.completion ? await outcome.completion : outcome;
        const bookingRef = authoritativeResult?.bookingRef || outcome?.bookingRef || pendingVoiceDecision.bookingRef;
        let message = authoritativeResult?.message || outcome?.message || "";
        if (!message && authoritativeResult?.confirmed) {
          message = authoritativeResult.simulationOnly
            ? (localeRef.current === "ar"
              ? "تم تسجيل الحجز كملغى على هذا الجهاز فقط. لم تتم معالجة أي استرداد مالي."
              : "The booking is marked cancelled on this device only. No refund was processed.")
            : (localeRef.current === "ar"
              ? `تم إلغاء الحجز ${bookingRef}. تمت معالجة الاسترداد إلى محفظة VOX${authoritativeResult.refundReference ? ` بالمرجع ${authoritativeResult.refundReference}` : ""}.`
              : `Booking ${bookingRef} was cancelled. The refund was processed to VOX Wallet${authoritativeResult.refundReference ? ` with reference ${authoritativeResult.refundReference}` : ""}.`);
        }
        if (!message) {
          message = pendingVoiceDecision.decision
            ? (localeRef.current === "ar" ? "تعذر إكمال طلب الإلغاء. لم يتم تأكيد أي تغيير." : "The cancellation could not be completed. No change was confirmed.")
            : (localeRef.current === "ar" ? "بقي الحجز نشطاً." : "The booking was kept active.");
        }
        return JSON.stringify({
          ...authoritativeResult,
          found: true,
          voiceDecisionHandled: true,
          bookingRef,
          confirmationRequired: Boolean(authoritativeResult?.confirmationRequired),
          message,
          instruction: "Speak the returned message exactly once. Do not repeat an earlier confirmation and do not call this tool again for this decision.",
        });
      }
      if (voiceDecisionConsumption.reason !== "no_pending_decision") {
        const message = localeRef.current === "ar"
          ? "لم يتم تطبيق قرار الإلغاء لأن مرجع الحجز أو سياق التأكيد لم يعد مطابقاً. لم يتم تأكيد أي تغيير."
          : "The cancellation decision was not applied because the booking reference or confirmation context no longer matched. No change was confirmed.";
        return JSON.stringify({
          found: Boolean(existingFlow?.bookingRef),
          voiceDecisionHandled: false,
          bookingRef: existingFlow?.bookingRef || null,
          confirmationRequired: false,
          reason: voiceDecisionConsumption.reason,
          message,
          instruction: "Speak the returned message once. Do not repeat the earlier confirmation and do not retry the decision without a new guest answer.",
        });
      }
      const idempotentActiveFlow = Boolean(
        existingFlow?.bookingRef
        && (!requestedRef || norm(existingFlow.bookingRef) === norm(requestedRef))
        && ["checking", "route_confirmation", "final_confirmation", "processing"].includes(existingFlow.phase),
      );
      const locallyAuthorized = ["direct_user_turn", "ui_action"].includes(intentAuthorization?.source);
      if (!locallyAuthorized && !idempotentActiveFlow) {
        return JSON.stringify({
          found: false,
          confirmationRequired: false,
          phase: "idle",
          reason: "cancellation_intent_required",
          instruction: "No explicit cancellation request was confirmed. Keep the current booking or history panel visible and do not start cancellation.",
        });
      }
      if (idempotentActiveFlow && !locallyAuthorized) {
        return JSON.stringify({
          found: true,
          bookingRef: existingFlow.bookingRef,
          confirmationRequired: ["route_confirmation", "final_confirmation"].includes(existingFlow.phase),
          phase: existingFlow.phase,
          refundRoute: existingFlow.refundRoute || null,
          simulationOnly: Boolean(existingFlow.demoOnly),
          message: existingFlow.message || "The cancellation flow is already active in the widget. Do not restart it.",
        });
      }
      const openedFromHistory = stageRef.current.view === "history" || bookingOpenedFromHistoryRef.current;
      const storedBookings = readBookings();
      const target = resolveCancellationTarget({
        requestedRef,
        visibleBooking: stageRef.current.view === "booking" && isCurrentBooking(bookingRef.current)
          ? bookingRef.current
          : null,
        storedBookings,
      });
      if (!target.bookingRef) {
        dismissPendingCancellation("target_selection_required");
        const visibleBookings = storedBookings.filter((item) => isCurrentBooking(item));
        const candidateRefs = target.candidates.filter((candidateRef) => (
          visibleBookings.some((item) => norm(item.ref) === norm(candidateRef))
        ));
        if (stageRef.current.view !== "history") captureHistoryReturn();
        setHistoryFilter("active");
        setBookings(visibleBookings);
        showStage({
          view: "history",
          purpose: CANCELLATION_TARGET_SELECTION_PURPOSE,
          candidateRefs,
        });
        const multiple = target.reason === "multiple_active_bookings";
        const message = localeRef.current === "ar"
          ? (multiple ? "لديك أكثر من حجز نشط. اختر الحجز الذي تريد إلغاءه." : "لا توجد حجوزات نشطة محفوظة على هذا الجهاز.")
          : (multiple ? "You have more than one active booking. Select the booking you want to cancel." : "No active bookings are saved on this device.");
        return JSON.stringify({
          found: false,
          confirmationRequired: false,
          phase: multiple ? "target_selection" : "idle",
          reason: target.reason,
          candidates: candidateRefs,
          message,
          instruction: multiple ? "Ask the guest to select one of the visible bookings. Never guess." : "Tell the guest no active on-device booking was found.",
        });
      }

      if (["already_cancelled", "not_current_booking"].includes(target.reason)) {
        dismissPendingCancellation(target.reason);
        const alreadyCancelled = target.reason === "already_cancelled";
        const message = localeRef.current === "ar"
          ? (alreadyCancelled ? "هذا الحجز ملغى بالفعل." : "انتهى موعد هذا العرض، لذلك لم يعد الحجز متاحاً للإلغاء.")
          : (alreadyCancelled ? "This booking is already cancelled." : "This showtime has passed, so the booking is no longer available for cancellation.");
        return JSON.stringify({
          found: true,
          eligible: false,
          confirmationRequired: false,
          phase: "idle",
          reason: target.reason,
          alreadyCancelled,
          bookingRef: target.bookingRef,
          message,
        });
      }

      const reconciliationRequired = cancellationReconciliationRequired(target.bookingRef);
      if (reconciliationRequired) return JSON.stringify(reconciliationRequired);

      if (existingFlow?.bookingRef && norm(existingFlow.bookingRef) === norm(target.bookingRef)
        && ["checking", "route_confirmation", "final_confirmation", "processing"].includes(existingFlow.phase)) {
        return JSON.stringify({
          found: true,
          bookingRef: existingFlow.bookingRef,
          confirmationRequired: ["route_confirmation", "final_confirmation"].includes(existingFlow.phase),
          phase: existingFlow.phase,
          refundRoute: existingFlow.refundRoute || null,
          simulationOnly: Boolean(existingFlow.demoOnly),
          message: existingFlow.message || "The cancellation flow is already active in the widget. Do not restart it.",
        });
      }

      dismissPendingCancellation("replaced");
      setCancellationFlow({ phase: "checking", bookingRef: target.bookingRef, message: localeRef.current === "ar" ? "جارٍ التحقق من إمكانية إلغاء الحجز…" : "Checking cancellation eligibility…" });
      const cancellationRequestId = cancellationOperationRef.current;
      const cancellationRequestIsStale = () => cancellationOperationRef.current !== cancellationRequestId;
      const staleCancellationResult = () => {
        if (cancellationOperationRef.current === cancellationRequestId) setCancellationFlow(null);
        const message = localeRef.current === "ar" ? "تم الانتقال إلى طلب آخر قبل اكتمال التحقق من الحجز." : "The booking check stopped because you moved to another task.";
        return JSON.stringify({ found: false, bookingRef: target.bookingRef, confirmationRequired: false, reason: "task_changed", message });
      };
      let found;
      try {
        found = await vista.searchBooking(target.bookingRef);
      } catch (error) {
        if (cancellationRequestIsStale()) return staleCancellationResult();
        const reason = error?.message || "Booking not found.";
        const message = localeRef.current === "ar" ? "تعذر العثور على هذا الحجز. تحقق من مرجع الحجز وحاول مرة أخرى." : "This booking could not be found. Check the booking reference and try again.";
        const visibleMatch = stageRef.current.view === "booking"
          && norm(bookingRef.current?.ref) === norm(target.bookingRef);
        if (visibleMatch) {
          setCancellationFlow({ phase: "error", bookingRef: target.bookingRef, error: reason, message });
        } else {
          dismissPendingCancellation("booking_lookup_failed");
          say("system", message);
        }
        return JSON.stringify({ found: false, bookingRef: target.bookingRef, confirmationRequired: false, reason, message });
      }
      if (cancellationRequestIsStale()) return staleCancellationResult();
      const displayed = {
        ...found,
        date: found.performanceDate || found.sourceDate || found.date || null,
        performanceDate: found.performanceDate || found.sourceDate || found.date || null,
        total: found.total ?? found.refundAmount,
        tint: found.tint || resolveFilm(found.movieTitle)?.tint,
        cancelled: Boolean(found.cancelled),
        bookingStatus: found.bookingStatus || (found.cancelled ? "cancelled" : "confirmed"),
      };
      bookingRef.current = displayed;
      bookingOpenedFromHistoryRef.current = openedFromHistory;
      setBooking(displayed);
      const cancellationStage = { view: "booking", booking: displayed, purpose: CANCELLATION_TARGET_SELECTION_PURPOSE };
      const keepCancellationHidden = cancellationPausedRef.current
        || !stageVisibleRef.current
        || !["booking_records", "cancellation"].includes(renderTopicRef.current);
      if (keepCancellationHidden) {
        let model = capturePausedRichStage(pausedJourneyRef.current, pausedSnapshotStage(cancellationStage), {
          sessionId: appConversationIdRef.current,
          journeyId: bookingJourneyIdRef.current,
          contextVersion: stageRevisionRef.current,
        });
        model = hidePausedRichStage(model, { reason: "cancellation_continued_while_hidden" });
        commitPausedJourney(model);
        cancellationPausedRef.current = true;
      } else {
        showStage(cancellationStage);
      }
      resetClarificationFailures();
      if (displayed.cancelled) {
        const message = localeRef.current === "ar"
          ? (displayed.refundStatus === "not_processed_demo" ? "هذا الحجز مسجل كملغى على هذا الجهاز، ولم تتم معالجة أي استرداد." : "هذا الحجز ملغى بالفعل.")
          : (displayed.refundStatus === "not_processed_demo" ? "This booking is marked cancelled on this device. No refund was processed." : "This booking is already cancelled.");
        dismissPendingCancellation("already_cancelled");
        return JSON.stringify({
          confirmed: false,
          confirmationRequired: false,
          alreadyCancelled: true,
          bookingRef: displayed.ref,
          bookingStatus: displayed.bookingStatus,
          refundStatus: displayed.refundStatus || null,
          refundReference: displayed.refundReference || null,
          demo: displayed.refundStatus === "not_processed_demo",
          message,
        });
      }
      if (!isCurrentBooking(displayed)) {
        const message = localeRef.current === "ar"
          ? "انتهى موعد هذا العرض، لذلك لم يعد الحجز متاحاً للإلغاء. لم يتم تغيير الحجز."
          : "This showtime has passed, so the booking is no longer available for cancellation. The booking was not changed.";
        dismissPendingCancellation("not_current_booking");
        return JSON.stringify({
          confirmed: false,
          confirmationRequired: false,
          found: true,
          eligible: false,
          phase: "idle",
          bookingRef: displayed.ref,
          reason: "not_current_booking",
          message,
        });
      }
      const demoOnly = displayed.cancellation?.demoOnly === true
        || displayed.demo === true
        || displayed.verified !== true
        || ["snapshot_demo", "local_demo"].includes(displayed.dataMode)
        || displayed.paymentStatus === "simulated_not_charged"
        || displayed.bookingStatus === "confirmed_demo";
      if (demoOnly) {
        const summary = cancellationBookingSummary(displayed, localeRef.current);
        const message = localeRef.current === "ar"
          ? `${summary} الأثر: سيُسجل هذا الملخص كملغى على هذا الجهاز فقط. لن يتم التواصل مع VOX ولن يصدر أي استرداد. هل تريد مني إلغاء هذا الحجز؟`
          : `${summary} Impact: this summary will be marked cancelled on this device only. VOX will not be contacted and no refund will be issued. Would you like me to cancel this booking?`;
        setCancellationFlow({
          bookingRef: displayed.ref,
          phase: "final_confirmation",
          refundRoute: null,
          eligibilityStatus: "local_demo_only",
        demoOnly: true,
        message,
      });
        armCancellationConfirmationTimer({ bookingRef: displayed.ref, phase: "final_confirmation" });
        return JSON.stringify({ found: true, bookingRef: displayed.ref, eligible: true, simulationOnly: true, confirmationRequired: true, phase: "final_confirmation", refundRoute: null, message });
      }
      if (displayed.cancellation?.status === "ineligible") {
        const message = localeRef.current === "ar" ? "هذا الحجز غير مؤهل للإلغاء." : "This booking is not eligible for cancellation.";
        setCancellationFlow({ phase: "error", bookingRef: displayed.ref, error: displayed.cancellation.reason, message });
        return JSON.stringify({
          confirmed: false,
          confirmationRequired: false,
          found: true,
          eligible: false,
          bookingRef: displayed.ref,
          reason: displayed.cancellation.reason,
          message,
        });
      }
      if (displayed.cancellation?.status !== "eligible") {
        const message = localeRef.current === "ar" ? "تعذر التحقق من أهلية الإلغاء. استخدم خدمة إدارة الحجز الرسمية من VOX." : "Cancellation eligibility could not be verified. Use the official VOX Manage Booking service.";
        setCancellationFlow({ phase: "error", bookingRef: displayed.ref, error: displayed.cancellation?.reason || "provider_verification_required", message });
        return JSON.stringify({
          confirmed: false,
          confirmationRequired: false,
          found: true,
          eligible: false,
          reviewRequired: true,
          bookingRef: displayed.ref,
          reason: displayed.cancellation?.reason || "provider_verification_required",
          message,
        });
      }
      const summary = cancellationBookingSummary(displayed, localeRef.current);
      const message = localeRef.current === "ar"
        ? `${summary} الأثر: سيعاد المبلغ المؤهل افتراضياً إلى محفظة VOX. قل نعم لاختيار محفظة VOX، ثم سأطلب تأكيداً نهائياً.`
        : `${summary} Impact: the eligible amount will default to VOX Wallet credit. Say yes to choose VOX Wallet, then I will ask for final confirmation.`;
      setCancellationFlow({
        bookingRef: displayed.ref,
        phase: "route_confirmation",
        refundRoute: "VOX Wallet",
        eligibilityStatus: displayed.cancellation?.status || "unknown",
        demoOnly: false,
        message,
      });
      armCancellationConfirmationTimer({ bookingRef: displayed.ref, phase: "route_confirmation" });
      return JSON.stringify({ found: true, bookingRef: displayed.ref, eligible: true, simulationOnly: false, confirmationRequired: true, phase: "route_confirmation", refundRoute: "VOX Wallet", message });
    },

    show_offers: async ({ bankName = "", cardName = "", experience = "", detailTopic = "", format = "", seatType = "", isMember, monthlyTicketsUsed, monthlySpend } = {}) => {
      if (checkoutPaymentActiveRef.current) return JSON.stringify({ shown: false, reason: "payment_in_progress", instruction: "Payment authorization is in progress. Keep checkout visible and ask the guest to wait for the result." });
      const current = stageRef.current;
      const preservedCheckout = activeCheckoutStage();
      const checkoutPreserved = Boolean(preservedCheckout);
      const origin = current.view === "offers" ? offersReturnRef.current || { view: "empty" } : current;
      const order = origin.view === "checkout" ? preservedCheckout?.order || pendingOrderRef.current : null;
      const activeBooking = origin.view === "booking" ? bookingRef.current : null;
      const preferences = discoveryPreferencesRef.current || {};
      const retainedContext = current.view === "offers" ? lastOfferRef.current?.context || null : null;
      const suppliedMonthlyTickets = monthlyTicketsUsed === "" || monthlyTicketsUsed === null || monthlyTicketsUsed === undefined ? null : Number(monthlyTicketsUsed);
      const suppliedMonthlySpend = monthlySpend === "" || monthlySpend === null || monthlySpend === undefined ? null : Number(monthlySpend);
      const eligibilityInput = {
        format: format || retainedContext?.format || "",
        seatType: seatType || retainedContext?.seatType || "",
        isMember: typeof isMember === "boolean" ? isMember : retainedContext?.isMember,
        monthlyTicketsUsed: Number.isFinite(suppliedMonthlyTickets) ? suppliedMonthlyTickets : retainedContext?.monthlyTicketsUsed,
        monthlySpend: Number.isFinite(suppliedMonthlySpend) ? suppliedMonthlySpend : retainedContext?.monthlySpend,
        channel: "web",
      };
      const context = buildOfferEvaluationContext({
        view: current.view,
        originView: origin.view,
        checkout: order,
        session: ["movies", "showtimes", "seatmap"].includes(origin.view) ? {
          cinema: cinemaRef.current,
          movie: origin.movie || null,
          session: origin.session || null,
          selectedSeats: seatsRef.current,
        } : null,
        booking: activeBooking,
        browse: {
          cinemaId: cinemaRef.current?.id,
          cinemaName: cinemaRef.current?.name || preferences.cinemaName,
          movieId: preferences.movieId,
          movieTitle: preferences.movieTitle,
          performanceDate: preferences.date || scheduleDateRef.current,
          preferredTime: preferences.preferredTime,
          experience: experience || retainedContext?.experience || preferences.experience,
          format: format || retainedContext?.format,
          seatType: seatType || retainedContext?.seatType,
          channel: "web",
        },
        eligibility: eligibilityInput,
      });

      if (lastOfferRef.current && shouldInvalidateOfferResult(lastOfferRef.current, context)) lastOfferRef.current = null;
      const retained = current.view === "offers" ? lastOfferRef.current : null;
      const retainedBank = retained?.offer?.bank?.en || "";
      const retainedCard = retained?.cardProfile?.name?.en || "";
      const effectiveBankName = bankName || (cardName && retainedBank ? retainedBank : "") || (detailTopic && retainedBank ? retainedBank : "");
      const effectiveCardName = cardName || (detailTopic && retainedCard ? retainedCard : "");
      const query = [effectiveBankName, effectiveCardName].filter(Boolean).join(" ").trim();
      const result = query
        ? effectiveCardName
          ? resolveOfferForBankAndCard(effectiveBankName, effectiveCardName, context)
          : resolveOffer(effectiveBankName || query, context)
        : null;
      lastOfferRef.current = result;
      const toolLocale = localeRef.current;
      const disclaimer = OFFER_META.disclaimer[toolLocale] || OFFER_META.disclaimer.en;
      if (current.view !== "offers") {
        offersReturnRef.current = current;
        pauseRichRenderingForTopicChange("offers_opened", "offers");
      }
      const eligibilityCheckRequested = Boolean(
        effectiveCardName
        || experience
        || format
        || seatType
        || typeof isMember === "boolean"
        || Number.isFinite(suppliedMonthlyTickets)
        || Number.isFinite(suppliedMonthlySpend),
      );
      const showtimeRequired = eligibilityCheckRequested && !context.isSessionGrounded;
      renderTopicRef.current = "offers";
      showStage({ view: "offers", query, context, result, showtimeRequired });
      resetClarificationFailures();
      if (!query) {
        return JSON.stringify({
          shown: "all offers",
          checkoutPreserved,
          checkoutId: preservedCheckout?.order?.checkoutId || null,
          seats: preservedCheckout?.order?.seats || [],
          total: preservedCheckout?.order?.total ?? null,
          promotionCount: OFFER_META.promotionCount,
          issuerCount: OFFER_META.issuerCount,
          answer: toolLocale === "ar"
            ? `تم عرض ${OFFER_META.promotionCount} عرضاً حالياً ضمن ${OFFER_META.issuerCount} مجموعة عروض. ابحث باسم البنك أو البطاقة لعرض التفاصيل.`
            : `I displayed ${OFFER_META.promotionCount} current promotions across ${OFFER_META.issuerCount} offer groups. Search by bank or card for full details.`,
          context,
          disclaimer,
        });
      }
      const localizedReason = localizedOfferReason(result, toolLocale);
      const localizedHeadline = localizedValue(result?.offer?.headline, toolLocale) || (toolLocale === "ar" ? "لا يوجد عرض مطابق" : "No matching offer");
      const localizedAdvisory = toolLocale === "ar" && result?.advisory
        ? "قد تُطلب عضوية ڤوكس مسجلة، ويتم التأكيد النهائي للأهلية عند الدفع."
        : result?.advisory || "";
      const facts = buildOfferFacts(result?.offer, toolLocale);
      const topicAnswer = answerForOfferTopic(result?.offer, result?.cardProfile, toolLocale, detailTopic || "summary");
      return JSON.stringify({
        shown: "offer card",
        checkoutPreserved,
        checkoutId: preservedCheckout?.order?.checkoutId || null,
        seats: preservedCheckout?.order?.seats || [],
        total: preservedCheckout?.order?.total ?? null,
        bank: localizedValue(result?.offer?.bank, toolLocale) || bankName,
        card: localizedValue(result?.cardProfile?.name, toolLocale) || cardName || null,
        headline: localizedHeadline,
        detailTopic: detailTopic || "summary",
        eligibility: result?.status || "ineligible",
        showtimeRequired,
        selectedShowtime: context.selectedShowtime,
        missingFields: result?.missingFields || [],
        reason: localizedReason,
        advisory: localizedAdvisory,
        details: facts ? {
          summary: facts.summary,
          benefit: facts.benefit,
          promotionCount: facts.promotionCount,
          cardTiers: facts.profiles,
          eligibleCards: facts.cards,
          experiences: facts.experiences,
          limits: facts.limits,
          requirements: facts.requirements,
          restrictions: facts.restrictions,
          foodBenefit: facts.foodBenefit || null,
          redemptionSteps: facts.redemptionSteps,
          commonTerms: facts.commonTerms,
          detailsPublished: facts.detailsPublished,
          detailUrl: facts.detailUrl,
          termsUrl: facts.termsUrl,
          verifiedDate: facts.verifiedDate,
        } : null,
        answer: `${topicAnswer}${effectiveCardName ? ` ${localizedReason}` : ""}${localizedAdvisory ? ` ${localizedAdvisory}` : ""}`,
        context,
        contextFingerprint: context.fingerprint,
        disclaimer,
      });
    },

    handover_to_agent: ({ reason = "", detail = "" } = {}) => {
      if (checkoutPaymentActiveRef.current) return JSON.stringify({ handoverStarted: false, reason: "payment_in_progress", instruction: "Payment authorization is in progress. Keep checkout visible and ask the guest to wait for the result." });
      const normalizedReason = norm(reason);
      if (!isSupportedHandoverReason(normalizedReason)) {
        return JSON.stringify({ handoverStarted: false, reason: "invalid_handover_reason", instruction: "Call handover_to_agent again only with reason explicit_request, clarification_failure, or fallback." });
      }
      const existingPayload = stageRef.current.view === "handover" ? stageRef.current.payload : null;
      if (existingPayload?.event?.handoverId) {
        return JSON.stringify({ handoverStarted: true, existing: true, mode: "summary_only", status: "summary_prepared", externalConnectionStarted: false, schemaVersion: existingPayload.schemaVersion, handoverId: existingPayload.event.handoverId });
      }
      const isClarificationFailure = isClarificationFailureReason(normalizedReason);
      if (isClarificationFailure) {
        const attempt = registerClarificationFailureAttempt({
          attempts: clarificationFailureLogRef.current,
          messages: messagesRef.current,
          detail,
          at: new Date().toISOString(),
        });
        clarificationFailureLogRef.current = attempt.attempts;
        clarificationFailuresRef.current = attempt.count;
        if (!attempt.accepted) {
          return JSON.stringify({ handoverStarted: false, reason: "duplicate_clarification_failure", clarificationFailureCount: attempt.count, remaining: attempt.remaining, instruction: "Wait for the guest's answer to the clarification before recording another failed clarification." });
        }
        if (!attempt.thresholdReached) {
          return JSON.stringify({ handoverStarted: false, clarificationFailureCount: attempt.count, remaining: attempt.remaining, instruction: "Try one more concise clarification. If it also fails after the guest replies, call handover_to_agent again with reason clarification_failure." });
        }
      }

      dismissPendingCancellation("handover_started");
      const current = stageRef.current;
      const currentBooking = bookingRef.current;
      const currentOrder = pendingOrderRef.current;
      const handoverBooking = currentOrder || (current.view === "booking" ? currentBooking : null);
      const handoverSeats = currentOrder?.seats?.length
        ? currentOrder.seats
        : handoverBooking?.seats?.length
          ? handoverBooking.seats
          : seatsRef.current;
      const payload = buildHandoverPayload({
        conversationId: conversationIdRef.current,
        requestedAt: new Date().toISOString(),
        trigger: isClarificationFailure ? HANDOVER_TRIGGER.FAILED_CLARIFICATIONS : HANDOVER_TRIGGER.EXPLICIT_REQUEST,
        reason: detail || reason,
        clarificationFailures: clarificationFailuresRef.current,
        locale: localeRef.current === "ar" ? "ar-AE" : "en-AE",
        stage: current.view,
        cinema: cinemaRef.current,
        movie: current.movie || (currentOrder ? { id: currentOrder.movieId, title: currentOrder.movieTitle } : handoverBooking ? { id: handoverBooking.movieId, title: handoverBooking.movieTitle } : null),
        session: current.session || (currentOrder
          ? { sessionId: currentOrder.sessionId, date: currentOrder.performanceDate || currentOrder.sourceDate || currentOrder.date, time: currentOrder.showtime, experience: currentOrder.experience, screen: currentOrder.screen }
          : handoverBooking
            ? { sessionId: handoverBooking.sessionId, date: handoverBooking.performanceDate || handoverBooking.sourceDate || handoverBooking.date, time: handoverBooking.showtime, experience: handoverBooking.experience, screen: handoverBooking.screen }
            : null),
        selectedSeats: handoverSeats,
        booking: handoverBooking,
        offer: lastOfferRef.current ? {
          id: lastOfferRef.current.offer?.id,
          bank: lastOfferRef.current.offer?.bank?.en,
          title: lastOfferRef.current.offer?.headline?.en,
          eligibility: lastOfferRef.current.status,
        } : null,
        messages: messagesRef.current,
      });
      showStage({ view: "handover", payload });
      resetClarificationFailures();
      return JSON.stringify({ handoverStarted: true, mode: "summary_only", status: "summary_prepared", externalConnectionStarted: false, schemaVersion: payload.schemaVersion, handoverId: payload.event.handoverId });
    },
  };

  const showBookingForAuthorizedCancellation = (args, source) => {
    cancellationIntentAuthorizationRef.current = { source };
    try {
      return clientTools.show_booking_for_cancellation(args);
    } finally {
      cancellationIntentAuthorizationRef.current = null;
    }
  };

  const resolveVisibleSeatTurn = (text) => {
    if (stageRef.current.view !== "seatmap") return Object.freeze({ requested: false, seats: [] });
    const availableSeatIds = (planRef.current || [])
      .flatMap((row) => row.seats || [])
      .filter((seat) => seat.status === 0)
      .map((seat) => seat.id);
    return resolveSeatSelectionTurn(text, {
      availableSeatIds,
      currentSeats: seatsRef.current,
    });
  };

  const routeSeatSelectionTurn = async (text, resolvedTurn = resolveVisibleSeatTurn(text)) => {
    if (!resolvedTurn?.requested) return null;
    if (resolvedTurn.invalidSeats?.length) {
      return {
        confirmed: false,
        invalidSeats: resolvedTurn.invalidSeats,
        reason: localeRef.current === "ar"
          ? `هذه المقاعد غير متاحة أو غير صحيحة: ${resolvedTurn.invalidSeats.join("، ")}. اختر من المقاعد المتاحة في الخريطة.`
          : `These seats are invalid or unavailable: ${resolvedTurn.invalidSeats.join(", ")}. Choose from the available seats shown on the map.`,
      };
    }
    if (!resolvedTurn.seats?.length) {
      return {
        confirmed: false,
        reason: localeRef.current === "ar"
          ? "اختر مقعداً متاحاً واحداً على الأقل، ثم أكّد المقاعد."
          : "Select at least one available seat, then confirm the seats.",
      };
    }
    const rawResult = await clientTools.select_seats({ seats: resolvedTurn.seats });
    try {
      return typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
    } catch {
      return { confirmed: false, reason: "The seat confirmation returned an unreadable result." };
    }
  };

  const seatSelectionResultContext = (result) => {
    if (result?.confirmed) {
      return `The widget confirmed seats ${(result.seats || []).join(", ")} and checkout is already displayed. The booking is not confirmed yet and no booking reference exists yet. Tell the guest to complete the on-screen payment step. Do not call select_seats again, invent a reference, or claim that payment, reservation, booking, or QR creation is complete.`;
    }
    if (result?.stale) {
      return result.currentView === "seatmap"
        ? "The guest changed the seat selection while pricing was loading. The seat map remains visible. Ask them to confirm the seats currently selected; do not claim checkout or booking completion."
        : `Seat confirmation stopped because the widget now displays ${result.currentView || "another panel"}. Continue from the panel currently shown; do not say the seat map remains visible or claim checkout or booking completion.`;
    }
    return `The seat map remains visible and checkout did not start. Reason: ${result?.reason || "seat confirmation was not completed"} State that requirement briefly and never claim a booking or reference was created.`;
  };

  const routeCancellationTurn = async (text) => {
    renderTopicRef.current = "cancellation";
    cancellationPausedRef.current = false;
    const storedBookings = readBookings();
    const newestFirst = sortBookingsForDisplay(storedBookings);
    const displayedBookingRefs = stageRef.current.view === "history" && stageRef.current.candidateRefs?.length
      ? stageRef.current.candidateRefs
      : newestFirst.map((item) => item.ref).filter(Boolean);
    const currentMovie = stageRef.current.movie
      || (bookingRef.current ? { id: bookingRef.current.movieId, title: bookingRef.current.movieTitle } : null)
      || (discoveryPreferencesRef.current.movieTitle
        ? { id: discoveryPreferencesRef.current.movieId, title: discoveryPreferencesRef.current.movieTitle }
        : null);
    const resolution = resolveConversationalCancellation({
      text,
      bookings: storedBookings,
      displayedBookingRefs,
      conversationContext: { currentMovie },
      now: new Date(),
    });

    if (resolution.status === "ambiguous") {
      const candidateRefs = resolution.candidateRefs;
      const candidateKeys = new Set(candidateRefs.map(norm));
      const matchingBookings = candidateRefs
        .map((candidateRef) => storedBookings.find((item) => norm(item.ref) === norm(candidateRef)))
        .filter(Boolean);
      if (stageRef.current.view !== "history") captureHistoryReturn();
      setHistoryFilter("active");
      setBookings(matchingBookings.filter((item) => candidateKeys.has(norm(item.ref))));
      showStage({
        view: "history",
        purpose: CANCELLATION_TARGET_SELECTION_PURPOSE,
        candidateRefs,
        differentiators: resolution.differentiators,
      });
      const message = focusedCancellationChoice(resolution.candidates, localeRef.current);
      return {
        found: false,
        confirmationRequired: false,
        phase: "target_selection",
        reason: resolution.reason,
        candidates: candidateRefs,
        candidateDetails: resolution.candidates,
        differentiators: resolution.differentiators,
        message,
      };
    }

    const explicitLifecycleTarget = resolution.matchedBy?.length > 0;
    if ((resolution.status === "unique" || (explicitLifecycleTarget && ["ineligible", "already_cancelled"].includes(resolution.status))) && resolution.bookingRef) {
      const rawResult = await showBookingForAuthorizedCancellation(
        { bookingRef: resolution.bookingRef },
        "direct_user_turn",
      );
      try {
        return typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
      } catch {
        return { found: false, confirmationRequired: false, reason: "unreadable_cancellation_result", message: "The cancellation check returned an unreadable result." };
      }
    }

    const activeBookings = newestFirst.filter((item) => isCurrentBooking(item));
    if (activeBookings.length) {
      if (stageRef.current.view !== "history") captureHistoryReturn();
      const candidateRefs = activeBookings.map((item) => item.ref).filter(Boolean);
      setHistoryFilter("active");
      setBookings(activeBookings);
      showStage({ view: "history", purpose: CANCELLATION_TARGET_SELECTION_PURPOSE, candidateRefs });
    }
    const message = localeRef.current === "ar"
      ? (activeBookings.length
        ? "لم أجد حجزاً يطابق هذا الوصف. اذكر الفيلم أو التاريخ أو الوقت أو السينما أو المرجع أو رقم الحجز في القائمة."
        : "لا توجد حجوزات نشطة محفوظة على هذا الجهاز.")
      : (activeBookings.length
        ? "I could not match that description to a booking. Say the movie, date, time, cinema, reference, or list position."
        : "No active bookings are saved on this device.");
    return {
      found: false,
      confirmationRequired: false,
      phase: activeBookings.length ? "target_selection" : "idle",
      reason: activeBookings.length ? resolution.reason : "no_active_booking",
      candidates: activeBookings.map((item) => item.ref),
      message,
    };
  };

  const cancellationResultContext = (result, { promptAlreadyVisible = false } = {}) => {
    if (!result) return "The widget could not determine the cancellation state. Do not claim that the booking was cancelled.";
    if (result.confirmed) {
      return result.simulationOnly
        ? `The widget marked booking ${result.bookingRef} cancelled on this device. No refund was processed. Confirm this boundary once.`
        : `The verified refund adapter confirmed booking ${result.bookingRef} cancelled. Refund reference: ${result.refundReference || "not returned"}.`;
    }
    if (result.phase === "processing") return `The widget is processing cancellation for ${result.bookingRef}. Do not claim success until a completed result is supplied.`;
    if (result.confirmationRequired) {
      if (promptAlreadyVisible) {
        return `The widget is awaiting ${result.phase} for booking ${result.bookingRef}. The controls are already visible, but the conversational confirmation must still be accessible in text and voice. Speak this exact prompt once now: ${result.message} Do not call show_booking_for_cancellation again and do not add other booking fields.`;
      }
      return `The widget is awaiting ${result.phase} for booking ${result.bookingRef}. Speak this confirmation prompt now: ${result.message} Do not call show_booking_for_cancellation again while this phase is active.`;
    }
    if (result.reason === "multiple_active_bookings") {
      return `${bookingHistoryAgentContext(readBookings().filter((item) => isCurrentBooking(item)))} Ask the guest to select or name exactly one booking; never guess.`;
    }
    if (result.phase === "target_selection" || ["multiple_matching_bookings", "ambiguous_movie_title", "no_displayed_candidate_match", "displayed_candidates_unavailable"].includes(result.reason)) {
      return `${bookingHistoryAgentContext(readBookings().filter((item) => (result.candidates || []).includes(item.ref)))} ${result.message} Ask only for a missing distinguishing detail. Do not start movie discovery or guess a booking.`;
    }
    if (result.reason === "no_active_booking") {
      return `The widget found no active bookings saved on this device. Reply with only one short sentence in the active language saying there are no current bookings available to cancel, then end the turn. Do not ask for a booking reference, offer a lookup, or imply that a hidden booking may still be active.`;
    }
    if (result.reason === "not_current_booking") {
      return `Booking ${result.bookingRef || "the requested booking"} is a past showtime and cannot be cancelled here. Tell the guest the showtime has passed and the booking was not changed. Do not ask for confirmation.`;
    }
    if (result.reason === "already_cancelled") {
      return `Booking ${result.bookingRef || "the requested booking"} is already cancelled. State that briefly and do not ask for confirmation or a booking reference.`;
    }
    return `The cancellation did not proceed. Reason: ${result.reason || result.message || "unknown"}. Do not claim the booking was cancelled or refunded.`;
  };

  const bookingHistoryTurnContext = (visibleBookings, { activeOnly = false } = {}) => {
    const items = Array.isArray(visibleBookings) ? visibleBookings : [];
    const instruction = items.length
      ? `The widget has already displayed ${items.length} ${activeOnly ? "active" : "recent and cancelled"} booking ${items.length === 1 ? "record" : "records"}. Never say the list is empty and never ask the guest to provide a booking reference before acknowledging the visible list. Ask them to select one by movie, date, time, cinema, reference, or displayed position if they need help with a specific booking.`
      : activeOnly
        ? "Tell the guest there are no active bookings saved on this device. Do not ask them to select a booking."
        : "Tell the guest there are no booking summaries saved on this device. Do not ask them to select a booking.";
    return `${bookingHistoryAgentContext(items)} ${instruction}`;
  };

  const clearConversationState = useCallback((reason = "reset") => {
    if (checkoutPaymentActiveRef.current) return false;
    if (activeCancellationMutation()) {
      lastActivityRef.current = Date.now();
      return false;
    }
    sessionEpochRef.current += 1;
    cancellationOperationRef.current += 1;
    requestedSessionEpochRef.current = null;
    dismissPendingCancellation(reason, { force: true });
    cancellationInFlightRef.current = false;
    messagesRef.current = [];
    setMessages([]);
    setShowFullTranscript(false);
    setInput("");
    stageRevisionRef.current += 1;
    stageRef.current = { view: "empty" };
    stageVisibleRef.current = true;
    setStage({ view: "empty" });
    setStageVisible(true);
    cinemaRef.current = null;
    setCinema(null);
    bookingRef.current = null;
    bookingOpenedFromHistoryRef.current = false;
    setBooking(null);
    checkoutPaymentActiveRef.current = false;
    pendingOrderRef.current = null;
    checkoutStageRef.current = null;
    setPendingOrder(null);
    seatsRef.current = [];
    setSelectedSeats([]);
    requestedSeatTargetRef.current = null;
    setRequestedSeatTarget(null);
    seatQuoteRequestRef.current += 1;
    setSeatQuote(null);
    discoveryPreferencesRef.current = createDiscoveryPreferences();
    setDiscoveryPreferences(discoveryPreferencesRef.current);
    discoverySessionsRef.current.clear();
    pendingDiscoveryTurnRef.current = "";
    scheduleDateRef.current = vista.demoDate();
    userRequestedDateRef.current = null;
    setScheduleDate(vista.demoDate());
    filmsRef.current = [];
    filmsCinemaRef.current = "";
    filmsDateRef.current = "";
    filmRequestsRef.current.clear();
    sessionsRef.current = [];
    sessionsFilmRef.current = "";
    planRef.current = [];
    planContextRef.current = null;
    cinemaReturnRef.current = null;
    movieReturnPreferencesRef.current = null;
    historyReturnRef.current = null;
    historyContextRef.current = null;
    offersReturnRef.current = null;
    lastOfferRef.current = null;
    resetClarificationFailures();
    transportConversationIdRef.current = null;
    const endedPausedJourney = reason === "timeout"
      ? expirePausedRichJourney(pausedJourneyRef.current, { reason })
      : endPausedRichJourney(pausedJourneyRef.current, { reason });
    pausedJourneyRef.current = endedPausedJourney;
    appConversationIdRef.current = newConversationId();
    conversationIdRef.current = appConversationIdRef.current;
    bookingJourneyIdRef.current = appConversationIdRef.current;
    const freshPausedJourney = createPausedRichJourney({
      sessionId: appConversationIdRef.current,
      journeyId: bookingJourneyIdRef.current,
    });
    pausedJourneyRef.current = freshPausedJourney;
    setPausedJourney(freshPausedJourney);
    cancellationPausedRef.current = false;
    renderTopicRef.current = "general_enquiry";
    journeyRef.current = createConversationJourney(appConversationIdRef.current);
    dispatchJourney({ type: "reset", sessionId: appConversationIdRef.current });
    lastSentTextRef.current = null;
    pendingTypedMessagesRef.current = [];
    hasStartedConversationRef.current = false;
    hasDisplayedWelcomeRef.current = false;
    continuationSessionRef.current = false;
    pendingLanguageSwitchRef.current = null;
    requestEpochRef.current += 1;
    lastActivityRef.current = Date.now();
    cancellationReconciliationRequired();
    return true;
  }, []);

  /* ========================================================================
   * REAL ELEVENLABS CONNECTION: do not change the connection type, location,
   * or client-tool names. The agent uses the public VITE_AGENT_ID identifier.
   * ====================================================================== */
  let conversation;
  const transportCallbacks = {
    onConnect: () => {
      if (requestedSessionEpochRef.current !== sessionEpochRef.current) return;
      const connectedMode = requestedSessionModeRef.current || "voice";
      sessionModeRef.current = connectedMode;
      setSessionMode(connectedMode);
      setStartingMode(null);
      switchingSessionRef.current = false;
    },
    onDisconnect: () => {
      const switching = switchingSessionRef.current;
      clearPendingVoiceCancellationDecision();
      pendingLanguageSwitchRef.current = null;
      sessionModeRef.current = null;
      setSessionMode(null);
      if (!switching) {
        requestedSessionModeRef.current = null;
        requestedSessionEpochRef.current = null;
        setStartingMode(null);
        const reason = disconnectReasonRef.current;
        const suppressNotice = suppressDisconnectNoticeRef.current;
        disconnectReasonRef.current = "ended";
        suppressDisconnectNoticeRef.current = false;
        // An SDK transport can end independently of the guest's local journey
        // (for example, when the ElevenLabs session reaches its own timeout).
        // Keep the current history/offer/booking view and cinema mounted so a
        // later text turn can reconnect with the same context. The deliberate
        // app inactivity timeout remains a privacy reset, while restart/logout
        // perform their own full reset in restartConversation.
        if (reason === "timeout") {
          clearConversationState(reason);
        }
        if (!suppressNotice) say("system", t(reason === "timeout" ? "app.timeoutMessage" : "app.disconnectedMessage"));
      }
    },
    onMessage: async (message) => {
      const normalizedMessage = normalizeElevenLabsMessageEvent(message);
      if (!normalizedMessage) return;
      const { role, text: eventText } = normalizedMessage;
      const sentIndex = role === "user"
        ? pendingTypedMessagesRef.current.findIndex((sent) => sent.text === eventText && Date.now() - sent.at < 15000)
        : -1;
      if (sentIndex >= 0) {
        pendingTypedMessagesRef.current.splice(sentIndex, 1);
        lastSentTextRef.current = pendingTypedMessagesRef.current.at(-1) || null;
        return;
      }

      const sanitized = role === "user" ? sanitizeUserText(eventText) : { safeText: eventText, sensitive: false };
      const safeMessage = sanitized.safeText;
      if (role === "user") {
        if (!hasMeaningfulTurnContent(safeMessage)) return;
        beginMeaningfulCancellationUserTurn();
        const requestedResumeTarget = pausedResumeTarget(safeMessage);
        if (!requestedResumeTarget) restoredStageToolGuardRef.current = null;
        const movieSelectionGrounding = buildMovieSelectionGroundingContext({ text: safeMessage, stage: stageVisibleRef.current ? stageRef.current : { view: "empty" } });
        if (movieSelectionGrounding) conversation.sendContextualUpdate?.(movieSelectionGrounding);
        if (sanitized.sensitive) say("system", localeRef.current === "ar" ? "تمت إزالة بيانات الدفع الحساسة من المحادثة. استخدم شاشة الدفع الآمنة فقط." : "Sensitive payment details were removed. Use only the secure checkout screen for payment.");
        say("user", safeMessage);
        if (checkoutPaymentActiveRef.current) {
          conversation.sendContextualUpdate?.("Payment authorization is in progress. Keep checkout mounted, answer without calling any display-changing tool, and ask the guest to wait for the on-screen result.");
          return;
        }
        if (isExplicitConversationEndTurn(safeMessage)) {
          conversation.sendContextualUpdate?.("The guest explicitly ended the conversation. The widget cleared the active journey. Do not continue booking or cancellation and do not claim that any stored booking record was cancelled.");
          const cleared = clearConversationState("conversation_ended");
          if (cleared) say("system", localeRef.current === "ar" ? "انتهت المحادثة وتم مسح رحلة الحجز النشطة." : "The conversation ended and the active booking journey was cleared.");
          suppressDisconnectNoticeRef.current = true;
          void conversation.endSession?.();
          return;
        }
        if (isExplicitJourneyCancellationTurn(safeMessage)) {
          const abandoned = abandonActiveBookingJourney("guest_cancelled_active_journey");
          const notice = abandoned
            ? (localeRef.current === "ar" ? "تم إلغاء رحلة الحجز النشطة. لم يتم تغيير أي حجز مكتمل." : "The active booking journey was cleared. No completed booking record was changed.")
            : (localeRef.current === "ar" ? "لا يمكن إيقاف الرحلة أثناء معالجة عملية آمنة." : "The journey cannot be cleared while a secure operation is processing.");
          say("system", notice);
          conversation.sendContextualUpdate?.(`${notice} Do not call cancellation tools because this was about the active journey, not an existing booking record.`);
          return;
        }
        if (requestedResumeTarget) {
          conversation.sendContextualUpdate?.(`The guest asked to restore the paused ${requestedResumeTarget} step. The widget is revalidating it now. Do not restart discovery or claim restoration until the widget result is supplied.`);
          const restoreResult = await restorePausedJourney({ target: requestedResumeTarget, source: "voice" });
          conversation.sendContextualUpdate?.(pausedRestoreContext(restoreResult));
          updateIntentFromText(safeMessage);
          return;
        }
        const decision = cancellationFlowRef.current && !cancellationPausedRef.current ? cancellationDecision(safeMessage) : null;
        if (decision !== null) {
          const pendingVoiceDecision = capturePendingVoiceCancellationDecision(decision);
          if (pendingVoiceDecision) {
            const decisionContext = pendingVoiceDecision.phase === "error"
              ? "The guest declined retry and chose to keep the booking during the active retryable cancellation error."
              : `The guest gave a voice ${decision ? "yes" : "no"} decision for the active ${pendingVoiceDecision.phase} phase.`;
            conversation.sendContextualUpdate?.(`${decisionContext} Call show_booking_for_cancellation exactly once with bookingRef ${pendingVoiceDecision.bookingRef}, wait for its response, and speak only the returned message once. Do not answer from memory or repeat an earlier confirmation.`);
            return;
          }
          if (cancellationFlowRef.current?.phase === "error" && decision === true) {
            conversation.sendContextualUpdate?.("A yes answer during a cancellation error does not authorize another destructive attempt. Do not call show_booking_for_cancellation. Explain that no new cancellation request was sent and ask whether the guest explicitly wants to retry.");
            return;
          }
        }
        const historyRequest = classifyBookingHistoryRequest(safeMessage);
        const visibleHistory = historyRequest.requested
          ? openHistory({ notifyAgent: false, forceOpen: true, activeOnly: historyRequest.activeOnly, preserveReturn: bookingOpenedFromHistoryRef.current })
          : null;
        const cancellationContinuation = decision === null
          ? resolveCancellationContinuation({ text: safeMessage, stage: stageRef.current, storedBookings: readBookings() })
          : { handled: false, bookingRef: null };
        const activeCheckout = Boolean(activeCheckoutStage());
        const checkoutSeatTarget = activeCheckout ? extractTicketQuantity(safeMessage) : null;
        const checkoutSeatEditTurn = decision === null && activeCheckout && (
          isCheckoutSeatEditTurn(safeMessage) || Boolean(checkoutSeatTarget)
        );
        if (checkoutSeatEditTurn) {
          if (stageRef.current.view !== "checkout") restoreActiveCheckout();
          const restored = backToSeatMapFromCheckout({ requestedTarget: checkoutSeatTarget });
          conversation.sendContextualUpdate?.(restored
            ? `The guest returned to the seat map from checkout${checkoutSeatTarget ? ` with a target of ${checkoutSeatTarget} seats` : ""}. The visible seats are editable and the booking is not confirmed. Guide them to select the seats they want and confirm again.`
            : "The checkout seat context could not be restored. Continue from the panel currently shown and do not claim any booking confirmation.");
          updateIntentFromText(safeMessage);
          return;
        }
        const seatTurn = decision === null ? resolveVisibleSeatTurn(safeMessage) : { requested: false, seats: [] };
        const directSeatSelection = Boolean(seatTurn.requested);
        const checkoutResumeTurn = activeCheckout && (isResumeCheckoutTurn(safeMessage)
          || (stageRef.current.view !== "checkout" && isResumeOnlyTurn(safeMessage)));
        if (checkoutResumeTurn) restoreActiveCheckout();
        const resumeOnlyTurn = !directSeatSelection && (isResumeOnlyTurn(safeMessage) || checkoutResumeTurn);
        const directCinemaSelection = isDirectCinemaSelectionUtterance({
          text: safeMessage,
          view: stageRef.current.view,
          cinemaMatch: resolveCinema(safeMessage),
        });
        const actionIntent = classifyFaqActionIntent(safeMessage);
        const hasBookingContext = ["booking", "history"].includes(stageRef.current.view);
        const directCancellation = decision === null && (
          cancellationContinuation.handled
          || isDirectCancellationRequest(safeMessage, { hasBookingContext })
        );
        const localOfferTurn = decision === null
          && !cancellationFlowRef.current
          && !directCancellation
          && !historyRequest.requested
          && !directSeatSelection
          && !directCinemaSelection
          && !checkoutResumeTurn
          ? resolveLocalOfferTextTurn(safeMessage, { locale: localeRef.current })
          : null;
        const checkoutOfferEvaluation = activeCheckout && localOfferTurn
          ? evaluateCheckoutOfferTurn(localOfferTurn)
          : null;
        if (localOfferTurn) {
          if (checkoutOfferEvaluation) {
            conversation.sendContextualUpdate?.(`Approved published offer result for the guest's spoken question: ${checkoutOfferEvaluation.answer} The unpaid checkout is preserved but will be hidden while the relevant offer panel is shown. Do not claim the offer was applied.`);
          }
          try {
            const rawResult = await clientTools.show_offers({
              bankName: localOfferTurn.bankName,
              cardName: localOfferTurn.cardName,
              detailTopic: localOfferTurn.detailTopic,
            });
            const offerResult = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
            conversation.sendContextualUpdate?.(`The widget displayed the relevant published offer information and paused any previous booking panel. Approved answer: ${offerResult?.answer || checkoutOfferEvaluation?.answer || localOfferTurn.answer}. The checkout data remains preserved but hidden. Do not claim the offer was applied.`);
          } catch (error) {
            conversation.sendContextualUpdate?.(`The offer panel could not be opened: ${error?.message || "unknown error"}. Do not claim an offer was applied.`);
          }
        }
        dismissStaleTransactionalView({ text: safeMessage, actionIntent: directCancellation ? "cancellation" : actionIntent, historyRequested: historyRequest.requested, cancellationReply: decision !== null });
        const checkoutFaq = activeCheckout && !localOfferTurn && actionIntent !== "booking" && !directCinemaSelection && !directCancellation && !directSeatSelection
          ? prepareFaqContext(safeMessage)
          : { matches: [], context: "" };
        const discoveryFilterTurn = checkoutFaq.matches.length ? false : isDiscoveryFilterTurn(safeMessage);
        const faq = localOfferTurn
          ? { matches: [], context: "" }
          : checkoutFaq.matches.length
          ? checkoutFaq
          : directCinemaSelection || directCancellation || directSeatSelection || discoveryFilterTurn
            ? { matches: [], context: "" }
            : prepareFaqContext(safeMessage);
        const explicitDiscoveryTurn = !faq.matches.length && (actionIntent === "booking" || directCinemaSelection || isDiscoveryRequest(safeMessage));
        if (explicitDiscoveryTurn && (pausedJourneyRef.current.status === "paused" || activeCheckout || bookingRef.current?.ref)) {
          beginReplacementBookingJourney("voice_new_booking_replaced_previous");
        }
        pauseRenderingForUnrelatedTurn({
          decision,
          historyRequested: historyRequest.requested,
          directCancellation,
          directSeatSelection,
          directCinemaSelection,
          resumeTarget: requestedResumeTarget,
          languageControlTurn: isLanguageControlTurn(safeMessage),
          localOfferTurn,
          discoveryFilterTurn,
          actionIntent,
          faq,
        });
        const details = activeCheckout && !explicitDiscoveryTurn
          ? { cinema: null, requestedSeatTarget: null }
          : applyUtteranceBookingDetails(safeMessage, { actionIntent, hasFaq: faq.matches.length > 0 });
        const availableDates = programmingDatesForCinema(cinemaRef.current);
        const bookingContext = decision === null && !directCancellation && !faq.matches.length && (
          actionIntent === "booking"
          || (stageVisibleRef.current && !activeCheckout && journeyRef.current.intent === "booking")
          || isDiscoveryRequest(safeMessage)
          || isCinemaSelectionTurn({ view: stageRef.current.view, intent: journeyRef.current.intent, actionIntent, cinemaMatch: details.cinema })
        );
        const discoveryUpdate = bookingContext && !isLanguageControlTurn(safeMessage)
          ? applyDiscoveryPreferencesFromText(safeMessage, details.cinema ? { cinemaId: details.cinema.id, cinemaName: details.cinema.name } : {})
          : null;
        const quantityOnlyTurn = Boolean(details.requestedSeatTarget && !discoveryUpdate?.update?.hasDiscoverySignal);
        const dateRequest = bookingContext
          ? captureUserProgrammingDate(safeMessage, availableDates)
          : { requestedDate: null, unavailableDate: null };
        const { requestedDate, unavailableDate } = dateRequest;
        if (requestedDate) {
          commitDiscoveryPreferences({ patch: { date: requestedDate, dateSignal: discoveryUpdate?.preferences?.dateSignal || "explicit" } });
          conversation.sendContextualUpdate?.(`The guest explicitly selected programming date ${requestedDate}. The widget retained it and will apply it with the other filters. Do not ask for the date again or fall back to another date.`);
        } else if (unavailableDate) {
          showUnavailableProgrammingDate(unavailableDate);
          conversation.sendContextualUpdate?.(`The guest requested ${unavailableDate}, but it is not published for the selected cinema. Do not substitute another date. Available dates: ${availableDates.join(", ")}.`);
        }
        if (bookingContext && !resumeOnlyTurn && !quantityOnlyTurn && !isLanguageControlTurn(safeMessage) && !unavailableDate && !directSeatSelection && !directCancellation && !historyRequest.requested) {
          const normalizedCinemaTurn = details.cinema ? normalizeCinemaAsrForAgent(safeMessage, details.cinema) : safeMessage;
          conversation.sendContextualUpdate?.("The widget is applying the guest's retained cinema, date, time, genre, language, experience, movie, and audience criteria now. No movie selection is confirmed by this filter turn. Do not call a discovery or showtime tool concurrently, do not say 'great choice', and do not describe on-screen options until the widget supplies the authoritative outcome.");
          void routeDiscoveryTurn(safeMessage, {
            cinemaOverride: details.cinema,
            dateOverride: requestedDate,
            preferencesAlreadyApplied: true,
          }).then((result) => {
            if (result?.stale) return;
            const count = Array.isArray(result?.movies) ? result.movies.length : 0;
            const retained = discoveryPreferencesRef.current;
            conversation.sendContextualUpdate?.(`The widget applied all supplied discovery criteria. Visible result: ${result?.shown || "none"}; movie count: ${count}; missing: ${(result?.missing || []).join(", ") || "none"}; cinema: ${retained.cinemaName || "not supplied"}; date: ${retained.date || "not supplied"}; preferred time: ${retained.preferredTime || retained.timeBand || "not supplied"}; genre: ${retained.genre || "not supplied"}; language: ${retained.language || "not supplied"}; experience: ${retained.experience || "not supplied"}; audience: ${retained.audience || "not supplied"}; movie: ${retained.movieTitle || "not supplied"}. ${buildAuthoritativeDiscoveryContext(result)} Ask only the first missing item and do not list unfiltered movies.${normalizedCinemaTurn !== safeMessage ? ` Authoritative speech-recognition correction: “${safeMessage}” means “${normalizedCinemaTurn}”.` : ""}${result?.time?.usedNearestFallback ? ` No exact ${result.time.requestedTime} showtime exists; explicitly say the displayed times are the closest suitable options.` : ""}`);
          }).catch((error) => {
            conversation.sendContextualUpdate?.(`Filtered discovery could not be completed: ${error?.message || "unknown error"}. Do not claim that movie results are displayed.`);
          });
        }
        if (checkoutResumeTurn) conversation.sendContextualUpdate?.("The existing unpaid checkout was requested. Continue only from the widget result and do not restart movie, showtime, or seat selection.");
        else if (resumeOnlyTurn) conversation.sendContextualUpdate?.(`Continue from the currently visible ${stageRef.current.view} step. Preserve valid booking context and do not restart discovery.`);
        else if (activeCheckout && !checkoutOfferEvaluation && !explicitDiscoveryTurn && !directCancellation && !historyRequest.requested) conversation.sendContextualUpdate?.("An unpaid checkout remains preserved. If this is an unrelated question, it is hidden until the guest explicitly asks to return to checkout.");
        if (details.requestedSeatTarget) conversation.sendContextualUpdate?.(`The guest would like ${details.requestedSeatTarget} tickets. Treat this only as a target and guide them to select ${details.requestedSeatTarget} seats. The number of selected seats is the actual ticket count and controls pricing.`);
        if (directSeatSelection) {
          conversation.sendContextualUpdate?.("The widget is applying the guest's visible seat selection now. Wait for the widget result; do not claim checkout, payment, booking confirmation, a reference, or a QR yet.");
          void routeSeatSelectionTurn(safeMessage, seatTurn).then((result) => {
            conversation.sendContextualUpdate?.(seatSelectionResultContext(result));
          }).catch((error) => {
            conversation.sendContextualUpdate?.(`The seat confirmation failed: ${error?.message || "unknown error"}. The seat map remains visible; do not claim checkout or booking completion.`);
          });
        }
        if (historyRequest.requested) {
          conversation.sendContextualUpdate?.(`${bookingHistoryTurnContext(visibleHistory, { activeOnly: historyRequest.activeOnly })} Do not call another booking-history tool.`);
        }
        if (directCancellation) {
          conversation.sendContextualUpdate?.("The widget is resolving the exact cancellation target and checking eligibility. Do not guess a booking or claim cancellation yet.");
          void routeCancellationTurn(safeMessage, { continuation: cancellationContinuation }).then((result) => {
            conversation.sendContextualUpdate?.(cancellationResultContext(result));
          }).catch((error) => {
            conversation.sendContextualUpdate?.(`The cancellation check failed: ${error?.message || "unknown error"}. Do not claim cancellation or refund success.`);
          });
        }
        if (faq.matches.length) {
          conversation.sendContextualUpdate?.(`${faq.context}\nThe guest's spoken question is: ${safeMessage}. Answer from this approved context without restarting the active task.`);
        } else if (!localOfferTurn) updateIntentFromText(safeMessage);
      }
      const languageSignal = resolveLanguageSignal({
        role,
        text: safeMessage,
        currentLocale: localeRef.current,
        pendingLocale: pendingLanguageSwitchRef.current,
      });
      pendingLanguageSwitchRef.current = languageSignal.pendingLocale;
      if (languageSignal.nextLocale && languageSignal.nextLocale !== localeRef.current) {
        localeRef.current = languageSignal.nextLocale;
        setLocale(languageSignal.nextLocale);
      }
      if (role === "agent" && isAgentWelcome(safeMessage)) {
        const pendingTyped = pendingTypedMessagesRef.current.at(-1) || lastSentTextRef.current;
        const hasRecentTypedMessage = pendingTyped && Date.now() - pendingTyped.at < 15000;
        if (pendingTyped && !hasRecentTypedMessage) lastSentTextRef.current = null;
        if (!hasDisplayedWelcomeRef.current && !continuationSessionRef.current && !hasRecentTypedMessage) {
          const displayedWelcome = /\bvox concierge\b/i.test(safeMessage)
            ? VOXI_FIRST_MESSAGES[localeRef.current]
            : safeMessage;
          say("agent", displayedWelcome);
        }
        hasDisplayedWelcomeRef.current = true;
        return;
      }
      if (role !== "user") {
        const claimStage = stageVisibleRef.current ? stageRef.current : { view: "empty", pausedView: selectRestorableRichStage(pausedJourneyRef.current)?.view || null };
        const displayedMessage = role === "agent"
          ? guardAgentStateClaim(
            guardMovieDisplayClaim(safeMessage, claimStage, localeRef.current),
            { stage: claimStage, pendingOrder: pendingOrderRef.current, locale: localeRef.current },
          )
          : safeMessage;
        say(role, displayedMessage);
      }
    },
    onError: (error) => {
      console.error("Conversation error", error);
      say("system", t("app.connectionError"));
    },
  };

  const isTransportGenerationActive = useCallback(
    (generation) => transportGenerationRef.current === generation,
    [],
  );
  const updateTransportStatus = useCallback((generation, nextStatus) => {
    if (transportGenerationRef.current === generation) setTransportStatus(nextStatus);
  }, []);
  const retireTransportGeneration = useCallback((generation) => {
    if (transportGenerationRef.current !== generation) return;
    const nextGeneration = generation + 1;
    transportGenerationRef.current = nextGeneration;
    transportRef.current = null;
    setTransportStatus("disconnected");
    setTransportGeneration(nextGeneration);
  }, []);

  const unavailableTransport = () => Promise.reject(new Error("Conversation transport is restarting"));
  conversation = {
    status: transportStatus,
    startSession: (...args) => transportRef.current?.startSession(...args) ?? unavailableTransport(),
    endSession: (...args) => transportRef.current?.endSession(...args) ?? Promise.resolve(),
    getId: (...args) => transportRef.current?.getId?.(...args),
    sendContextualUpdate: (...args) => transportRef.current?.sendContextualUpdate?.(...args),
    sendUserMessage: (...args) => transportRef.current?.sendUserMessage?.(...args),
    sendUserActivity: (...args) => transportRef.current?.sendUserActivity?.(...args),
  };

  const status = conversation.status;
  const isConnected = status === "connected";

  const restartConversation = useCallback(async (reason = "manual_restart") => {
    if (checkoutPaymentActiveRef.current) {
      lastActivityRef.current = Date.now();
      say("system", localeRef.current === "ar"
        ? "جارٍ التحقق من الدفع. انتظر لحظة حتى تكتمل العملية."
        : "Payment authorization is in progress. Wait a moment for it to finish.");
      return false;
    }
    if (activeCancellationMutation()) {
      lastActivityRef.current = Date.now();
      say("system", localeRef.current === "ar"
        ? "جارٍ إتمام طلب الإلغاء الحالي. انتظر حتى يكتمل قبل بدء محادثة جديدة."
        : "The current cancellation is still processing. Wait for it to finish before starting a new conversation.");
      return false;
    }
    suppressDisconnectNoticeRef.current = true;
    disconnectReasonRef.current = reason;
    switchingSessionRef.current = false;
    try {
      if (conversation.status === "connected" || conversation.status === "connecting") await conversation.endSession();
    } catch (error) {
      console.warn("Conversation reset could not close the active transport cleanly", error);
    } finally {
      clearConversationState(reason);
      requestedSessionModeRef.current = null;
      sessionModeRef.current = null;
      setSessionMode(null);
      setStartingMode(null);
      suppressDisconnectNoticeRef.current = false;
      disconnectReasonRef.current = "ended";
    }
    return true;
  }, [clearConversationState, conversation, say]);

  useEffect(() => {
    const onRestart = () => { restartConversation("new_conversation"); };
    const onCrossTabLogout = async (event) => {
      if (event.key !== DEVICE_SESSION_EPOCH_KEY && event.key !== null) return;
      const nextEpoch = event.newValue || newDeviceSessionEpoch("logout-pending-cleared");
      if (nextEpoch === deviceSessionEpochRef.current) return;
      deviceSessionEpochRef.current = nextEpoch;
      cancellationOperationRef.current += 1;
      cancellationLockPendingRef.current = false;
      cancellationLockPromiseRef.current = null;
      cancellationInFlightRef.current = false;
      setCancellationFlow(null);
      setBookings([]);
      await restartConversation("cross_tab_logout");
    };
    const onLogout = async () => {
      if (activeCancellationMutation()) {
        lastActivityRef.current = Date.now();
        say("system", localeRef.current === "ar"
          ? "جارٍ إتمام طلب الإلغاء الحالي. انتظر حتى يكتمل قبل تسجيل الخروج."
          : "The current cancellation is still processing. Wait for it to finish before logging out.");
        return;
      }
      if (readCancellationJournal()?.privacySanitizationFailed) {
        lastActivityRef.current = Date.now();
        say("system", localeRef.current === "ar"
          ? "تعذر تأمين سجل الإلغاء السابق وحماية خصوصيته، لذلك لم يتم تسجيل الخروج. امسح بيانات هذا الموقع من إعدادات المتصفح أو تواصل مع الدعم."
          : "The previous cancellation safety record could not be secured and sanitized, so logout was stopped. Clear this site's data in browser settings or contact support.");
        return;
      }
      const storageLock = await withCancellationMutationLock(
        typeof navigator !== "undefined" ? navigator.locks : null,
        () => {
          if (activeCancellationMutation()) return { completed: false, reason: "cancellation_processing" };
          const pendingLogoutEpoch = newDeviceSessionEpoch("logout-pending");
          try {
            window.localStorage.setItem(DEVICE_SESSION_EPOCH_KEY, pendingLogoutEpoch);
            if (readDeviceSessionEpoch() !== pendingLogoutEpoch) throw new Error("Logout invalidation epoch was not retained.");
          } catch (error) {
            console.error("Cross-tab logout could not be started", error);
            return { completed: false, reason: "logout_broadcast_unavailable", privacyResetRequired: false };
          }
          let bookingClearFailed = false;
          let cardClearFailed = false;
          try {
            clearBookings();
          } catch (error) {
            bookingClearFailed = true;
            console.error("Locally stored bookings could not be cleared during logout", error);
          }
          try {
            window.localStorage.removeItem(DEMO_CARD_STORAGE_KEY);
            if (window.localStorage.getItem(DEMO_CARD_STORAGE_KEY) !== null) throw new Error("Demo card metadata remained after logout.");
          } catch (error) {
            cardClearFailed = true;
            console.error("Demo card metadata could not be cleared during logout", error);
          }
          try {
            window.localStorage.removeItem("vox_cards");
            if (window.localStorage.getItem("vox_cards") !== null) throw new Error("Legacy card metadata remained after logout.");
          } catch (error) {
            cardClearFailed = true;
            console.error("Legacy card metadata could not be cleared during logout", error);
          }
          if (bookingClearFailed || cardClearFailed) {
            return { completed: false, reason: "logout_cleanup_failed", privacyResetRequired: true, bookingClearFailed, cardClearFailed, nextDeviceSessionEpoch: pendingLogoutEpoch };
          }
          const nextDeviceSessionEpoch = newDeviceSessionEpoch();
          try {
            window.localStorage.setItem(DEVICE_SESSION_EPOCH_KEY, nextDeviceSessionEpoch);
            if (readDeviceSessionEpoch() !== nextDeviceSessionEpoch) throw new Error("Logout epoch was not retained.");
          } catch (error) {
            try { window.localStorage.setItem(DEVICE_SESSION_EPOCH_KEY, pendingLogoutEpoch); } catch {}
            console.error("Cross-tab logout could not be completed", error);
            return { completed: false, reason: "logout_broadcast_unavailable", privacyResetRequired: true, bookingClearFailed: false, cardClearFailed: true, nextDeviceSessionEpoch: pendingLogoutEpoch };
          }
          return { completed: true, bookingClearFailed: false, cardClearFailed: false, nextDeviceSessionEpoch };
        },
      );
      if (!storageLock.acquired || !storageLock.result?.completed) {
        const privacyResetRequired = Boolean(storageLock.result?.privacyResetRequired);
        if (privacyResetRequired) {
          deviceSessionEpochRef.current = storageLock.result.nextDeviceSessionEpoch || readDeviceSessionEpoch();
          setBookings([]);
          await restartConversation("logout_privacy_blocked");
        }
        lastActivityRef.current = Date.now();
        say("system", privacyResetRequired
          ? (localeRef.current === "ar"
            ? "تعذر إكمال التنظيف الآمن لبيانات تسجيل الخروج. تم إيقاف هذه الجلسة؛ امسح بيانات الموقع من إعدادات المتصفح قبل استخدام حساب آخر."
            : "Logout data cleanup could not be verified. This session was stopped; clear this site's data in browser settings before another account is used.")
          : (localeRef.current === "ar"
            ? "لم يكتمل تسجيل الخروج، وما زالت الجلسة الحالية مفتوحة. أغلق علامات التبويب الأخرى وحاول مرة أخرى."
            : "Logout was not completed and the current session remains open. Close other tabs and try again."));
        return;
      }
      const { bookingClearFailed, cardClearFailed, nextDeviceSessionEpoch } = storageLock.result;
      if (readDeviceSessionEpoch() === nextDeviceSessionEpoch) deviceSessionEpochRef.current = nextDeviceSessionEpoch;
      setBookings(bookingClearFailed ? readBookings() : []);
      await restartConversation("logout");
      if (bookingClearFailed || cardClearFailed) {
        say("system", localeRef.current === "ar"
          ? "تعذر مسح بعض البيانات المحلية من هذا الجهاز. أغلق المتصفح وامسح بيانات الموقع قبل استخدام حساب آخر."
          : "Some local data could not be cleared from this device. Close the browser and clear this site's data before another account is used.");
      }
    };
    window.addEventListener("voxi:new-conversation", onRestart);
    window.addEventListener("voxi:logout", onLogout);
    window.addEventListener("storage", onCrossTabLogout);
    return () => {
      window.removeEventListener("voxi:new-conversation", onRestart);
      window.removeEventListener("voxi:logout", onLogout);
      window.removeEventListener("storage", onCrossTabLogout);
    };
  }, [restartConversation]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const hasTransientState = messagesRef.current.length > 0 || stageRef.current.view !== "empty" || Boolean(sessionModeRef.current);
      if (!hasTransientState || Date.now() - lastActivityRef.current < CONVERSATION_IDLE_MS) return;
      if (activeCancellationMutation()) {
        lastActivityRef.current = Date.now();
        return;
      }
      disconnectReasonRef.current = "timeout";
      suppressDisconnectNoticeRef.current = false;
      if (sessionModeRef.current) conversation.endSession().catch(() => {
        clearConversationState("timeout");
        say("system", t("app.timeoutMessage"));
      });
      else {
        clearConversationState("timeout");
        say("system", t("app.timeoutMessage"));
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [clearConversationState, conversation, say, t]);

  const startTransportWithGuards = useCallback(async (options, epoch, timeoutMs) => {
    const generation = transportGenerationRef.current;
    const transport = transportRef.current || await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const waitForLazyTransport = () => {
        if (generation !== transportGenerationRef.current) {
          reject(new Error("Conversation transport restarted while loading"));
          return;
        }
        if (transportRef.current) {
          resolve(transportRef.current);
          return;
        }
        if (Date.now() - startedAt >= 10_000) {
          reject(new Error("Conversation transport could not load"));
          return;
        }
        window.setTimeout(waitForLazyTransport, 20);
      };
      waitForLazyTransport();
    });
    const startedConversationId = await startTransportWithRetirement({
      transport,
      options,
      retire: () => {
        if (sessionEpochRef.current === epoch) sessionEpochRef.current += 1;
        retireTransportGeneration(generation);
      },
      timeoutMs,
    });
    if (epoch !== sessionEpochRef.current || generation !== transportGenerationRef.current) {
      switchingSessionRef.current = true;
      try { await transport.endSession(); } catch {}
      finally { switchingSessionRef.current = false; }
      return null;
    }
    return startedConversationId || transport.getId?.() || "connected";
  }, [retireTransportGeneration]);

  const startTextSession = useCallback(async (excludeMessageId = null) => {
    if (!isUsableDeviceSessionEpoch(deviceSessionEpochRef.current) || readDeviceSessionEpoch() !== deviceSessionEpochRef.current) {
      say("system", localeRef.current === "ar" ? "امسح بيانات الموقع قبل بدء جلسة جديدة." : "Clear this site's data before starting a new session.");
      return false;
    }
    if (sessionModeRef.current) return true;
    setTransportEnabled(true);
    const activeStart = sessionStartRef.current;
    if (activeStart) {
      await activeStart.promise;
      if (sessionModeRef.current) return true;
    }

    const epoch = sessionEpochRef.current;
    requestedSessionEpochRef.current = epoch;
    requestedSessionModeRef.current = "text";
    continuationSessionRef.current = hasStartedConversationRef.current;
    setStartingMode("text");
    const contextMessages = messagesRef.current.filter((message) => message.id !== excludeMessageId);
    const start = (async () => {
      try {
        const activeLocale = localeRef.current;
        const continuation = continuationSessionRef.current;
        const previousTransportId = transportConversationIdRef.current;
        const handoffJourney = { ...journeyRef.current, locale: activeLocale, transportConversationId: previousTransportId };
        const startedConversationId = await startTransportWithGuards({
          agentId: import.meta.env.VITE_AGENT_ID || "agent_2701kxvmnje2fnf9qfm1fayfc4eb",
          connectionType: "websocket",
          textOnly: true,
          overrides: {
            conversation: { textOnly: true },
          },
          dynamicVariables: {
            ...journeyDynamicVariables(handoffJourney, { continuation }),
            voxi_session_opening: continuation
              ? (activeLocale === "ar" ? "نكمل من حيث توقفنا في طلبك الحالي." : "Let’s continue from your current booking or enquiry step.")
              : VOXI_FIRST_MESSAGES[activeLocale],
          },
        }, epoch);
        if (!startedConversationId || epoch !== sessionEpochRef.current) return false;
        hasStartedConversationRef.current = true;
        const nextTransportId = startedConversationId === "connected" ? conversation.getId?.() || null : startedConversationId;
        transportConversationIdRef.current = nextTransportId;
        const journeyPayload = {
          locale: activeLocale,
          cinema: cinemaRef.current,
          scheduleDate: scheduleDateRef.current,
          stage: stageVisibleRef.current ? stageRef.current : { view: "empty", paused: true, pausedView: selectRestorableRichStage(pausedJourneyRef.current)?.view || null },
          selectedSeats: seatsRef.current,
          ticketQuantity: pendingOrderRef.current?.seats?.length || seatsRef.current.length || null,
          pendingOrder: pendingOrderRef.current,
          booking: bookingRef.current,
          transportConversationId: nextTransportId,
          previousTransportConversationId: previousTransportId,
        };
        journeyRef.current = syncJourney(handoffJourney, journeyPayload);
        dispatchJourney({ type: "sync", payload: journeyPayload });
        conversation.sendContextualUpdate?.(`${VOXI_AGENT_PROMPT}\n\n${buildVoxiContext({
          locale: activeLocale,
          cinema: cinemaRef.current,
          scheduleDate: scheduleDateRef.current,
          stage: stageVisibleRef.current ? stageRef.current : { view: "empty", paused: true, pausedView: selectRestorableRichStage(pausedJourneyRef.current)?.view || null },
          selectedSeats: seatsRef.current,
          requestedSeatTarget: requestedSeatTargetRef.current,
          discoveryPreferences: discoveryPreferencesRef.current,
          offer: lastOfferRef.current,
          journey: journeyRef.current,
          messages: contextMessages,
        })}${continuation ? `\n\n${buildTransportHandoff(handoffJourney, contextMessages)}` : ""}\n\n${serializeFaqContext(VOX_FAQ_ENTRIES, { locale: activeLocale, maxChars: 14_000 })}`);
        return true;
      } catch (error) {
        console.error("Text conversation could not start", error);
        requestedSessionModeRef.current = null;
        sessionModeRef.current = null;
        setSessionMode(null);
        setStartingMode(null);
        say("system", t("app.textStartError"));
        return false;
      }
    })();
    const entry = { mode: "text", promise: start };
    sessionStartRef.current = entry;
    try {
      return await start;
    } finally {
      if (sessionStartRef.current === entry) sessionStartRef.current = null;
    }
  }, [conversation, say, startTransportWithGuards, t]);

  const startVoiceSession = useCallback(async () => {
    if (!isUsableDeviceSessionEpoch(deviceSessionEpochRef.current) || readDeviceSessionEpoch() !== deviceSessionEpochRef.current) {
      say("system", localeRef.current === "ar" ? "امسح بيانات الموقع قبل بدء جلسة صوتية جديدة." : "Clear this site's data before starting a new voice session.");
      return false;
    }
    if (sessionModeRef.current === "voice") return;
    const activeStart = sessionStartRef.current;
    if (activeStart) await activeStart.promise;
    if (sessionModeRef.current === "voice") return;

    const previousMode = sessionModeRef.current;
    const epoch = sessionEpochRef.current;
    const start = (async () => {
      let endedPreviousSession = false;
      setStartingMode("voice");
      try {
        // Permission is checked before ending text chat so a denial never
        // removes the guest's working, microphone-free conversation.
        const permissionRequest = navigator.mediaDevices.getUserMedia({ audio: true });
        let permissionTimer;
        let permissionStream;
        try {
          permissionStream = await Promise.race([
            permissionRequest,
            new Promise((_, reject) => {
              permissionTimer = window.setTimeout(() => reject(new Error("Microphone permission timed out")), VOICE_MIC_PERMISSION_TIMEOUT_MS);
            }),
          ]);
        } catch (error) {
          permissionRequest.then((lateStream) => lateStream.getTracks().forEach((track) => track.stop())).catch(() => {});
          throw error;
        } finally {
          window.clearTimeout(permissionTimer);
        }
        permissionStream.getTracks().forEach((track) => track.stop());
        if (epoch !== sessionEpochRef.current) return false;
        setTransportEnabled(true);
        if (sessionModeRef.current) {
          switchingSessionRef.current = true;
          await conversation.endSession();
          endedPreviousSession = true;
        }
        requestedSessionEpochRef.current = epoch;
        requestedSessionModeRef.current = "voice";
        continuationSessionRef.current = hasStartedConversationRef.current;
        const activeLocale = localeRef.current;
        const continuation = continuationSessionRef.current;
        const previousTransportId = transportConversationIdRef.current;
        const handoffJourney = { ...journeyRef.current, locale: activeLocale, transportConversationId: previousTransportId };
        const startedConversationId = await startTransportWithGuards({
          agentId: import.meta.env.VITE_AGENT_ID || "agent_2701kxvmnje2fnf9qfm1fayfc4eb",
          connectionType: "webrtc",
          textOnly: false,
          workletPaths: ELEVENLABS_WORKLET_PATHS,
          dynamicVariables: {
            ...journeyDynamicVariables(handoffJourney, { continuation }),
            voxi_session_opening: continuation
              ? (activeLocale === "ar" ? "نكمل من حيث توقفنا في طلبك الحالي." : "Let’s continue from your current booking or enquiry step.")
              : VOXI_FIRST_MESSAGES[activeLocale],
          },
        }, epoch, VOICE_TRANSPORT_START_TIMEOUT_MS);
        if (!startedConversationId || epoch !== sessionEpochRef.current) return false;
        hasStartedConversationRef.current = true;
        const nextTransportId = startedConversationId === "connected" ? conversation.getId?.() || null : startedConversationId;
        transportConversationIdRef.current = nextTransportId;
        const journeyPayload = {
          locale: activeLocale,
          cinema: cinemaRef.current,
          scheduleDate: scheduleDateRef.current,
          stage: stageVisibleRef.current ? stageRef.current : { view: "empty", paused: true, pausedView: selectRestorableRichStage(pausedJourneyRef.current)?.view || null },
          selectedSeats: seatsRef.current,
          ticketQuantity: pendingOrderRef.current?.seats?.length || seatsRef.current.length || null,
          pendingOrder: pendingOrderRef.current,
          booking: bookingRef.current,
          transportConversationId: nextTransportId,
          previousTransportConversationId: previousTransportId,
        };
        journeyRef.current = syncJourney(handoffJourney, journeyPayload);
        dispatchJourney({ type: "sync", payload: journeyPayload });
        conversation.sendContextualUpdate?.(`${VOXI_AGENT_PROMPT}\n\n${buildVoxiContext({
          locale: activeLocale,
          cinema: cinemaRef.current,
          scheduleDate: scheduleDateRef.current,
          stage: stageVisibleRef.current ? stageRef.current : { view: "empty", paused: true, pausedView: selectRestorableRichStage(pausedJourneyRef.current)?.view || null },
          selectedSeats: seatsRef.current,
          requestedSeatTarget: requestedSeatTargetRef.current,
          discoveryPreferences: discoveryPreferencesRef.current,
          offer: lastOfferRef.current,
          journey: journeyRef.current,
          messages: messagesRef.current,
        })}${continuation ? `\n\n${buildTransportHandoff(handoffJourney, messagesRef.current)}` : ""}\n\n${serializeFaqContext(VOX_FAQ_ENTRIES, { locale: activeLocale, maxChars: 14_000 })}`);
      } catch (error) {
        console.error("Voice conversation could not start", error);
        switchingSessionRef.current = false;
        setStartingMode(null);
        if (previousMode && !endedPreviousSession) {
          requestedSessionModeRef.current = previousMode;
          sessionModeRef.current = previousMode;
          setSessionMode(previousMode);
        } else {
          requestedSessionModeRef.current = null;
          sessionModeRef.current = null;
          setSessionMode(null);
        }
        say("system", t(voiceStartupErrorKey(error)));
      }
    })();
    const entry = { mode: "voice", promise: start };
    sessionStartRef.current = entry;
    try {
      return await start;
    } finally {
      if (sessionStartRef.current === entry) sessionStartRef.current = null;
    }
  }, [conversation, say, startTransportWithGuards, t]);

  const endVoiceSession = useCallback(async () => {
    switchingSessionRef.current = true;
    try {
      await conversation.endSession();
    } catch (error) {
      console.warn("Voice transport could not close cleanly", error);
    } finally {
      requestedSessionModeRef.current = null;
      sessionModeRef.current = null;
      setSessionMode(null);
      switchingSessionRef.current = false;
    }
    await startTextSession();
  }, [conversation, startTextSession]);

  const sendText = useCallback(async (text) => {
    const rawValue = (text ?? input).trim();
    if (!rawValue) return;
    if (!isUsableDeviceSessionEpoch(deviceSessionEpochRef.current) || readDeviceSessionEpoch() !== deviceSessionEpochRef.current) {
      setInput("");
      say("system", localeRef.current === "ar" ? "تم إيقاف هذه الجلسة لحماية الخصوصية. امسح بيانات الموقع قبل المتابعة." : "This session is paused for privacy. Clear this site's data before continuing.");
      return;
    }
    const sanitized = sanitizeUserText(rawValue);
    const value = sanitized.safeText.trim();
    if (!hasMeaningfulTurnContent(value)) {
      setInput("");
      return;
    }
    beginMeaningfulCancellationUserTurn();
    const requestedResumeTarget = pausedResumeTarget(value);
    if (!requestedResumeTarget) restoredStageToolGuardRef.current = null;
    const movieSelectionGrounding = buildMovieSelectionGroundingContext({ text: value, stage: stageVisibleRef.current ? stageRef.current : { view: "empty" } });
    const retryMovieSelectionGroundingAfterStart = Boolean(movieSelectionGrounding && !isConnected);
    if (movieSelectionGrounding) conversation.sendContextualUpdate?.(movieSelectionGrounding);
    if (sanitized.sensitive) {
      say("system", localeRef.current === "ar" ? "تمت إزالة بيانات الدفع الحساسة. أدخل معلومات الدفع في شاشة الدفع الآمنة فقط." : "Sensitive payment details were removed. Enter payment information only in the secure checkout screen.");
    }
    const languageSignal = resolveLanguageSignal({
      role: "user",
      text: value,
      currentLocale: localeRef.current,
      pendingLocale: pendingLanguageSwitchRef.current,
    });
    const languageControlTurn = Boolean(languageSignal.nextLocale || explicitLanguageRequest(value));
    pendingLanguageSwitchRef.current = languageSignal.pendingLocale;
    if (languageSignal.nextLocale && languageSignal.nextLocale !== localeRef.current) {
      localeRef.current = languageSignal.nextLocale;
      setLocale(languageSignal.nextLocale);
    }
    const localMessage = say("user", value);
    if (checkoutPaymentActiveRef.current) {
      setInput("");
      queuePendingEcho(value);
      const transition = sessionStartRef.current;
      if (transition) await transition.promise;
      const ready = sessionModeRef.current ? true : await startTextSession(localMessage.id);
      if (ready && conversation.sendUserMessage) {
        conversation.sendContextualUpdate?.("Payment authorization is in progress. Keep checkout mounted, answer without calling any display-changing tool, and ask the guest to wait for the on-screen result.");
        conversation.sendUserMessage(value);
      }
      return;
    }
    if (isExplicitConversationEndTurn(value)) {
      setInput("");
      conversation.sendContextualUpdate?.("The guest explicitly ended the conversation. The widget is clearing the active journey. Do not continue booking or cancellation and do not claim an existing booking record was cancelled.");
      const cleared = clearConversationState("conversation_ended");
      if (cleared) say("system", localeRef.current === "ar" ? "انتهت المحادثة وتم مسح رحلة الحجز النشطة." : "The conversation ended and the active booking journey was cleared.");
      if (conversation.status === "connected") {
        suppressDisconnectNoticeRef.current = true;
        await conversation.endSession();
      }
      return;
    }
    if (isExplicitJourneyCancellationTurn(value)) {
      setInput("");
      const abandoned = abandonActiveBookingJourney("guest_cancelled_active_journey");
      const notice = abandoned
        ? (localeRef.current === "ar" ? "تم إلغاء رحلة الحجز النشطة. لم يتم تغيير أي حجز مكتمل." : "The active booking journey was cleared. No completed booking record was changed.")
        : (localeRef.current === "ar" ? "لا يمكن إيقاف الرحلة أثناء معالجة عملية آمنة." : "The journey cannot be cleared while a secure operation is processing.");
      say("system", notice);
      conversation.sendContextualUpdate?.(`${notice} Do not call booking cancellation tools because this was about the active journey, not an existing booking record.`);
      return;
    }
    if (requestedResumeTarget) {
      setInput("");
      const restoreResult = await restorePausedJourney({ target: requestedResumeTarget, source: "text" });
      queuePendingEcho(value);
      const transition = sessionStartRef.current;
      if (transition) await transition.promise;
      const ready = sessionModeRef.current ? true : await startTextSession(localMessage.id);
      if (ready && conversation.sendUserMessage) {
        conversation.sendContextualUpdate?.(pausedRestoreContext(restoreResult));
        conversation.sendUserMessage(value);
      }
      updateIntentFromText(value);
      return;
    }
    const decision = cancellationFlowRef.current && !cancellationPausedRef.current ? cancellationDecision(value) : null;
    if (decision !== null) {
      const cancellationOutcome = publishCancellationDecision(
        handleCancellationDecision(decision, { source: "conversation" }),
        { promptAlreadyVisible: true },
      );
      if (cancellationOutcome?.handled) {
        // The widget owns typed cancellation confirmation state. Forwarding the
        // same yes/no turn to ElevenLabs can make the agent answer from the
        // previous confirmation phase after the local result has rendered.
        setInput("");
        return;
      }
    }
    const historyRequest = classifyBookingHistoryRequest(value);
    const visibleHistory = historyRequest.requested
      ? openHistory({ notifyAgent: false, forceOpen: true, activeOnly: historyRequest.activeOnly, preserveReturn: bookingOpenedFromHistoryRef.current })
      : null;
    const cancellationContinuation = decision === null
      ? resolveCancellationContinuation({ text: value, stage: stageRef.current, storedBookings: readBookings() })
      : { handled: false, bookingRef: null };
    const activeCheckout = Boolean(activeCheckoutStage());
    const checkoutSeatTarget = activeCheckout ? extractTicketQuantity(value) : null;
    const checkoutSeatEditTurn = decision === null && activeCheckout && (
      isCheckoutSeatEditTurn(value) || Boolean(checkoutSeatTarget)
    );
    if (checkoutSeatEditTurn) {
      if (stageRef.current.view !== "checkout") restoreActiveCheckout();
      const restored = backToSeatMapFromCheckout({ requestedTarget: checkoutSeatTarget });
      setInput("");
      queuePendingEcho(value);
      const transition = sessionStartRef.current;
      if (transition) await transition.promise;
      const ready = sessionModeRef.current ? true : await startTextSession(localMessage.id);
      if (ready && conversation.sendUserMessage) {
        conversation.sendContextualUpdate?.(restored
          ? `The guest returned to the seat map from checkout${checkoutSeatTarget ? ` with a target of ${checkoutSeatTarget} seats` : ""}. The visible seats are editable and the booking is not confirmed. Guide them to select the seats they want and confirm again.`
          : "The checkout seat context could not be restored. Continue from the panel currently shown and do not claim any booking confirmation.");
        conversation.sendUserMessage(value);
      }
      return;
    }
    const seatTurn = decision === null ? resolveVisibleSeatTurn(value) : { requested: false, seats: [] };
    const directSeatSelection = Boolean(seatTurn.requested);
    const checkoutResumeTurn = activeCheckout && (isResumeCheckoutTurn(value)
      || (stageRef.current.view !== "checkout" && isResumeOnlyTurn(value)));
    if (checkoutResumeTurn) restoreActiveCheckout();
    const resumeOnlyTurn = !directSeatSelection && (isResumeOnlyTurn(value) || checkoutResumeTurn);
    const directCinemaSelection = isDirectCinemaSelectionUtterance({
      text: value,
      view: stageRef.current.view,
      cinemaMatch: resolveCinema(value),
    });
    const actionIntent = classifyFaqActionIntent(value);
    const hasBookingContext = ["booking", "history"].includes(stageRef.current.view);
    const directCancellation = decision === null && (
      cancellationContinuation.handled
      || isDirectCancellationRequest(value, { hasBookingContext })
    );
    const localOfferTurn = decision === null
      && !cancellationFlowRef.current
      && !directCancellation
      && !historyRequest.requested
      && !directSeatSelection
      && !directCinemaSelection
      && !checkoutResumeTurn
      && !languageControlTurn
      ? resolveLocalOfferTextTurn(value, { locale: localeRef.current })
      : null;
    if (localOfferTurn && (activeCheckout || !isConnected)) {
      setInput("");
      let localAnswer = localOfferTurn.answer;
      let parsedResult = null;
      try {
        const rawResult = await clientTools.show_offers({
          bankName: localOfferTurn.bankName,
          cardName: localOfferTurn.cardName,
          detailTopic: localOfferTurn.detailTopic,
        });
        parsedResult = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
        if (parsedResult?.answer) localAnswer = parsedResult.answer;
      } catch (error) {
        console.warn("Local offer panel could not be opened", error);
      }
      say("agent", localAnswer);
      if (activeCheckout && isConnected) {
        conversation.sendContextualUpdate?.(`The guest asked about ${localOfferTurn.cardName || localOfferTurn.bankName}. The widget answered from published offer data and displayed the offer panel: ${localAnswer} Checkout ${parsedResult?.checkoutId || pendingOrderRef.current?.checkoutId || "current"} is preserved but hidden. Do not generate another reply for this turn and do not claim the offer was applied.`);
      }
      return;
    }
    dismissStaleTransactionalView({ text: value, actionIntent: directCancellation ? "cancellation" : actionIntent, historyRequested: historyRequest.requested, cancellationReply: decision !== null });
    const checkoutFaq = activeCheckout && actionIntent !== "booking" && !directCinemaSelection && !directCancellation && !directSeatSelection
      ? prepareFaqContext(value)
      : { matches: [], context: "" };
    const discoveryFilterTurn = checkoutFaq.matches.length ? false : isDiscoveryFilterTurn(value);
    const faq = checkoutFaq.matches.length
      ? checkoutFaq
      : directCinemaSelection || directCancellation || directSeatSelection || discoveryFilterTurn
        ? { matches: [], context: "" }
        : prepareFaqContext(value);
    const explicitDiscoveryTurn = !faq.matches.length && (actionIntent === "booking" || directCinemaSelection || isDiscoveryRequest(value));
    if (explicitDiscoveryTurn && (pausedJourneyRef.current.status === "paused" || activeCheckout || bookingRef.current?.ref)) {
      beginReplacementBookingJourney("text_new_booking_replaced_previous");
    }
    pauseRenderingForUnrelatedTurn({
      decision,
      historyRequested: historyRequest.requested,
      directCancellation,
      directSeatSelection,
      directCinemaSelection,
      resumeTarget: requestedResumeTarget,
      languageControlTurn,
      localOfferTurn,
      discoveryFilterTurn,
      actionIntent,
      faq,
    });
    const details = activeCheckout && !explicitDiscoveryTurn
      ? { cinema: null, requestedSeatTarget: null }
      : applyUtteranceBookingDetails(value, { actionIntent, hasFaq: faq.matches.length > 0 });
    const agentFacingValue = normalizeCinemaAsrForAgent(value, details.cinema);
    const bookingContext = decision === null && !directCancellation && !faq.matches.length && (
      actionIntent === "booking"
      || (stageVisibleRef.current && !activeCheckout && journeyRef.current.intent === "booking")
      || isDiscoveryRequest(value)
      || isCinemaSelectionTurn({ view: stageRef.current.view, intent: journeyRef.current.intent, actionIntent, cinemaMatch: details.cinema })
    );
    const discoveryUpdate = bookingContext && !languageControlTurn
      ? applyDiscoveryPreferencesFromText(value, details.cinema ? { cinemaId: details.cinema.id, cinemaName: details.cinema.name } : {})
      : null;
    const quantityOnlyTurn = Boolean(details.requestedSeatTarget && !discoveryUpdate?.update?.hasDiscoverySignal);
    const availableDates = programmingDatesForCinema(cinemaRef.current);
    const dateRequest = bookingContext
      ? captureUserProgrammingDate(value, availableDates)
      : { requestedDate: null, unavailableDate: null };
    const { requestedDate, unavailableDate } = dateRequest;
    if (requestedDate) commitDiscoveryPreferences({ patch: { date: requestedDate, dateSignal: discoveryUpdate?.preferences?.dateSignal || "explicit" } });
    if (unavailableDate) showUnavailableProgrammingDate(unavailableDate);
    if (!faq.matches.length) updateIntentFromText(value);
    setInput("");
    if (unavailableDate) {
      conversation.sendContextualUpdate?.(`The guest requested ${unavailableDate}, but it is not published for the selected cinema. No movies were displayed and no other date was substituted. Available dates: ${availableDates.join(", ")}.`);
    }
    let discoveryRouteResult = null;
    const cancellationRoutePromise = directCancellation
      ? routeCancellationTurn(value, { continuation: cancellationContinuation })
      : null;
    const seatRoutePromise = directSeatSelection ? routeSeatSelectionTurn(value, seatTurn) : null;
    if (bookingContext && !resumeOnlyTurn && !unavailableDate && !quantityOnlyTurn && !languageControlTurn && !directSeatSelection && !directCancellation && !historyRequest.requested) {
      discoveryRouteResult = await routeDiscoveryTurn(value, {
        cinemaOverride: details.cinema,
        dateOverride: requestedDate,
        preferencesAlreadyApplied: true,
      });
      if (discoveryRouteResult?.stale) discoveryRouteResult = null;
    }
    queuePendingEcho(agentFacingValue);
    const transition = sessionStartRef.current;
    if (transition) await transition.promise;
    const ready = sessionModeRef.current ? true : await startTextSession(localMessage.id);
    if (ready && conversation.sendUserMessage) {
      if (retryMovieSelectionGroundingAfterStart) conversation.sendContextualUpdate?.(movieSelectionGrounding);
      if (requestedDate) conversation.sendContextualUpdate?.(`The guest explicitly selected programming date ${requestedDate}; the widget retained it with all other criteria. Do not ask for the date again or fall back to another date.`);
      if (unavailableDate) conversation.sendContextualUpdate?.(`The guest requested ${unavailableDate}, but it is not published for the selected cinema. Do not substitute another date. Available dates: ${availableDates.join(", ")}.`);
      if (discoveryRouteResult) {
        const retained = discoveryPreferencesRef.current;
        const movieCount = Array.isArray(discoveryRouteResult.movies) ? discoveryRouteResult.movies.length : 0;
        conversation.sendContextualUpdate?.(`The widget applied every supplied discovery criterion. Visible result: ${discoveryRouteResult.shown || "none"}; movie count: ${movieCount}; missing: ${(discoveryRouteResult.missing || []).join(", ") || "none"}; cinema: ${retained.cinemaName || "not supplied"}; date: ${retained.date || "not supplied"}; preferred time: ${retained.preferredTime || retained.timeBand || "not supplied"}; genre: ${retained.genre || "not supplied"}; language: ${retained.language || "not supplied"}; experience: ${retained.experience || "not supplied"}; audience: ${retained.audience || "not supplied"}; movie: ${retained.movieTitle || "not supplied"}. ${buildAuthoritativeDiscoveryContext(discoveryRouteResult)} Ask only the first missing item and do not list unfiltered movies.${discoveryRouteResult.time?.usedNearestFallback ? ` No exact ${discoveryRouteResult.time.requestedTime} showtime exists; explicitly say the displayed times are the closest suitable options.` : ""}`);
      }
      if (details.requestedSeatTarget) conversation.sendContextualUpdate?.(`The guest would like ${details.requestedSeatTarget} tickets. Treat this only as a target and guide them to select ${details.requestedSeatTarget} seats. The number of selected seats is the actual ticket count and controls pricing.`);
      if (checkoutResumeTurn) conversation.sendContextualUpdate?.("The existing unpaid checkout was requested. Continue only from the widget result and do not restart movie, showtime, or seat selection.");
      else if (resumeOnlyTurn) conversation.sendContextualUpdate?.(`Continue from the currently visible ${stageRef.current.view} step. Preserve valid booking context and do not restart discovery.`);
      else if (activeCheckout && !explicitDiscoveryTurn && !directCancellation && !historyRequest.requested) conversation.sendContextualUpdate?.("An unpaid checkout remains preserved. If this is an unrelated question, it is hidden until the guest explicitly asks to return to checkout.");
      if (seatRoutePromise) {
        try {
          const seatResult = await seatRoutePromise;
          conversation.sendContextualUpdate?.(seatSelectionResultContext(seatResult));
        } catch (error) {
          conversation.sendContextualUpdate?.(`The seat confirmation failed: ${error?.message || "unknown error"}. The seat map remains visible; do not claim checkout or booking completion.`);
        }
      }
      if (historyRequest.requested) conversation.sendContextualUpdate?.(bookingHistoryTurnContext(visibleHistory, { activeOnly: historyRequest.activeOnly }));
      if (cancellationRoutePromise) {
        try {
          const cancellationResult = await cancellationRoutePromise;
          conversation.sendContextualUpdate?.(cancellationResultContext(cancellationResult, { promptAlreadyVisible: true }));
        } catch (error) {
          conversation.sendContextualUpdate?.(`The cancellation check failed: ${error?.message || "unknown error"}. Do not claim cancellation or refund success.`);
        }
      }
      if (faq.matches.length) conversation.sendContextualUpdate?.(`${faq.context}\nThe guest's current question is: ${value}. Answer from this approved context, use live data only when supplied, and do not restart the conversation.`);
      conversation.sendUserMessage(agentFacingValue);
    }
    else {
      pendingTypedMessagesRef.current = pendingTypedMessagesRef.current.filter((item) => item.text !== agentFacingValue);
      lastSentTextRef.current = pendingTypedMessagesRef.current.at(-1) || null;
    }
  }, [conversation, input, isConnected, prepareFaqContext, say, setLocale, startTextSession, updateIntentFromText]);

  const sendUiTurn = (text, { display = true, context = "" } = {}) => {
    if (display) say("user", text);
    if (!isConnected || !conversation.sendUserMessage) return;
    if (context) conversation.sendContextualUpdate?.(context);
    queuePendingEcho(text);
    conversation.sendUserMessage(text);
  };

  const pickMovie = async (movie) => {
    const cinemaId = cinemaRef.current?.id;
    if (!cinemaId) {
      showStage({ view: "cinemas" });
      return;
    }
    dismissPendingCancellation("movie_selected");
    clearSeatSelection();
    resetClarificationFailures();
    const requestedDate = scheduleDateRef.current;
    movieReturnPreferencesRef.current = discoveryPreferencesRef.current;
    const preferences = commitDiscoveryPreferences({ patch: {
      cinemaId,
      cinemaName: cinemaRef.current?.name || null,
      date: requestedDate,
      movieId: movie.id,
      movieTitle: movie.title,
    } }).preferences;
    const epoch = beginAsyncRequest();
    const revision = stageRevisionRef.current;
    let sessions;
    try {
      sessions = movie.relevantSessions?.length
        ? movie.relevantSessions
        : await vista.getSessions(cinemaId, movie.id, requestedDate);
    } catch (error) {
      console.error("VOXi showtime request failed", {
        operation: "getSessions",
        cinemaId,
        movieId: movie.id,
        programmingDate: requestedDate,
        code: error?.code || null,
        status: error?.status || null,
      });
      if (requestIsCurrent(epoch, revision, cinemaId, requestedDate)) {
        const message = loadingErrorMessage("showtimes");
        showStage({ view: "showtimes", movie, sessions: [], error: message, retryAvailable: true });
        say("system", message);
      }
      return;
    }
    if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return;
    const availability = filterCurrentSessions(sessions.map((session) => ({ ...session, cinemaId, scheduledFilmId: movie.id, movieId: movie.id })));
    sessions = filterDiscoveryResults({ movies: [movie], sessions: availability.available, cinemas: CINEMAS, preferences }).sessions;
    sessionsRef.current = sessions;
    sessionsFilmRef.current = movie.id;
    const filteredTime = filterDiscoveryResults({ movies: [movie], sessions, cinemas: CINEMAS, preferences }).time;
    const notice = filteredTime.usedNearestFallback
      ? (localeRef.current === "ar" ? `لا يوجد عرض عند ${filteredTime.requestedTime}. هذه أقرب الأوقات المناسبة.` : `No exact ${filteredTime.requestedTime} showtime is available. These are the closest suitable times.`)
      : null;
    showStage({ view: "showtimes", movie, sessions, notice, expiredSessionCount: availability.expired.length });
    sendUiTurn(movie.title, { context: `The guest selected ${movie.title} through the UI and its showtimes are already displayed. Do not call show_showtimes again. Acknowledge briefly and ask them to choose a showtime.` });
  };

  const pickSession = async (session) => {
    const cinemaId = cinemaRef.current?.id;
    if (!cinemaId) {
      showStage({ view: "cinemas" });
      return;
    }
    dismissPendingCancellation("session_selected");
    clearSeatSelection();
    resetClarificationFailures();
    const movie = stageRef.current.movie;
    const requestedDate = scheduleDateRef.current;
    if (!filterCurrentSessions([{ ...session, date: session.date || requestedDate }]).available.length) {
      say("system", localeRef.current === "ar" ? "انتهى موعد العرض هذا ولم يعد متاحاً للحجز. اختر موعداً مستقبلياً." : "That showtime has already started and is no longer bookable. Choose a future showtime.");
      return;
    }
    commitDiscoveryPreferences({ patch: { preferredTime: session.time, timeBand: null } });
    const epoch = beginAsyncRequest();
    const revision = stageRevisionRef.current;
    let plan;
    try {
      plan = await vista.getSeatPlan(cinemaId, session.sessionId);
    } catch (error) {
      if (requestIsCurrent(epoch, revision, cinemaId, requestedDate)) say("system", loadingErrorMessage("seats"));
      return;
    }
    if (!requestIsCurrent(epoch, revision, cinemaId, requestedDate)) return;
    const planMeta = vista.getResultMeta(plan);
    planRef.current = plan;
    planContextRef.current = { cinemaId, sessionId: session.sessionId };
    showStage({ view: "seatmap", movie, session, plan, planMeta });
    sendUiTurn(`${session.time} ${session.exp}`, { context: `The guest selected session ${session.sessionId}: ${session.time} ${session.exp} on ${session.date}, and the seat map is already displayed. Inventory verified: ${planMeta?.verified === true ? "yes" : "no"}. ${planMeta?.warning || ""} Do not call show_seat_map again. Acknowledge briefly, disclose any data warning, and ask them to select seats. ${requestedSeatTargetRef.current ? `Their conversational target is ${requestedSeatTargetRef.current} seats, but selected seats alone determine ticket count and price.` : "Do not ask for a separate ticket quantity."}` });
  };

  const openCinemaPicker = () => {
    if (checkoutPaymentActiveRef.current) return;
    dismissPendingCancellation("cinema_picker_opened");
    if (stageRef.current.view === "cinemas") {
      showStage(cinemaReturnRef.current || { view: "empty" });
      return;
    }
    cinemaReturnRef.current = stageRef.current;
    const filteredCinemas = filterDiscoveryResults({ cinemas: CINEMAS, preferences: { ...discoveryPreferencesRef.current, cinemaId: null, cinemaName: null } }).cinemas;
    showStage({ view: "cinemas", cinemas: filteredCinemas, notice: discoveryQuestion(["cinema"]), preferences: discoveryPreferencesRef.current });
  };

  const chooseCinema = async (nextCinema) => {
    if (nextCinema.id === cinemaRef.current?.id) {
      const pendingDate = userRequestedDateRef.current;
      if (pendingDate && !programmingDatesForCinema(nextCinema).includes(pendingDate)) {
        showUnavailableProgrammingDate(pendingDate);
        return;
      }
      showStage(cinemaReturnRef.current || stageRef.current);
      return;
    }
    resetClarificationFailures();
    clearSeatSelection();
    cinemaRef.current = nextCinema;
    setCinema(nextCinema);
    filmsRef.current = [];
    filmsCinemaRef.current = "";
    filmsDateRef.current = "";
    sessionsRef.current = [];
    sessionsFilmRef.current = "";
    const retainedDate = userRequestedDateRef.current || discoveryPreferencesRef.current.date || null;
    const preferences = commitDiscoveryPreferences({ patch: {
      cinemaId: nextCinema.id,
      cinemaName: nextCinema.name,
      ...(retainedDate ? { date: retainedDate } : {}),
    } }).preferences;
    const result = await routeDiscoveryTurn("", { cinemaOverride: nextCinema, dateOverride: retainedDate, preferencesAlreadyApplied: true });
    sendUiTurn(localeRef.current === "ar" ? `اخترت ${nextCinema.name}` : `I selected ${nextCinema.name}`, {
      context: `The guest selected ${nextCinema.name} through the UI. Retained criteria: ${JSON.stringify(preferences)}. The widget now shows ${result.shown || "no result"}; missing: ${(result.missing || []).join(", ") || "none"}. Do not ask for the cinema again. Ask only the first missing criterion, or describe only the filtered movies already displayed.`,
    });
  };

  const chooseDate = async (nextDate, { notifyAgent = true, addTranscript = true } = {}) => {
    const availableDates = programmingDatesForCinema(cinemaRef.current);
    if (!availableDates.includes(nextDate)) return;
    userRequestedDateRef.current = null;
    const selectedCinema = cinemaRef.current;
    if (!selectedCinema) {
      showStage({ view: "cinemas" });
      return;
    }
    commitDiscoveryPreferences({ patch: { date: nextDate, dateSignal: "explicit" } });
    if (nextDate !== scheduleDateRef.current) applyProgrammingDate(nextDate, "date_changed", availableDates);
    else clearSeatSelection();
    const result = await routeDiscoveryTurn("", { cinemaOverride: selectedCinema, dateOverride: nextDate, preferencesAlreadyApplied: true });
    if (notifyAgent) sendUiTurn(localeRef.current === "ar" ? `اخترت تاريخ ${nextDate}` : `I selected ${nextDate}`, {
      display: addTranscript,
      context: `The guest selected ${nextDate} through the UI. The widget retained all other discovery filters and now shows ${result.shown || "no result"}; missing: ${(result.missing || []).join(", ") || "none"}. Do not ask for the date again and do not list unfiltered movies.`,
    });
  };

  const restoreHistoryReturn = () => {
    const target = historyReturnRef.current || { view: "empty" };
    const context = historyContextRef.current;
    if (context) {
      cinemaRef.current = context.cinema || null;
      setCinema(context.cinema || null);
      bookingRef.current = context.booking || null;
      setBooking(context.booking || null);
      bookingOpenedFromHistoryRef.current = Boolean(context.bookingOpenedFromHistory);
      if (context.scheduleDate) {
        scheduleDateRef.current = context.scheduleDate;
        setScheduleDate(context.scheduleDate);
      }
      seatsRef.current = [...(context.selectedSeats || [])];
      setSelectedSeats([...(context.selectedSeats || [])]);
    }
    if (target.view !== "checkout") {
      showStage(target);
      return;
    }
    const activeOrder = pendingOrderRef.current;
    if (activeOrder?.checkoutId && activeOrder.checkoutId === target.order?.checkoutId) {
      showStage(target);
      return;
    }
    const targetCinemaId = target.order?.cinemaId || null;
    const targetSessionId = target.order?.sessionId || target.session?.sessionId || null;
    const planContext = planContextRef.current;
    const canRestoreTargetPlan = target.movie && target.session && planRef.current.length
      && targetCinemaId
      && planContext?.cinemaId === targetCinemaId
      && String(planContext?.sessionId) === String(targetSessionId);
    if (canRestoreTargetPlan) {
      const targetCinema = resolveCinema(targetCinemaId)
        || resolveCinema(target.order?.cinemaName)
        || { id: targetCinemaId, name: target.order?.cinemaName || targetCinemaId };
      cinemaRef.current = targetCinema;
      setCinema(targetCinema);
      const targetDate = target.order?.programmingDate || target.order?.performanceDate || target.order?.date || null;
      if (targetDate) {
        scheduleDateRef.current = targetDate;
        setScheduleDate(targetDate);
      }
      showStage({
        view: "seatmap",
        movie: target.movie,
        session: target.session,
        plan: planRef.current,
        planMeta: target.planMeta || vista.getResultMeta(planRef.current),
      });
      return;
    }
    const canRestoreCurrentMovies = cinemaRef.current && filmsRef.current.length
      && filmsCinemaRef.current === cinemaRef.current.id
      && filmsDateRef.current === scheduleDateRef.current;
    showStage(canRestoreCurrentMovies
      ? { view: "movies", movies: filmsRef.current }
      : { view: "empty" });
  };

  const openHistory = ({ notifyAgent = true, forceOpen = false, activeOnly = false, preserveReturn = false } = {}) => {
    if (checkoutPaymentActiveRef.current) return [];
    if (!deviceSessionIsCurrent()) {
      setBookings([]);
      showStage({ view: "empty" });
      say("system", localeRef.current === "ar"
        ? "تم إيقاف الوصول إلى البيانات المحلية حتى يتم مسح بيانات الموقع بعد تسجيل خروج غير مكتمل."
        : "Local data access is paused until this site's data is cleared after an incomplete logout.");
      return [];
    }
    if (stageRef.current.view === "history" && !forceOpen) {
      restoreHistoryReturn();
      return [];
    }
    if (!preserveReturn && stageRef.current.view !== "history") captureHistoryReturn();
    if (stageRef.current.view !== "history") pauseRichRenderingForTopicChange("history_opened", "booking_records");
    renderTopicRef.current = "booking_records";
    const visibleBookings = sortBookingsForDisplay(readBookings()).filter((item) => !activeOnly || isCurrentBooking(item));
    setHistoryFilter(activeOnly ? "active" : "all");
    setBookings(visibleBookings);
    showStage({ view: "history" });
    if (notifyAgent) sendUiTurn(localeRef.current === "ar" ? "اعرض حجوزاتي" : "Show my booking history", {
      context: bookingHistoryTurnContext(visibleBookings, { activeOnly }),
    });
    return visibleBookings;
  };

  const openOffers = () => {
    if (checkoutPaymentActiveRef.current) return;
    if (stageRef.current.view === "offers") {
      void restoreOffersReturn();
      return;
    }
    const current = stageRef.current;
    const activeOrder = pendingOrderRef.current;
    const activeBooking = current.view === "booking" ? bookingRef.current : null;
    clientTools.show_offers({ experience: current.session?.exp || activeOrder?.experience || activeBooking?.experience || "" });
  };

  const restoreOffersReturn = async () => {
    const target = offersReturnRef.current || { view: "empty" };
    const richView = richJourneyViewFromStage(target);
    if (!richView) {
      renderTopicRef.current = "general_enquiry";
      showStage(target);
      return;
    }
    const result = await restorePausedJourney({ target: richView, source: "offers_back" });
    if (!result.restored && !["showtime_unavailable", "selected_seats_unavailable"].includes(result.reason)) {
      showStage({ view: "empty" });
    }
  };

  const handleOfferSelection = (result) => {
    lastOfferRef.current = result || null;
    if (!result?.offer || !isConnected || !conversation.sendContextualUpdate) return;
    const bank = localizedValue(result.offer.bank, "en") || "the selected bank";
    const card = localizedValue(result.cardProfile?.name, "en") || "no exact card selected";
    const missing = (result.missingFields || []).join(", ") || "none";
    conversation.sendContextualUpdate(
      `The guest selected a published offer in the widget. Bank: ${bank}; card profile: ${card}; eligibility state: ${result.status || "unknown"}; missing fields: ${missing}. This contains offer labels only, not payment credentials. Treat it as guidance and never say the offer was applied.`,
    );
  };

  const selectHistoryBooking = (selected) => {
    const performanceDate = selected.performanceDate || selected.sourceDate || selected.date || null;
    const localBooking = { ...selected, date: performanceDate, performanceDate };
    if (localBooking.cinemaId || localBooking.cinemaName) {
      const selectedCinema = resolveCinema(localBooking.cinemaId) || resolveCinema(localBooking.cinemaName) || { id: localBooking.cinemaId || null, name: localBooking.cinemaName || null };
      cinemaRef.current = selectedCinema;
      setCinema(selectedCinema);
    }
    bookingRef.current = localBooking;
    bookingOpenedFromHistoryRef.current = true;
    setBooking(localBooking);
    showStage({ view: "booking", booking: localBooking });
    sendUiTurn(localeRef.current === "ar" ? `اخترت الحجز ${localBooking.ref}` : `I selected booking ${localBooking.ref}`, {
      context: `The guest selected on-device booking summary ${localBooking.ref}. Do not present it as a provider confirmation and do not reuse details from another booking. Read only these exact stored fields: movie ${localBooking.movie || "not supplied"}; cinema ${localBooking.cinemaName || localBooking.cinemaId || "not supplied"}; performance date ${performanceDate || "not supplied"}; time ${localBooking.time || "not supplied"}; experience ${localBooking.experience || "not supplied"}; screen ${localBooking.screen || "not supplied"}; seats ${(localBooking.seats || []).join(", ") || "not supplied"}; total ${localBooking.currency || "AED"} ${localBooking.total ?? "not supplied"}; status ${localBooking.cancelled ? "cancelled" : localBooking.bookingStatus || "saved"}; refund status ${localBooking.refundStatus || "none"}; refund reference ${localBooking.refundReference || "none"}. Never invent or substitute a time, seat, screen, or amount.`,
    });
  };

  const cancelHistoryBooking = async (selected) => {
    const selectedRef = selected?.ref;
    const processingMutation = activeCancellationMutation();
    if (processingMutation) return processingMutation;
    const reconciliationRequired = cancellationReconciliationRequired(selectedRef);
    if (reconciliationRequired) return reconciliationRequired;
    const existingFlow = cancellationFlowRef.current;
    if (selectedRef && existingFlow?.bookingRef && norm(existingFlow.bookingRef) === norm(selectedRef)
      && ["checking", "route_confirmation", "final_confirmation", "processing"].includes(existingFlow.phase)) {
      return {
        found: true,
        bookingRef: existingFlow.bookingRef,
        confirmationRequired: ["route_confirmation", "final_confirmation"].includes(existingFlow.phase),
        phase: existingFlow.phase,
        refundRoute: existingFlow.refundRoute || null,
        simulationOnly: Boolean(existingFlow.demoOnly),
        message: existingFlow.message || null,
      };
    }
    selectHistoryBooking(selected);
    const rawResult = await showBookingForAuthorizedCancellation({ bookingRef: selectedRef }, "ui_action");
    const result = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
    conversation.sendContextualUpdate?.(cancellationResultContext(result, { promptAlreadyVisible: true }));
    return result;
  };

  const toggleSeat = (seat) => {
    resetClarificationFailures();
    const current = seatsRef.current;
    if (!current.includes(seat.id) && current.length >= MAX_TICKETS) {
      say("system", localeRef.current === "ar" ? `يمكن اختيار ${MAX_TICKETS} مقاعد بحد أقصى في الحجز الواحد.` : `You can select up to ${MAX_TICKETS} seats in one booking.`);
      return;
    }
    const next = current.includes(seat.id) ? current.filter((id) => id !== seat.id) : [...current, seat.id];
    clearPendingOrder();
    seatsRef.current = next;
    setSelectedSeats(next);
    void refreshSeatQuote(next);
  };

  const confirmSeats = async (seats) => {
    const confirmationKey = seatConfirmationKey(seats);
    if (uiSeatConfirmationKeyRef.current === confirmationKey) return;
    uiSeatConfirmationKeyRef.current = confirmationKey;
    let result;
    try {
      result = await priceSeatSelection(seats);
    } finally {
      if (uiSeatConfirmationKeyRef.current === confirmationKey) uiSeatConfirmationKeyRef.current = null;
    }
    if (result.stale) return;
    if (!result.valid.length || result.reason === "pricing_unavailable") {
      const message = result.reason === "pricing_unavailable"
        ? (localeRef.current === "ar" ? "تعذر التحقق من السعر. حاول مرة أخرى قبل المتابعة إلى الدفع." : "The price could not be verified. Please try again before continuing to checkout.")
        : result.reason === "showtime_expired"
          ? (localeRef.current === "ar" ? "انتهى موعد العرض هذا ولم يعد متاحاً للحجز. ارجع واختر موعداً مستقبلياً." : "That showtime has already started and is no longer bookable. Go back and choose a future showtime.")
        : (localeRef.current === "ar" ? "اختر مقعداً متاحاً واحداً على الأقل." : "Select at least one available seat to continue.");
      say("system", message);
      return;
    }
    sendUiTurn(`Confirm seats ${result.valid.join(", ")}`, {
      context: `The guest selected seats ${result.valid.join(", ")} through the UI and checkout is already displayed. This confirms only the seat choice, not a booking, payment, reservation, reference, or QR. Do not call select_seats again. Tell the guest to complete the on-screen checkout or use Edit seats, and never ask for payment details by voice or text.`,
    });
  };

  const backFromShowtimes = () => {
    if (movieReturnPreferencesRef.current) {
      discoveryPreferencesRef.current = movieReturnPreferencesRef.current;
      setDiscoveryPreferences(movieReturnPreferencesRef.current);
      movieReturnPreferencesRef.current = null;
    }
    clearSeatSelection();
    const target = cinemaRef.current;
    if (!target || !discoveryPreferencesRef.current.date) {
      showDiscoveryPrompt(discoveryMissingCriteria(discoveryPreferencesRef.current), discoveryPreferencesRef.current);
      return;
    }
    void loadDiscoveryForCinema(target, discoveryPreferencesRef.current.date, discoveryPreferencesRef.current);
    conversation.sendContextualUpdate?.("The guest returned to the previously filtered movie results. Retain the existing cinema, date, time, genre, language, experience, and audience criteria.");
  };

  const backFromSeatMap = () => {
    const current = stageRef.current;
    clearSeatSelection();
    const cachedSessionsMatch = current.movie?.id
      && sessionsFilmRef.current === current.movie.id
      && sessionsRef.current.some((session) => String(session.sessionId) === String(current.session?.sessionId));
    if (cachedSessionsMatch) {
      showStage({ view: "showtimes", movie: current.movie, sessions: sessionsRef.current });
      conversation.sendContextualUpdate?.(`The guest used Back from the seat map. ${current.movie.title} showtimes are displayed again; no seat confirmation or checkout is active.`);
      return;
    }
    showStage({ view: "loading", label: localeRef.current === "ar" ? "جارٍ تحميل مواعيد العرض…" : "Loading showtimes…" });
    conversation.sendContextualUpdate?.("The guest used Back from the seat map. Showtime loading is displayed; no seat confirmation or checkout is active.");
    void clientTools.show_showtimes({ movieId: current.movie?.id, movieTitle: current.movie?.title });
  };

  const backToSeatMapFromCheckout = ({ requestedTarget = null } = {}) => {
    if (stageRef.current.view !== "checkout" && activeCheckoutStage()) restoreActiveCheckout();
    const current = stageRef.current;
    const order = pendingOrderRef.current;
    const plan = current.plan?.length ? current.plan : planRef.current;
    const planContext = planContextRef.current;
    const contextMatches = current.view === "checkout"
      && order?.checkoutId
      && current.order?.checkoutId === order.checkoutId
      && plan?.length
      && planContext?.cinemaId === order.cinemaId
      && String(planContext?.sessionId) === String(order.sessionId);
    if (!contextMatches) {
      clearSeatSelection();
      showStage(current.movie
        ? { view: "showtimes", movie: current.movie, sessions: sessionsRef.current }
        : { view: "empty" });
      conversation.sendContextualUpdate?.("Checkout could not be restored to its seat map because its session context changed. No old seats or price remain active.");
      return false;
    }
    const restoredSeats = [...(order.seats || [])];
    seatQuoteRequestRef.current += 1;
    setSeatQuote(null);
    clearPendingOrder();
    seatsRef.current = restoredSeats;
    setSelectedSeats(restoredSeats);
    if (requestedTarget) {
      requestedSeatTargetRef.current = requestedTarget;
      setRequestedSeatTarget(requestedTarget);
    }
    showStage({
      view: "seatmap",
      movie: current.movie,
      session: current.session,
      plan,
      planMeta: current.planMeta || vista.getResultMeta(plan),
    });
    conversation.sendContextualUpdate?.(`The guest returned from checkout to edit seats. ${restoredSeats.length} selected seat${restoredSeats.length === 1 ? " is" : "s are"} visible.${requestedTarget ? ` The requested target is ${requestedTarget} seats.` : ""} Any seat change will recalculate ticket count and pricing before a new checkout.`);
    return true;
  };

  const announceCancellationSystem = (source, message) => {
    if (cancellationDecisionOutputOwner({ source }) === "local") say("system", message);
  };

  const executeCancellationMutation = async ({ source = "ui" } = {}) => {
    const current = bookingRef.current;
    const flow = cancellationFlowRef.current;
    if (!deviceSessionIsCurrent()) {
      const reason = "stale_device_session";
      const message = localeRef.current === "ar"
        ? "تم تسجيل الخروج في علامة تبويب أخرى، لذلك لم يتم إرسال طلب الإلغاء. ابدأ جلسة جديدة ثم تحقق من الحجز."
        : "This device was logged out in another tab, so no cancellation request was sent. Start a new session and check the booking again.";
      if (mountedRef.current) {
        setCancellationFlow({ phase: "error", bookingRef: null, demoOnly: false, refundRoute: null, error: reason, message });
        announceCancellationSystem(source, message);
      }
      return { confirmed: false, reason, message };
    }
    const existingJournal = readCancellationJournal();
    const journalBlocksCurrent = Boolean(existingJournal);
    if (journalBlocksCurrent) {
      if (!existingJournal.orphaned) markCancellationJournalForReconciliation(existingJournal.token);
      const reconciliation = cancellationReconciliationRequired();
      const message = reconciliation?.message || (localeRef.current === "ar"
        ? "توجد نتيجة إلغاء سابقة تحتاج إلى التحقق. لم يتم إرسال طلب جديد. تحقق عبر خدمة إدارة الحجز الرسمية من VOX."
        : "An earlier cancellation result requires verification. No new request was sent. Check the official VOX Manage Booking service.");
      return { ...(reconciliation || {}), confirmed: false, reason: reconciliation?.reason || "provider_reconciliation_required", message };
    }
    if (!current || !isCurrentBooking(current) || cancellationInFlightRef.current) {
      const message = localeRef.current === "ar" ? "الإلغاء غير متاح للحجز الحالي. لم يتم تأكيد أي تغيير." : "Cancellation is not available for the current booking. No change was confirmed.";
      return { confirmed: false, bookingRef: current?.ref || null, reason: "cancellation_unavailable", message };
    }
    let latestStoredBooking;
    try {
      latestStoredBooking = findBooking(current.ref, { strict: true });
    } catch (error) {
      const reason = error?.code || "booking_storage_unavailable_for_cancellation";
      const message = localeRef.current === "ar"
        ? "تعذر التحقق بأمان من حالة الحجز المخزنة، لذلك لم يتم إرسال طلب إلغاء. أصلح تخزين الموقع أو استخدم خدمة إدارة الحجز الرسمية من VOX."
        : "The stored booking status could not be verified safely, so no cancellation request was sent. Restore site storage or use the official VOX Manage Booking service.";
      if (mountedRef.current) {
        setCancellationFlow({ phase: "error", bookingRef: current.ref, demoOnly: Boolean(flow?.demoOnly), refundRoute: flow?.refundRoute || null, error: reason, message, retryAllowed: true, dismissAllowed: true, outcomeUnknown: false });
        announceCancellationSystem(source, message);
      }
      return { confirmed: false, bookingRef: current.ref, reason, message };
    }
    if (latestStoredBooking?.cancelled) {
      bookingRef.current = latestStoredBooking;
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
      setCancellationFlow(null);
      if (mountedRef.current) {
        setBooking(latestStoredBooking);
        setBookings(readBookings());
        if (stageRef.current.view === "booking") showStage({ view: "booking", booking: latestStoredBooking });
        announceCancellationSystem(source, localeRef.current === "ar" ? "هذا الحجز ملغى بالفعل." : "This booking is already cancelled.");
      }
      return { confirmed: false, bookingRef: current.ref, reason: "already_cancelled", message: localeRef.current === "ar" ? "هذا الحجز ملغى بالفعل." : "This booking is already cancelled." };
    }
    if (flow?.bookingRef && norm(flow.bookingRef) !== norm(current.ref)) {
      const message = localeRef.current === "ar" ? "تغير الحجز النشط قبل تنفيذ الإلغاء. لم يتم تأكيد أي تغيير." : "The active booking changed before cancellation could run. No change was confirmed.";
      return { confirmed: false, bookingRef: current.ref, reason: "booking_context_changed", message };
    }
    const operationId = cancellationOperationRef.current + 1;
    cancellationOperationRef.current = operationId;
    const operationSessionEpoch = sessionEpochRef.current;
    const operationBookingRef = norm(current.ref);
    const cancellationJournal = writeCancellationJournal();
    if (!cancellationJournal.persisted) {
      clearCancellationJournal(cancellationJournal.token);
      const reason = "persistent_mutation_lock_unavailable";
      const message = localeRef.current === "ar"
        ? "تعذر تأمين طلب الإلغاء على هذا الجهاز، لذلك لم يتم إرسال أي طلب. حاول مرة أخرى بعد تفعيل التخزين المحلي أو استخدم خدمة إدارة الحجز الرسمية من VOX."
        : "The cancellation request could not be secured on this device, so no request was sent. Enable local storage and try again, or use the official VOX Manage Booking service.";
      setCancellationFlow({ phase: "error", bookingRef: current.ref, demoOnly: Boolean(flow?.demoOnly), refundRoute: flow?.refundRoute || null, error: reason, message });
      announceCancellationSystem(source, message);
      return { confirmed: false, bookingRef: current.ref, reason, message };
    }
    cancellationInFlightRef.current = true;
    setCancellationFlow({ ...flow, bookingRef: current.ref, phase: "processing", message: localeRef.current === "ar" ? "جارٍ معالجة طلب الإلغاء…" : "Processing cancellation…", error: null });
    let refundResult;
    let refundError = null;
    try {
      refundResult = await vista.refundBooking(current.ref, {
        booking: current,
        idempotencyKey: cancellationJournal.token,
      });
    } catch (error) {
      refundError = error;
    }
    if (refundError) {
      const disposition = classifyRefundFailure(refundError);
      const reconciliationRequired = disposition === "ambiguous";
      if (reconciliationRequired) markCancellationJournalForReconciliation(cancellationJournal.token);
      else clearCancellationJournal(cancellationJournal.token);
      const operationIsCurrent = cancellationOperationRef.current === operationId;
      if (operationIsCurrent) cancellationInFlightRef.current = false;
      const reason = refundError?.code || refundError?.message || "refund_failed";
      const message = reconciliationRequired
        ? (localeRef.current === "ar"
          ? "تعذر التحقق من نتيجة طلب الإلغاء، لذلك لن نعيد المحاولة. تحقق من حجوزاتك عبر خدمة إدارة الحجز الرسمية من VOX أو تواصل مع الدعم."
          : "The cancellation outcome could not be verified, so Voxi will not retry it. Check your bookings in the official VOX Manage Booking service or contact support.")
        : (localeRef.current === "ar"
          ? "رفضت خدمة الحجز طلب الإلغاء ولم يتم تطبيق أي استرداد. بقي الحجز نشطاً."
          : "The booking service rejected the cancellation and no refund was applied. The booking remains active.");
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
      if (mountedRef.current) {
        setCancellationFlow({ phase: "error", bookingRef: current.ref, demoOnly: Boolean(flow?.demoOnly), refundRoute: flow?.refundRoute || null, error: reason, message, retryAllowed: !reconciliationRequired, dismissAllowed: !reconciliationRequired, outcomeUnknown: reconciliationRequired });
        announceCancellationSystem(source, message);
      }
      return { confirmed: false, bookingRef: current.ref, reason, reconciliationRequired, message };
    }
    const isDemoSimulation = refundResult?.demo === true
      && refundResult?.verified !== true
      && refundResult?.applied !== true;
    const refundReference = refundResult?.RefundReference || refundResult?.refundReference || refundResult?.reference || null;
    const liveRefundSucceeded = refundResult?.demo !== true
      && refundResult?.verified === true
      && refundResult?.applied === true
      && Boolean(refundReference);
    const operationIsCurrent = cancellationOperationRef.current === operationId;
    const appSessionIsCurrent = sessionEpochRef.current === operationSessionEpoch;
    const bookingContextIsCurrent = norm(bookingRef.current?.ref) === operationBookingRef;
    const bookingPanelIsCurrent = stageRef.current.view === "booking" && bookingContextIsCurrent;
    if (operationIsCurrent) cancellationInFlightRef.current = false;
    const cancelledAt = new Date().toISOString();
    const updated = {
      ...current,
      cancelled: true,
      cancelledAt,
      bookingStatus: isDemoSimulation ? "cancelled_demo" : "cancelled",
      refundRoute: isDemoSimulation ? null : "VOX Wallet",
      refundStatus: isDemoSimulation ? "not_processed_demo" : "processed",
      refundReference: isDemoSimulation ? null : refundReference,
    };
    if (!operationIsCurrent || !appSessionIsCurrent) {
      // Never repopulate device storage after a reset/logout. A verified live
      // refund remains provider truth, but it must not leak into a new session.
      if (liveRefundSucceeded) {
        markCancellationJournalForReconciliation(cancellationJournal.token);
        console.warn("A live refund completed after its Voxi session was no longer active", refundReference);
      } else {
        clearCancellationJournal(cancellationJournal.token);
      }
      const message = liveRefundSucceeded
        ? (localeRef.current === "ar"
          ? `تم تأكيد الاسترداد بالمرجع ${refundReference}، لكن جلسة Voxi تغيرت. تحقق من الحالة عبر خدمة إدارة الحجز الرسمية من VOX.`
          : `The refund was confirmed with reference ${refundReference}, but the Voxi session changed. Check the status in the official VOX Manage Booking service.`)
        : (localeRef.current === "ar" ? "تغيرت جلسة Voxi قبل تأكيد الإلغاء. لم يتم تأكيد أي تغيير." : "The Voxi session changed before cancellation was confirmed. No change was confirmed.");
      return { confirmed: liveRefundSucceeded, bookingRef: current.ref, reason: liveRefundSucceeded ? null : "session_changed", refundReference, message };
    }
    if (!isDemoSimulation && !liveRefundSucceeded) {
      markCancellationJournalForReconciliation(cancellationJournal.token);
      const reason = refundResult?.ErrorDescription || refundResult?.message || "The refund adapter did not confirm cancellation.";
      const message = localeRef.current === "ar"
        ? "تعذر التحقق من نتيجة الإلغاء، لذلك لن نعيد المحاولة. تحقق عبر خدمة إدارة الحجز الرسمية من VOX."
        : "The cancellation outcome could not be verified, so Voxi will not retry it. Check the official VOX Manage Booking service.";
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
      if (mountedRef.current) {
        setCancellationFlow({ phase: "error", bookingRef: current.ref, demoOnly: Boolean(flow?.demoOnly), refundRoute: flow?.refundRoute || null, error: reason, message, retryAllowed: false, dismissAllowed: false, outcomeUnknown: true });
        announceCancellationSystem(source, message);
      }
      return { confirmed: false, bookingRef: current.ref, reason, reconciliationRequired: true, message };
    }
    let storagePersisted = false;
    let storageError = null;
    try {
      appendBooking(updated);
      storagePersisted = true;
    } catch (error) {
      storageError = error;
      console.error("Cancellation result could not be written to local booking history", error);
    }
    if (storagePersisted) clearCancellationJournal(cancellationJournal.token);
    else if (liveRefundSucceeded) markCancellationJournalForReconciliation(cancellationJournal.token);
    else clearCancellationJournal(cancellationJournal.token);
    if (isDemoSimulation && !storagePersisted) {
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
      const reason = storageError?.message || "The on-device cancellation could not be saved.";
      const message = localeRef.current === "ar" ? "تعذر حفظ حالة الإلغاء على هذا الجهاز. بقي الحجز نشطاً." : "The cancellation could not be saved on this device. The booking remains active.";
      if (mountedRef.current) {
        setCancellationFlow({ phase: "error", bookingRef: current.ref, demoOnly: true, refundRoute: null, error: reason, message });
        announceCancellationSystem(source, localeRef.current === "ar"
          ? "تعذر تسجيل الإلغاء على هذا الجهاز. بقي سجل الحجز نشطاً، ولم تتم معالجة أي استرداد."
          : "The cancellation could not be saved on this device. The booking summary remains active and no refund was processed.");
      }
      return { confirmed: false, simulationOnly: true, bookingRef: current.ref, reason, message };
    }
    const completionMessage = buildCancellationCompletionMessage({
      locale: localeRef.current,
      isDemoSimulation,
      storagePersisted,
      bookingRef: updated.ref,
      refundReference,
    });
    if (bookingContextIsCurrent) {
      bookingRef.current = updated;
      if (mountedRef.current) setBooking(updated);
    }
    if (norm(historyReturnRef.current?.booking?.ref) === operationBookingRef) {
      historyReturnRef.current = { ...historyReturnRef.current, booking: updated };
    }
    if (norm(historyContextRef.current?.booking?.ref) === operationBookingRef) {
      historyContextRef.current = { ...historyContextRef.current, booking: updated };
    }
    if (!mountedRef.current) {
      return {
        confirmed: true,
        simulationOnly: isDemoSimulation,
        localCancellationRecorded: isDemoSimulation,
        liveRefundConfirmed: liveRefundSucceeded,
        refundApplied: liveRefundSucceeded,
        bookingRef: updated.ref,
        bookingStatus: updated.bookingStatus,
        refundStatus: updated.refundStatus,
        refundReference,
        storagePersisted,
        message: completionMessage,
      };
    }
    setBookings(storagePersisted
      ? readBookings()
      : (existing) => existing.some((item) => norm(item.ref) === operationBookingRef)
        ? existing.map((item) => norm(item.ref) === operationBookingRef ? updated : item)
        : [...existing, updated]);
    const cancellationResultShouldRender = bookingPanelIsCurrent
      && stageVisibleRef.current
      && ["booking_records", "cancellation"].includes(renderTopicRef.current)
      && !cancellationPausedRef.current;
    if (cancellationResultShouldRender) showStage({ view: "booking", booking: updated });
    const withoutCancellation = invalidatePausedRichStage(pausedJourneyRef.current, {
      views: ["cancellation"],
      reason: "cancellation_completed",
    });
    if (withoutCancellation !== pausedJourneyRef.current) commitPausedJourney(withoutCancellation);
    cancellationPausedRef.current = false;
    window.clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = null;
    setCancellationFlow(null);
    const completionOutputOwner = cancellationCompletionOutputOwner({ source, isDemoSimulation });
    if (completionOutputOwner === "local") {
      announceCancellationSystem(source, completionMessage);
    }
    if (source === "ui") {
      if (isDemoSimulation) {
        conversation.sendContextualUpdate?.(`Booking summary ${updated.ref} is marked cancelled only on this device. Refund status is not processed; no refund occurred and there is no refund reference. The deterministic system notice already states this outcome, so do not add another cancellation response or describe it as a completed refund.`);
      } else {
        sendUiTurn(localeRef.current === "ar" ? `نعم، ألغِ الحجز ${updated.ref}` : `Yes, cancel booking ${updated.ref}`, {
          context: `The verified refund adapter confirmed cancellation of ${updated.ref}. Refund route: VOX Wallet. Refund reference: ${refundReference}. Local storage persisted: ${storagePersisted ? "yes" : "no"}. Confirm the refund truthfully and disclose the local-storage warning when present.`,
        });
      }
    }
    resetClarificationFailures();
    return {
      confirmed: true,
      simulationOnly: isDemoSimulation,
      localCancellationRecorded: isDemoSimulation,
      liveRefundConfirmed: liveRefundSucceeded,
      refundApplied: liveRefundSucceeded,
      bookingRef: updated.ref,
      bookingStatus: updated.bookingStatus,
      refundStatus: updated.refundStatus,
      refundReference,
      storagePersisted,
      message: completionMessage,
    };
  };

  const completeCancellation = async ({ source = "ui" } = {}) => {
    if (cancellationLockPromiseRef.current) return cancellationLockPromiseRef.current;
    const current = bookingRef.current;
    const flow = cancellationFlowRef.current;
    const reconciliation = cancellationReconciliationRequired();
    if (reconciliation) {
      return {
        ...reconciliation,
        message: reconciliation.message || (localeRef.current === "ar"
          ? "تحتاج نتيجة إلغاء سابقة إلى التحقق. لم يتم إرسال طلب جديد."
          : "An earlier cancellation result requires verification. No new request was sent."),
      };
    }
    const pendingJournal = readCancellationJournal();
    if (pendingJournal) {
      const pendingResult = syncCancellationJournalUi();
      return pendingResult || {
        confirmed: false,
        reason: "provider_outcome_pending",
        message: localeRef.current === "ar" ? "لا تزال نتيجة طلب الإلغاء قيد التحقق. لم يتم إرسال طلب جديد." : "The cancellation result is still being verified. No new request was sent.",
      };
    }
    if (!current || !isCurrentBooking(current) || cancellationInFlightRef.current) {
      return {
        confirmed: false,
        bookingRef: current?.ref || null,
        reason: "cancellation_unavailable",
        message: localeRef.current === "ar" ? "الإلغاء غير متاح للحجز الحالي. لم يتم تأكيد أي تغيير." : "Cancellation is not available for the current booking. No change was confirmed.",
      };
    }
    if (flow?.bookingRef && norm(flow.bookingRef) !== norm(current.ref)) {
      return {
        confirmed: false,
        bookingRef: current.ref,
        reason: "booking_context_changed",
        message: localeRef.current === "ar" ? "تغير الحجز النشط قبل تنفيذ الإلغاء. لم يتم تأكيد أي تغيير." : "The active booking changed before cancellation could run. No change was confirmed.",
      };
    }
    cancellationLockPendingRef.current = true;
    setCancellationFlow({ ...flow, bookingRef: current.ref, phase: "processing", message: localeRef.current === "ar" ? "جارٍ تأمين طلب الإلغاء…" : "Securing cancellation…", error: null });
    let lockPromise;
    lockPromise = (async () => {
      try {
        const lockResult = await withCancellationMutationLock(
          typeof navigator !== "undefined" ? navigator.locks : null,
          () => executeCancellationMutation({ source }),
        );
        if (lockResult.acquired) {
          const result = lockResult.result;
          if (!result?.confirmed && cancellationFlowRef.current?.phase === "processing" && !cancellationInFlightRef.current) {
            const journal = readCancellationJournal();
            const reconciliationResult = cancellationReconciliationRequired();
            if (!reconciliationResult && !journal) {
              setCancellationFlow(null);
            }
          }
          return result;
        }
        const reason = lockResult.reason;
        const message = reason === "cross_tab_mutation_in_progress"
          ? (localeRef.current === "ar"
            ? "تجري معالجة طلب إلغاء آخر في علامة تبويب أخرى. لم يتم إرسال طلب جديد. انتظر حتى يكتمل ثم حدّث سجل الحجوزات."
            : "Another cancellation is processing in a different tab. No new request was sent. Wait for it to finish, then refresh booking history.")
          : (localeRef.current === "ar"
            ? "تعذر تأمين طلب الإلغاء عبر علامات تبويب المتصفح، لذلك لم يتم إرسال أي طلب. استخدم خدمة إدارة الحجز الرسمية من VOX."
            : "The cancellation could not be secured across browser tabs, so no request was sent. Use the official VOX Manage Booking service.");
        if (mountedRef.current) {
          setCancellationFlow({ phase: "error", bookingRef: current.ref, demoOnly: Boolean(flow?.demoOnly), refundRoute: flow?.refundRoute || null, error: reason, message });
          announceCancellationSystem(source, message);
        }
        return { confirmed: false, bookingRef: current.ref, reason, message };
      } catch (error) {
        // An unexpected executor failure may have happened after a provider call.
        // Preserve (or create) an opaque reconciliation journal so a retry cannot
        // accidentally issue a second refund request.
        cancellationInFlightRef.current = false;
        window.clearTimeout(cancelTimerRef.current);
        cancelTimerRef.current = null;
        let journal = readCancellationJournal();
        if (!journal) {
          const emergencyJournal = writeCancellationJournal();
          journal = emergencyJournal.persisted ? emergencyJournal : null;
        }
        if (journal?.token) markCancellationJournalForReconciliation(journal.token);
        const reason = error?.code || error?.message || "cancellation_outcome_unverified";
        const message = localeRef.current === "ar"
          ? "تعذر التحقق من نتيجة طلب الإلغاء. لن يتم إرسال طلب آخر؛ تحقق من الحجز عبر خدمة إدارة الحجز الرسمية من VOX أو تواصل مع الدعم."
          : "The cancellation outcome could not be verified. No further request will be sent; check the booking in the official VOX Manage Booking service or contact support.";
        if (mountedRef.current) {
          setCancellationFlow({
            phase: "error",
            bookingRef: null,
            demoOnly: false,
            refundRoute: null,
            error: reason,
            message,
            retryAllowed: false,
            dismissAllowed: false,
            outcomeUnknown: true,
            journalStartedAt: journal?.startedAt || Date.now(),
          });
          announceCancellationSystem(source, message);
        }
        return { confirmed: false, bookingRef: null, reason, reconciliationRequired: true, message };
      } finally {
        cancellationLockPendingRef.current = false;
        if (cancellationLockPromiseRef.current === lockPromise) cancellationLockPromiseRef.current = null;
      }
    })();
    cancellationLockPromiseRef.current = lockPromise;
    return lockPromise;
  };

  const handleCancellationDecision = (decision, { source = "conversation" } = {}) => {
    const flow = cancellationFlowRef.current;
    if (!flow) {
      return { handled: false, phase: "idle", reason: "confirmation_not_expected" };
    }
    if (flow.phase === "error" && !decision) {
      const bookingRef = flow.bookingRef;
      if (flow.dismissAllowed === false || flow.outcomeUnknown) {
        return { handled: false, confirmed: false, phase: "reconciliation_required", bookingRef: null, reason: "provider_reconciliation_required", message: flow.message };
      }
      if (!dismissPendingCancellation("error_dismissed")) {
        return { handled: false, confirmed: false, phase: "processing", bookingRef, reason: "cancellation_processing" };
      }
      const message = localeRef.current === "ar" ? "بقي الحجز من دون تغيير." : "The booking remains unchanged.";
      announceCancellationSystem(source, message);
      return { handled: true, confirmed: false, phase: "idle", bookingRef, reason: "error_dismissed", message };
    }
    if (!["route_confirmation", "final_confirmation"].includes(flow.phase)) {
      return { handled: false, phase: flow?.phase || "idle", reason: "confirmation_not_expected" };
    }
    if (!decision) {
      const bookingRef = flow.bookingRef;
      dismissPendingCancellation("guest_declined");
      const message = localeRef.current === "ar" ? "لم يتم إلغاء الحجز." : "The booking was kept active.";
      announceCancellationSystem(source, message);
      return { handled: true, confirmed: false, phase: "idle", bookingRef, reason: "guest_declined", message };
    }
    if (flow.phase === "route_confirmation") {
      armCancellationConfirmationTimer({ bookingRef: flow.bookingRef, phase: "final_confirmation" });
      const current = bookingRef.current;
      const summary = cancellationBookingSummary(current, localeRef.current);
      const message = localeRef.current === "ar"
        ? `${summary} الأثر: سيعاد ${current?.total ?? current?.refundAmount ?? "المبلغ المؤهل"} درهماً إلى محفظة VOX. هل تريد مني إلغاء هذا الحجز؟`
        : `${summary} Impact: AED ${current?.total ?? current?.refundAmount ?? "the eligible amount"} will be returned to VOX Wallet. Would you like me to cancel this booking?`;
      setCancellationFlow({ ...flow, phase: "final_confirmation", message, error: null });
      announceCancellationSystem(source, message);
      return { handled: true, confirmed: false, confirmationRequired: true, phase: "final_confirmation", bookingRef: flow.bookingRef, refundRoute: flow.refundRoute, message };
    }
    const completion = completeCancellation({ source });
    return { handled: true, confirmed: false, phase: "processing", bookingRef: flow.bookingRef, completion };
  };

  const publishCancellationDecision = (outcome, { promptAlreadyVisible = false } = {}) => {
    if (!outcome?.handled) return outcome;
    conversation.sendContextualUpdate?.(cancellationResultContext(outcome, { promptAlreadyVisible }));
    if (outcome.completion) {
      void outcome.completion.then((result) => {
        conversation.sendContextualUpdate?.(cancellationResultContext(result));
      }).catch((error) => {
        conversation.sendContextualUpdate?.(`The cancellation failed: ${error?.message || "unknown error"}. Do not claim cancellation or refund success.`);
      });
    }
    return outcome;
  };

  const cancelBooking = async () => {
    const current = stageRef.current.view === "booking" ? bookingRef.current : null;
    if (!current?.ref || !isCurrentBooking(current)) return { found: false, reason: "active_booking_required" };
    const rawResult = await showBookingForAuthorizedCancellation({ bookingRef: current.ref }, "ui_action");
    const result = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
    conversation.sendContextualUpdate?.(cancellationResultContext(result, { promptAlreadyVisible: true }));
    return result;
  };

  const changeLanguage = (nextLocale) => {
    if (nextLocale === locale) return;
    pendingLanguageSwitchRef.current = null;
    localeRef.current = nextLocale;
    setLocale(nextLocale);
    const next = nextLocale === "ar" ? "Arabic" : "English";
    if (isConnected && conversation.sendContextualUpdate) {
      conversation.sendContextualUpdate(`The guest explicitly selected ${next}. This visible selector action is confirmed. Preserve the active task and continue in ${next} without repeating the welcome message. ${buildVoxiContext({
        locale: nextLocale,
        cinema: cinemaRef.current,
        scheduleDate: scheduleDateRef.current,
        stage: stageVisibleRef.current ? stageRef.current : { view: "empty", paused: true, pausedView: selectRestorableRichStage(pausedJourneyRef.current)?.view || null },
        selectedSeats: seatsRef.current,
        requestedSeatTarget: requestedSeatTargetRef.current,
        discoveryPreferences: discoveryPreferencesRef.current,
        offer: lastOfferRef.current,
        journey: { ...journeyRef.current, locale: nextLocale },
        messages: messagesRef.current,
      })} ${serializeFaqContext(VOX_FAQ_ENTRIES, { locale: nextLocale, maxChars: 14_000 })}`);
    }
  };

  const scrollRef = useRef(null);
  const stageAnchorRef = useRef(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (!stageVisible || stage.view === "empty") {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    const anchor = stageAnchorRef.current;
    if (!anchor) return;
    const target = anchor.getBoundingClientRect().top
      - scroller.getBoundingClientRect().top
      + scroller.scrollTop
      - 10;
    scroller.scrollTop = Math.max(0, target);
  }, [stage, stageVisible]);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (["empty", "booking"].includes(stageRef.current.view) || cancellationFlowRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages, cancellationState.phase, cancellationState.bookingRef]);

  const chips = [t("app.chipShowing"), t("app.chipBook"), t("app.chipCancel")];
  const statusLabel = startingMode
    ? t("app.connectingMode", { mode: t(startingMode === "text" ? "app.textMode" : "app.voiceMode") })
    : status === "connected"
      ? t(sessionMode === "text" ? "app.textMode" : "app.voiceMode")
      : t("app.disconnected");
  const displayedBooking = stage.booking || booking;
  const displayedCancellationState = synchronizedCancellationRenderState({
    state: cancellationState,
    flow: cancellationFlowRef.current,
    bookingRef: displayedBooking?.ref,
    paused: cancellationPausedRef.current,
    stageVisible,
  }) || IDLE_CANCELLATION_STATE;
  const displayedProgrammingDates = programmingDatesForCinema(cinema);
  const visibleStageView = stageVisible ? stage.view : "empty";
  const transcriptMessageLimit = visibleStageView === "empty" ? VISIBLE_TRANSCRIPT_MESSAGES : RICH_STAGE_TRANSCRIPT_MESSAGES;
  const earlierMessageCount = Math.max(0, messages.length - transcriptMessageLimit);
  const displayedMessages = showFullTranscript || !earlierMessageCount
    ? messages
    : messages.slice(-transcriptMessageLimit);

  return (
    <div lang={locale} dir={dir} style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {transportEnabled && <Suspense fallback={null}>
        <ElevenLabsTransport
          key={transportGeneration}
          ref={transportRef}
          callbacks={transportCallbacks}
          clientTools={clientTools}
          generation={transportGeneration}
          isActive={isTransportGenerationActive}
          onStatus={updateTransportStatus}
        />
      </Suspense>}
      <style>{`.voxi-chip-row::-webkit-scrollbar{display:none}.voxi-widget :is(button,input,select,summary):focus-visible{outline:2px solid ${C.focus}!important;outline-offset:2px;box-shadow:0 0 0 4px rgba(0,157,219,.18)}`}</style>
      <div className="voxi-widget" style={{ width: "100%", maxWidth: 420, height: "min(860px, 96vh)", display: "flex", flexDirection: "column", borderRadius: 28, overflow: "hidden", boxShadow: `0 20px 60px ${C.shadow}`, background: C.surface, border: `1px solid ${C.border}` }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, padding: "11px 12px", flexShrink: 0, background: C.surface }}>
          <div style={{ display: "flex", minWidth: 0, alignItems: "center", gap: 9 }}>
            <div style={{ display: "flex", height: 32, width: 32, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 8, fontWeight: 900, color: C.onPrimary, background: C.primary }}>V</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: "hidden", fontSize: 14, fontWeight: 700, color: C.text, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("app.title")}</div>
                <div dir="ltr" style={{ overflow: "hidden", maxWidth: 128, color: C.muted, fontSize: 10, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("app.brand")}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 4 }}>
              <TopButton label={cinema ? `${t("app.changeCinema")}: ${stripVox(cinema.name)}` : t("app.chooseCinema")} onClick={openCinemaPicker}><MapPin size={14} /></TopButton>
              <TopButton label={t("app.offers")} onClick={openOffers}><BadgePercent size={14} /></TopButton>
              <TopButton label={t("app.history")} onClick={openHistory}><History size={14} /></TopButton>
              <TopButton label={t("app.restart")} onClick={() => restartConversation("manual_restart")}><RotateCcw size={14} /></TopButton>
              <LanguageSelector locale={locale} label={t("app.language")} onSelect={changeLanguage} />
            <span role="status" aria-live="polite" title={statusLabel} aria-label={statusLabel} style={{ display: "flex", width: 18, height: 28, alignItems: "center", justifyContent: "center", color: C.muted }}>
              <span style={{ height: 7, width: 7, borderRadius: 999, background: isConnected ? C.green : status === "connecting" ? C.warning : C.muted }} />
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>{statusLabel}</span>
            </span>
          </div>
        </header>

        <main ref={scrollRef} aria-label={t("app.conversation")} style={{ flex: 1, minHeight: 0, overflowX: "hidden", overflowY: "auto", padding: 16, background: `linear-gradient(180deg, ${C.canvas}, ${C.primarySoft})` }}>
          {stageVisible && pendingOrder?.checkoutId && visibleStageView !== "checkout" && (
            <aside role="region" aria-label={t("checkout.resume")} style={{ position: "sticky", top: -6, zIndex: 4, display: "flex", alignItems: "center", gap: 9, margin: "-6px 0 12px", border: `1px solid ${C.primary}`, borderRadius: 12, background: C.surface, padding: "8px 9px", boxShadow: `0 6px 18px ${C.shadow}` }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: C.text, fontSize: 11, fontWeight: 800 }}>{t("checkout.resumeTitle")}</div>
                <div style={{ overflow: "hidden", color: C.muted, fontSize: 10, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <bdi dir="auto">{pendingOrder.movieTitle}</bdi>. {t("checkout.seatCountOnly", { count: pendingOrder.seats?.length || 0 })}. <span dir="ltr">{formatCurrency(pendingOrder.total || 0, pendingOrder.currency || "AED")}</span>
                </div>
              </div>
              <button type="button" onClick={() => { void restorePausedJourney({ target: "checkout", source: "ui" }); }} style={{ minHeight: 44, flexShrink: 0, border: 0, borderRadius: 10, background: C.primary, padding: "8px 10px", color: C.onPrimary, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>{t("checkout.resume")}</button>
            </aside>
          )}
          {!!messages.length && (
            <div role="log" aria-live="polite" aria-relevant="additions text" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: visibleStageView === "empty" ? 0 : 14 }}>
              {!!earlierMessageCount && <button type="button" onClick={() => setShowFullTranscript((current) => !current)} aria-expanded={showFullTranscript} style={{ alignSelf: "center", border: `1px solid ${C.border}`, borderRadius: 999, background: C.surface, padding: "6px 11px", color: C.primary, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                {showFullTranscript ? t("app.showRecentMessages") : t("app.showEarlierMessages", { count: earlierMessageCount })}
              </button>}
              {displayedMessages.map((message, index) => (
                <div key={message.id || `${message.at}-${index}`} style={{ display: "flex", justifyContent: message.role === "user" ? "flex-end" : "flex-start" }}>
                  <div dir="auto" style={{ maxWidth: "85%", borderRadius: 16, border: message.role === "user" ? 0 : `1px solid ${C.border}`, padding: "9px 13px", fontSize: 13, lineHeight: 1.35, overflowWrap: "anywhere", background: message.role === "user" ? C.primary : message.role === "system" ? C.surfaceAlt : C.surface, color: message.role === "system" ? C.muted : message.role === "user" ? C.onPrimary : C.text, boxShadow: message.role === "assistant" ? `0 4px 14px ${C.shadow}` : "none", fontStyle: message.role === "system" ? "italic" : "normal" }}>{message.text}</div>
                </div>
              ))}
            </div>
          )}
          {visibleStageView === "empty" && (!messages.length || messages.every((message) => message.role === "system")) && (
            <div style={{ display: "flex", height: "100%", minHeight: 240, flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ display: "flex", height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, background: C.primarySoft, marginBottom: 16 }}><Sparkles color={C.brand} size={26} /></div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{t("app.emptyTitle")}</div>
              <p style={{ maxWidth: 280, marginTop: 8, fontSize: 13, lineHeight: 1.5, color: C.muted }}>{t("app.emptyBody")}</p>
              {!cinema && <button type="button" onClick={openCinemaPicker} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12, border: 0, borderRadius: 999, background: C.primary, padding: "9px 15px", color: C.onPrimary, fontSize: 12, fontWeight: 700, cursor: "pointer" }}><MapPin size={14} />{t("app.chooseCinema")}</button>}
            </div>
          )}
          {visibleStageView !== "empty" && <div ref={stageAnchorRef} aria-hidden="true" />}
          {cinema && ["movies", "showtimes"].includes(visibleStageView) && <DateStrip dates={displayedProgrammingDates} selected={stage.errorCode === "date_unavailable" || !discoveryPreferences.date ? null : scheduleDate} locale={locale} label={t("dates.label")} onSelect={chooseDate} />}
          {visibleStageView === "loading" && <LoadingPanel label={stage.label} />}
          {visibleStageView === "discovery" && <DiscoveryPrompt
            question={stage.question}
            preferences={stage.preferences}
            dateOptions={stage.missing?.[0] === "date" ? displayedProgrammingDates : []}
            dateLabel={t("dates.label")}
            onDateSelect={chooseDate}
          />}
          {visibleStageView === "cinemas" && <CinemaPicker cinemas={stage.cinemas || CINEMAS} selected={cinema} notice={stage.notice} error={stage.error} onRetry={stage.retryAvailable ? () => routeDiscoveryTurn("", { preferencesAlreadyApplied: true }) : undefined} onSelect={chooseCinema} onBack={() => showStage(cinemaReturnRef.current || { view: "empty" })} />}
          {visibleStageView === "movies" && cinema && <MovieGrid movies={stage.movies} cinemaName={stripVox(cinema.name)} scheduleDate={stage.errorCode === "date_unavailable" ? userRequestedDateRef.current : scheduleDate} notice={stage.notice} onSelect={pickMovie} error={stage.error} onRetry={stage.errorCode === "date_unavailable" ? undefined : () => routeDiscoveryTurn("", { cinemaOverride: cinema, dateOverride: scheduleDate, preferencesAlreadyApplied: true })} />}
          {visibleStageView === "showtimes" && <Showtimes movie={stage.movie} sessions={stage.sessions} notice={stage.notice} error={stage.error} onRetry={stage.retryAvailable ? () => pickMovie(stage.movie) : undefined} onSelect={pickSession} onBack={backFromShowtimes} />}
          {visibleStageView === "seatmap" && <SeatMap movie={stage.movie} session={stage.session} plan={stage.plan} selected={selectedSeats} requestedTarget={requestedSeatTarget} pricing={SEAT_PRICING_PREVIEW} quoteState={seatQuote} notice={stage.planMeta?.verified === false ? true : stage.planMeta?.warning || false} onToggle={toggleSeat} onConfirm={confirmSeats} onBack={backFromSeatMap} />}
          {visibleStageView === "checkout" && stage.order && pendingOrder?.checkoutId === stage.order.checkoutId && <Checkout key={stage.order.checkoutId} order={stage.order} deviceSessionEpoch={deviceSessionEpochRef.current} onPaid={handlePaid} onCancel={backToSeatMapFromCheckout} onPaymentStateChange={handleCheckoutPaymentState} />}
          {visibleStageView === "booking" && displayedBooking && <BookingCard
            booking={displayedBooking}
            cancellation={displayedCancellationState}
            onRequestCancel={cancelBooking}
            onConfirm={() => publishCancellationDecision(handleCancellationDecision(true, { source: "ui" }), { promptAlreadyVisible: true })}
            onDecline={() => publishCancellationDecision(handleCancellationDecision(false, { source: "ui" }), { promptAlreadyVisible: true })}
            onBack={bookingOpenedFromHistoryRef.current ? () => { dismissPendingCancellation("back_to_history"); openHistory({ notifyAgent: false, forceOpen: true, activeOnly: historyFilter === "active", preserveReturn: true }); } : undefined}
            cancelled={displayedBooking.cancelled}
          />}
          {visibleStageView === "history" && <BookingHistory bookings={bookings} filter={historyFilter} onCancel={cancelHistoryBooking} onSelect={selectHistoryBooking} onBack={restoreHistoryReturn} />}
          {visibleStageView === "offers" && (
            <div>
              {stage.showtimeRequired && <div role="status" style={{ marginBottom: 10, borderRadius: 10, background: C.warningSoft, padding: "9px 11px", color: C.warning, fontSize: 10, lineHeight: 1.45 }}>{t("offers.showtimeRequired")}</div>}
              <OffersPanel
                locale={locale}
                context={stage.context}
                initialQuery={stage.query}
                initialOfferId={stage.result?.offer?.id}
                initialProfileId={stage.result?.cardProfile?.id}
                onSelectionChange={handleOfferSelection}
                onBack={() => { void restoreOffersReturn(); }}
              />
            </div>
          )}
          {visibleStageView === "handover" && <HandoverPanel payload={stage.payload} labels={{
            connectingTitle: t("handover.connecting"),
            connectingBody: t("handover.connectingBody"),
            readyTitle: t("handover.ready"),
            readyBody: t("handover.readyBody"),
            simulation: t("handover.badge"),
            debugTitle: t("handover.payload"),
            debugHint: t("handover.debugHint"),
            summaryStep: t("handover.summaryStep"),
            queueReadyStep: t("handover.queueStep"),
            connectingStep: t("handover.preparingStep"),
            safeContext: t("handover.safeContext"),
          }} />}
        </main>

        <section aria-label={t("app.conversation")} style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
          <div className="voxi-chip-row" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 8px", scrollbarWidth: "none" }}>
            {chips.map((chip) => <button key={chip} onClick={() => sendText(chip)} style={{ flexShrink: 0, borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, padding: "5px 11px", color: C.primary, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>{chip}</button>)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.border}`, padding: 12 }}>
            <button onClick={isConnected && sessionMode === "voice" ? endVoiceSession : startVoiceSession} disabled={startingMode === "voice"} title={isConnected && sessionMode === "voice" ? t("app.endVoice") : t("app.enableVoice")} aria-label={isConnected && sessionMode === "voice" ? t("app.endVoice") : t("app.enableVoice")} style={{ display: "flex", height: 40, width: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 999, border: "none", cursor: startingMode === "voice" ? "progress" : "pointer", color: C.onPrimary, opacity: startingMode === "voice" ? 0.65 : 1, background: isConnected && sessionMode === "voice" ? C.danger : C.primary }}>{isConnected && sessionMode === "voice" ? <MicOff size={17} /> : <Mic size={17} />}</button>
            <input dir="auto" value={input} onChange={(event) => { lastActivityRef.current = Date.now(); setInput(event.target.value); if (isConnected && conversation.sendUserActivity) conversation.sendUserActivity(); }} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && sendText()} placeholder={t("app.inputPlaceholder")} aria-label={t("app.inputPlaceholder")} style={{ minWidth: 0, flex: 1, border: `1px solid ${C.border}`, borderRadius: 999, outline: "none", background: C.surfaceAlt, padding: "10px 14px", color: C.text, fontSize: 14, textAlign: "start" }} />
            <button onClick={() => sendText()} disabled={!input.trim()} aria-label={t("app.send")} style={{ display: "flex", height: 36, width: 36, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 999, border: "none", cursor: "pointer", color: C.onPrimary, background: C.primary, opacity: input.trim() ? 1 : 0.3 }}><Send size={16} /></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function TopButton({ label, onClick, children }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} style={{ display: "grid", width: 28, height: 28, flexShrink: 0, placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surfaceAlt, color: C.primary, cursor: "pointer" }}>{children}</button>;
}

function DateStrip({ dates, selected, locale, label, onSelect, compact = false }) {
  const format = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div role="group" aria-label={label} className="voxi-chip-row" style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: compact ? 0 : 14, paddingBottom: 2, scrollbarWidth: "none" }}>
      {dates.map((date) => (
        <button key={date} type="button" aria-pressed={date === selected} onClick={() => onSelect(date)} style={{ flexShrink: 0, border: `1px solid ${date === selected ? C.primary : C.border}`, borderRadius: 10, background: date === selected ? C.primary : C.surface, padding: "7px 10px", color: date === selected ? C.onPrimary : C.muted, fontSize: 10, fontWeight: date === selected ? 700 : 500, cursor: "pointer" }}>
          <span dir="auto">{format.format(new Date(`${date}T12:00:00+04:00`))}</span>
        </button>
      ))}
    </div>
  );
}

function LoadingPanel({ label }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", minHeight: 220, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: C.muted, textAlign: "center" }}>
      <span aria-hidden="true" style={{ display: "block", width: 24, height: 24, border: `3px solid ${C.border}`, borderTopColor: C.brand, borderRadius: "50%", animation: "voxi-spin .9s linear infinite" }} />
      <style>{`@keyframes voxi-spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}

function DiscoveryPrompt({ question, preferences = {}, dateOptions = [], dateLabel = "", onDateSelect }) {
  const { locale } = useI18n();
  const formattedDate = preferences.date
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
      timeZone: "Asia/Dubai",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${preferences.date}T12:00:00+04:00`))
    : null;
  const visibleValues = [
    preferences.cinemaName,
    preferences.city && !preferences.cinemaName ? preferences.city : null,
    formattedDate,
    preferences.preferredTime || preferences.timeBand,
    preferences.movieTitle,
    preferences.genre,
    preferences.language,
    preferences.experience,
    preferences.audience === "kids_family" ? (locale === "ar" ? "أطفال وعائلات" : "Kids & family") : null,
  ].filter(Boolean);
  return (
    <section role="status" aria-live="polite" style={{ border: `1px solid ${C.border}`, borderRadius: 16, background: C.surface, boxShadow: `0 8px 22px ${C.shadow}`, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.brand }}><Sparkles size={16} /><strong dir="auto" style={{ color: C.text, fontSize: 14 }}>{question}</strong></div>
      {!!visibleValues.length && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {visibleValues.map((value, index) => <span key={`${value}-${index}`} dir="auto" style={{ borderRadius: 999, background: C.primarySoft, padding: "4px 8px", color: C.primary, fontSize: 10 }}>{value}</span>)}
      </div>}
      {!!dateOptions.length && <div style={{ marginTop: 13 }}>
        <div dir="auto" style={{ marginBottom: 7, color: C.muted, fontSize: 10, fontWeight: 700 }}>{dateLabel}</div>
        <DateStrip dates={dateOptions} selected={null} locale={locale} label={dateLabel} onSelect={onDateSelect} compact />
      </div>}
    </section>
  );
}

function LanguageSelector({ locale, label, onSelect }) {
  return (
    <div role="group" aria-label={label} title={label} style={{ display: "flex", height: 28, flexShrink: 0, alignItems: "center", gap: 1, borderRadius: 8, background: C.surfaceAlt, padding: 2 }}>
      {[{ code: "en", label: "English" }, { code: "ar", label: "العربية" }].map((item) => (
        <button key={item.code} type="button" aria-pressed={locale === item.code} aria-label={item.code === "en" ? "English" : "العربية"} onClick={() => onSelect(item.code)} style={{ minWidth: item.code === "en" ? 43 : 47, height: 22, border: 0, borderRadius: 6, paddingInline: 5, background: locale === item.code ? C.primary : "transparent", color: locale === item.code ? C.onPrimary : C.muted, fontSize: 9, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{item.label}</button>
      ))}
    </div>
  );
}
