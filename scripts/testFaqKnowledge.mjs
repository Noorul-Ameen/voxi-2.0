import assert from "node:assert/strict";
import { VOX_FAQ_ENTRIES, buildFaqContextForQuery, classifyFaqActionIntent, resolveFaqOne, resolveFaqQuery, serializeFaqContext } from "../src/knowledge/index.js";

const CASES = [
  ["opening hours", "en", "cinema-locations-hours"],
  ["كيف أستخدم التذكرة الإلكترونية", "ar", "tickets-and-etickets"],
  ["What is IMAX?", "en", "experiences-overview"],
  ["ما هي آيماكس؟", "ar", "experiences-overview"],
  ["where is imax available", "en", "experience-availability"],
  ["هل توجد ماكس في هذه السينما", "ar", "experience-availability"],
  ["outside food", "en", "food-and-drinks"],
  ["عرض البنك", "ar", "bank-and-card-offers"],
  ["wheelchair spaces", "en", "wheelchair-accessibility"],
  ["هل يطلبون الهوية", "ar", "movie-age-ratings"],
  ["4dx height", "en", "experience-age-and-safety"],
  ["refund policy", "en", "cancellation-and-refunds"],
  ["وش شروط الاسترجاع", "ar", "cancellation-and-refunds"],
  ["سجل المشتريات", "ar", "booking-management"],
  ["forgot password", "en", "vox-account"],
  ["رصيد ڤوكس", "ar", "vox-credit-wallet"],
  ["share points", "en", "share-loyalty"],
  ["phone number", "en", "customer-support"],
  ["حجز مجموعة", "ar", "group-and-private-bookings"],
  ["What languages can we use?", "en", "voxi-language-support"],
  ["ما اللغات التي يمكننا استخدامها؟", "ar", "voxi-language-support"],
];

for (const [query, locale, expectedId] of CASES) {
  const result = resolveFaqOne(query, { locale });
  assert.ok(result, `expected a result for ${query}`);
  assert.equal(result.id, expectedId, `${query}: wrong FAQ result`);
  assert.equal(result.locale, locale, `${query}: response locale must follow active locale`);
}

const mixed = resolveFaqOne("أحتاج wheelchair spaces", { locale: "en" });
assert.equal(mixed.id, "wheelchair-accessibility", "mixed-language queries should still resolve deterministically");
assert.equal(mixed.locale, "en", "query script must not switch the active response locale");
assert.match(mixed.answer, /^VOX cinemas have/i, "answer must remain in the explicitly supplied locale");

assert.equal(resolveFaqOne("weather forecast tomorrow", { locale: "en" }), null, "unrelated queries must not produce FAQ answers");

const languageSupport = resolveFaqOne("Can I use text during voice chat?", { locale: "en" });
assert.equal(languageSupport?.id, "voxi-language-support", "voice/text capability questions need a deterministic product answer");
assert.equal(languageSupport.metadata.provenance, "product", "language support must be identified as an in-product capability");
assert.match(languageSupport.answer, /English and Arabic/i);
assert.match(languageSupport.answer, /during an active voice conversation/i);
const arabicLanguageSupport = resolveFaqOne("هل يمكنني الكتابة أثناء المحادثة الصوتية؟", { locale: "ar" });
assert.equal(arabicLanguageSupport?.id, "voxi-language-support", "Arabic voice/text capability questions need the same deterministic route");
assert.match(arabicLanguageSupport.answer, /الإنجليزية والعربية/);
const languageMatches = resolveFaqQuery("What languages can we use?", { locale: "en", limit: 10 });
assert.equal(languageMatches[0]?.id, "voxi-language-support");
assert.ok(!languageMatches.some(({ id }) => id === "movie-age-ratings" || id === "experience-age-and-safety"), "the tag 'age' must not match inside 'languages'");
const languageContext = serializeFaqContext([languageSupport], { locale: "en", maxChars: 4000 });
assert.match(languageContext, /Capability basis: current Voxi in-product behavior/);
assert.doesNotMatch(languageContext, /Official source:/, "product capability answers must not claim unrelated official policy provenance");

