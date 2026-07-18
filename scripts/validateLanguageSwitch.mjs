import assert from "node:assert/strict";
import { explicitLanguageRequest, resolveLanguageSignal } from "../src/lib/languageSwitch.js";

assert.equal(explicitLanguageRequest("شكراً"), null, "one Arabic word must not switch English to Arabic");
assert.equal(explicitLanguageRequest("Two tickets لو سمحت"), null, "mixed speech must not switch automatically");
assert.equal(explicitLanguageRequest("أريد إلغاء الحجز"), null, "a business request in the other language must await confirmation");
assert.equal(explicitLanguageRequest("Can you speak Arabic?"), null, "a language capability question is not switch confirmation");
assert.equal(explicitLanguageRequest("Switch to Arabic"), "ar");
assert.equal(explicitLanguageRequest("Continue in English"), "en");
assert.equal(explicitLanguageRequest("كمل عربي"), "ar");

const offeredArabic = resolveLanguageSignal({
  role: "agent",
  text: "I noticed you’re speaking Arabic. Would you like me to continue in Arabic?",
  currentLocale: "en",
});
assert.equal(offeredArabic.pendingLocale, "ar");
assert.equal(offeredArabic.nextLocale, null);

const confirmedArabic = resolveLanguageSignal({
  role: "user",
  text: "Yes, Arabic",
  currentLocale: "en",
  pendingLocale: offeredArabic.pendingLocale,
});
assert.equal(confirmedArabic.nextLocale, "ar");
assert.equal(confirmedArabic.pendingLocale, null);

const offeredEnglish = resolveLanguageSignal({
  role: "agent",
  text: "لاحظت أنك تتحدث بالإنجليزية. هل تريد أن أتابع باللغة الإنجليزية؟",
  currentLocale: "ar",
});
assert.equal(offeredEnglish.pendingLocale, "en");
assert.equal(resolveLanguageSignal({
  role: "agent",
  text: "هل تريد أن أتابع بالإنجليزية؟",
  currentLocale: "ar",
}).pendingLocale, "en", "the prompt's exact Arabic confirmation question must be recognized");
assert.equal(resolveLanguageSignal({ role: "user", text: "English please", currentLocale: "ar", pendingLocale: "en" }).nextLocale, "en");
assert.equal(resolveLanguageSignal({ role: "user", text: "No", currentLocale: "en", pendingLocale: "ar" }).pendingLocale, null);
assert.equal(resolveLanguageSignal({ role: "user", text: "Show me the 7 PM session", currentLocale: "en", pendingLocale: "ar" }).pendingLocale, null, "an unrelated reply must clear pending language confirmation");
assert.equal(resolveLanguageSignal({ role: "user", text: "yes", currentLocale: "en", pendingLocale: null }).nextLocale, null, "a later business confirmation must not trigger a stale switch");

console.log("Validated explicit English/Arabic selection and confirmation-only language switching.");
