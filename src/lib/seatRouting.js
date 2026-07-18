const ENGLISH_NUMBERS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
});

const ARABIC_NUMBERS = Object.freeze({
  "واحد": 1,
  "واحدة": 1,
  "اثنان": 2,
  "اثنين": 2,
  "اتنين": 2,
  "ثلاثة": 3,
  "ثلاث": 3,
  "أربعة": 4,
  "اربعة": 4,
  "خمس": 5,
  "خمسة": 5,
  "ست": 6,
  "ستة": 6,
  "سبع": 7,
  "سبعة": 7,
  "ثمان": 8,
  "ثمانية": 8,
  "تسع": 9,
  "تسعة": 9,
  "عشر": 10,
  "عشرة": 10,
  "احدعشر": 11,
  "احدعشرة": 11,
  "اثناعشر": 12,
  "اثناعشرة": 12,
});

const CONFIRM_SEATS_EN = /\b(?:these|those|selected|chosen)\s+(?:are\s+)?(?:the\s+)?seats?\b|\b(?:confirm|continue|proceed|done|book)\b.{0,24}\bseats?\b|\bseats?\s+(?:are\s+)?(?:fine|good|correct)\b/;
const CONFIRM_SEATS_AR = /(?:هذه|هذي|تلك)(?:\s+هي)?\s+المقاعد|(?:اكد|أكد|تاكيد|تأكيد|اعتمد|احجز)\s+(?:هذه\s+|هذي\s+)?المقاعد|المقاعد\s+(?:مناسبة|صحيحة|تمام)/;
const SHORT_CONFIRM_SEATS_EN = /^(?:yes|yeah|yep|confirm|continue|proceed|done|ok|okay)(?:\s+please)?$/;
const SHORT_CONFIRM_SEATS_AR = /^(?:نعم|ايوه|أيوه|اكد|أكد|تاكيد|تأكيد|استمر|تابع|متابعة|تم|موافق)(?:\s+(?:من فضلك|لو سمحت))?$/;
const AVAILABILITY_QUESTION = /\b(?:is|are)\b.{0,24}\b(?:available|free|taken|sold)\b|\b(?:available|free)\s*\?|(?:هل|متاح|متوفر|محجوز)/;

const normalizeDigits = (value) => String(value || "")
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

const speechTokens = (value) => normalizeDigits(value)
  .normalize("NFKC")
  .replace(/[\u064b-\u065f\u0670]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((token) => {
    const lower = token.toLowerCase();
    return String(ENGLISH_NUMBERS[lower] || ARABIC_NUMBERS[token] || token);
  });

export function normalizeSeatIds(value, availableSeatIds = []) {
  const available = new Set((availableSeatIds || []).map((seat) => String(seat || "").toUpperCase()).filter(Boolean));
  const normalized = speechTokens(Array.isArray(value) ? value.join(" ") : value).join(" ").toUpperCase();
  const seats = [];
  for (const match of normalized.matchAll(/\b([A-Z])\s*(\d{1,2})\b/g)) {
    const seat = `${match[1]}${Number(match[2])}`;
    if ((!available.size || available.has(seat)) && !seats.includes(seat)) seats.push(seat);
  }
  return seats;
}

export function resolveSeatToolInput(value, { availableSeatIds = [], currentSeats = [] } = {}) {
  const provided = Array.isArray(value)
    ? value.some((seat) => String(seat ?? "").trim())
    : value != null && Boolean(String(value).trim());
  const available = new Set((availableSeatIds || []).map((seat) => String(seat || "").toUpperCase()).filter(Boolean));
  const recognized = normalizeSeatIds(value);
  const parsed = recognized.filter((seat) => available.has(seat));
  const invalidSeats = recognized.filter((seat) => !available.has(seat));
  const selectedCurrentSeats = normalizeSeatIds(currentSeats).filter((seat) => available.has(seat));
  return Object.freeze({
    provided,
    seats: parsed.length || provided ? parsed : selectedCurrentSeats,
    invalidSeats,
  });
}

export function resolveSeatSelectionTurn(text, { availableSeatIds = [], currentSeats = [] } = {}) {
  const normalizedText = normalizeDigits(text).normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670]/g, "");
  const shortConfirmationText = normalizedText.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const available = new Set((availableSeatIds || []).map((seat) => String(seat || "").toUpperCase()).filter(Boolean));
  const recognizedSeats = normalizeSeatIds(text);
  const explicitSeats = recognizedSeats.filter((seat) => available.has(seat));
  const invalidSeats = recognizedSeats.filter((seat) => !available.has(seat));
  const normalizedCurrentSeats = normalizeSeatIds(currentSeats).filter((seat) => available.has(seat));
  const shortConfirmation = Boolean(normalizedCurrentSeats.length)
    && (SHORT_CONFIRM_SEATS_EN.test(shortConfirmationText) || SHORT_CONFIRM_SEATS_AR.test(shortConfirmationText));
  const confirmation = CONFIRM_SEATS_EN.test(normalizedText) || CONFIRM_SEATS_AR.test(normalizedText) || shortConfirmation;
  const availabilityQuestion = AVAILABILITY_QUESTION.test(normalizedText);
  const selected = explicitSeats.length
    ? explicitSeats
    : confirmation
      ? normalizedCurrentSeats
      : [];
  return Object.freeze({
    requested: Boolean((recognizedSeats.length && !availabilityQuestion) || confirmation),
    confirmation,
    explicitSeats,
    invalidSeats,
    seats: selected,
    reason: invalidSeats.length ? "invalid_or_unavailable_seats" : confirmation && !selected.length ? "no_selected_seats" : null,
  });
}