const ACTION_CASES = [
  ["Book two tickets for Superman", "booking"],
  ["Show me today's showtimes", "booking"],
  ["What is showing tonight at City Centre Mirdif?", "booking"],
  ["What's playing tomorrow?", "booking"],
  ["\u0645\u0627\u0630\u0627 \u064a\u0639\u0631\u0636 \u0627\u0644\u0644\u064a\u0644\u0629\u061f", "booking"],
  ["أبغي أحجز تذكرتين", "booking"],
  ["Cancel my booking WL12345", "cancellation"],
  ["Cancel this booking", "cancellation"],
  ["Can you cancel my booking?", "cancellation"],
  ["Could you please refund my tickets?", "cancellation"],
  ["أبغي ألغي حجزي", "cancellation"],
  ["الغي هذا الحجز", "cancellation"],
  ["هل يمكنك إلغاء حجزي؟", "cancellation"],
  ["Show my booking history", "booking_history"],
  ["Show my current bookings", "booking_history"],
  ["اعرض حجوزاتي الحالية", "booking_history"],
];
for (const [query, intent] of ACTION_CASES) {
  assert.equal(classifyFaqActionIntent(query), intent, `${query}: wrong action intent`);
  assert.equal(resolveFaqOne(query, { locale: /[\u0600-\u06ff]/.test(query) ? "ar" : "en" }), null, `${query}: transactional request must bypass FAQ rendering`);
}
assert.equal(classifyFaqActionIntent("Can I cancel a booking?"), null, "policy questions must remain FAQ-eligible");
assert.equal(resolveFaqOne("Can I cancel a booking?", { locale: "en" })?.topic, "cancellations_refunds", "cancellation policies must expose the cancellation routing topic");
assert.equal(classifyFaqActionIntent("هل يمكنني إلغاء الحجز؟"), null, "Arabic policy questions must remain FAQ-eligible");
assert.equal(resolveFaqOne("هل يمكنني إلغاء الحجز؟", { locale: "ar" })?.topic, "cancellations_refunds", "Arabic cancellation policies must expose the cancellation routing topic");
assert.equal(classifyFaqActionIntent("private screening booking"), null, "private-event enquiries must remain FAQ-eligible");

const first = resolveFaqQuery("refund credit wallet", { locale: "en", limit: 4 });
const second = resolveFaqQuery("refund credit wallet", { locale: "en", limit: 4 });
assert.deepEqual(
  first.map(({ id, score }) => ({ id, score })),
  second.map(({ id, score }) => ({ id, score })),
  "resolver order and scores must be deterministic",
);

const hours = resolveFaqOne("what time do you open", { locale: "en" });
assert.equal(hours.dataMode, "api");
assert.equal(hours.needsLiveData, true);
const missingLive = serializeFaqContext([hours], { locale: "en", maxChars: 4000 });
assert.match(missingLive, /Live result: NOT SUPPLIED/);
assert.match(missingLive, /https:\/\/uae\.voxcinemas\.com\/faq/);
assert.match(missingLive, /never invent a current value/i);

const withLive = serializeFaqContext([hours], {
  locale: "en",
  maxChars: 4000,
  liveData: { "cinema-locations-hours": { firstSession: "13:45", cinema: "Selected cinema" } },
});
assert.match(withLive, /"cinema":"Selected cinema","firstSession":"13:45"/, "live data must serialize in stable key order");

const built = buildFaqContextForQuery("customer care phone number", { locale: "ar", limit: 1 });
assert.equal(built.matches[0].id, "customer-support");
assert.match(built.context, /Reply language: Arabic/);
assert.match(built.context, /600 599 905/);

const capped = serializeFaqContext(resolveFaqQuery("refund", { locale: "en", limit: 3 }), { locale: "en", maxChars: 700 });
assert.ok(capped.length <= 700, "serializer must honor maxChars");

const fullCatalog = serializeFaqContext(VOX_FAQ_ENTRIES, { locale: "ar", maxChars: 14_000 });
assert.doesNotMatch(fullCatalog, /\[object Object\]/, "raw catalog entries must serialize their localized answer text");
assert.match(fullCatalog, /Approved answer \(ar\): [\u0600-\u06ff]/, "the voice catalog must contain Arabic answers when Arabic is active");

console.log(`FAQ resolver tests passed: ${CASES.length} bilingual knowledge cases, ${ACTION_CASES.length} transactional bypass cases, determinism, and serialization.`);
