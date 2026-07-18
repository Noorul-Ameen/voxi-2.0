const tidy = (value) => String(value || "")
  .toLowerCase()
  .replace(/[\u064b-\u065f\u0670]/g, "")
  .replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/[.!?؟،,]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const DIRECT_ARABIC = [
  /^(speak|continue|switch)( in| to)? arabic$/,
  /^arabic( please)?$/,
  /^(عربي|كمل عربي|تمام بالعربي)$/,
  /^(تكلم|تحدث|كمل|استمر)( باللغة)? العربية$/,
  /^(حول|غير)( اللغة)? (الي )?العربية$/,
];

const DIRECT_ENGLISH = [
  /^(speak|continue|switch)( in| to)? english$/,
  /^english( please)?$/,
  /^(إنجليزي|انجليزي|كمل إنجليزي|كمل انجليزي)$/,
  /^(تكلم|تحدث|كمل|استمر)( باللغة)? الانجليزية$/,
  /^(حول|غير)( اللغة)? (الي )?الانجليزية$/,
];

const YES_ARABIC = new Set([
  "yes", "yes arabic", "continue arabic", "continue in arabic", "arabic", "arabic please",
  "نعم", "إي", "اي", "أيوه", "ايوه", "تمام بالعربي", "عربي", "كمل عربي",
]);

const YES_ENGLISH = new Set([
  "yes", "yes english", "continue english", "continue in english", "speak english", "english", "english please", "switch to english",
  "نعم بالإنجليزية", "نعم بالانجليزية", "كمل إنجليزي", "كمل انجليزي",
]);

const NO = new Set(["no", "no thanks", "no thank you", "لا", "لأ", "لا شكرا", "لا شكرًا"]);

export function explicitLanguageRequest(text) {
  const value = tidy(text);
  if (/^can you speak arabic$/.test(value) || /^هل (يمكنك|تستطيع) التحدث بالعربية$/.test(value)) return null;
  if (/^can you speak english$/.test(value) || /^هل (يمكنك|تستطيع) التحدث بالانجليزية$/.test(value)) return null;
  if (DIRECT_ARABIC.some((pattern) => pattern.test(value))) return "ar";
  if (DIRECT_ENGLISH.some((pattern) => pattern.test(value))) return "en";
  return null;
}

function offeredLanguage(text, currentLocale) {
  const value = tidy(text);
  if (currentLocale === "en" && /(?:would you like|do you want).*(?:continue|speak).*arabic/.test(value)) return "ar";
  if (currentLocale === "ar" && /هل تريد.*(?:اتابع|نكمل|استمر).*(?:بالانجليزية|باللغة الانجليزية)/.test(value)) return "en";
  return null;
}

function confirmed(text, targetLocale) {
  const value = tidy(text);
  return targetLocale === "ar" ? YES_ARABIC.has(value) : YES_ENGLISH.has(value);
}

export function resolveLanguageSignal({ role, text, currentLocale, pendingLocale = null }) {
  if (role === "agent") {
    return { nextLocale: null, pendingLocale: offeredLanguage(text, currentLocale) || pendingLocale };
  }

  const direct = explicitLanguageRequest(text);
  if (direct) return { nextLocale: direct, pendingLocale: null };
  if (pendingLocale && confirmed(text, pendingLocale)) return { nextLocale: pendingLocale, pendingLocale: null };
  if (pendingLocale && NO.has(tidy(text))) return { nextLocale: null, pendingLocale: null };
  return { nextLocale: null, pendingLocale: null };
}
