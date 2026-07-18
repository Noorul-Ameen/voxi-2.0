import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classifyOfferDetailTopic, resolveLocalOfferTextTurn } from "../src/offers/offerTextFallback.js";
import { normalizeOfferText, resolveOfferForBankAndCard, searchOffers } from "../src/offers/offerResolver.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const app = await readFile(resolve(root, "src/App.jsx"), "utf8");

function expectTurn(query, expected, options = {}) {
  const turn = resolveLocalOfferTextTurn(query, options);
  assert.ok(turn, `Expected a local offer turn for: ${query}`);
  assert.equal(turn.offerId, expected.offerId, `Unexpected offer for: ${query}`);
  assert.equal(turn.detailTopic, expected.detailTopic, `Unexpected detail topic for: ${query}`);
  assert.ok(turn.answer.trim(), `Expected a local answer for: ${query}`);
  assert.doesNotMatch(turn.answer, /[\u2013\u2014]/u, `Answer contains prohibited dash punctuation for: ${query}`);
  assert.doesNotMatch(turn.answer, /(?:undefined|null|\[object Object\])/i, `Answer contains an unresolved value for: ${query}`);
  return turn;
}

expectTurn("Tell me the FAB offer", { offerId: "fab-share", detailTopic: "summary" });
const fabCheckoutTurn = expectTurn("Can I use FAB SHARE for this booking?", { offerId: "fab-share", detailTopic: "summary" });
assert.equal(fabCheckoutTurn.profileId, "fab-share-credit", "A uniquely named FAB SHARE use question must resolve the published card profile");
assert.match(fabCheckoutTurn.answer, /FAB SHARE Credit Card/i, "The checkout answer must name the required card");
assert.match(fabCheckoutTurn.answer, /Regular 2D/i, "The checkout answer must state the published experience and format boundary");
expectTurn("Which ENBD cards qualify?", { offerId: "emirates-nbd", detailTopic: "cards" });
expectTurn("ما هو عرض بنك أبوظبي الأول؟", { offerId: "fab-share", detailTopic: "summary" }, { locale: "ar" });
expectTurn("ما البطاقات المؤهلة من بنك الإمارات دبي الوطني؟", { offerId: "emirates-nbd", detailTopic: "cards" }, { locale: "ar" });

assert.equal(classifyOfferDetailTopic("Which experiences work with the FAB offer?"), "experiences");
assert.equal(classifyOfferDetailTopic("What is the monthly limit for the ENBD offer?"), "limits");
assert.equal(classifyOfferDetailTopic("How do I redeem the HSBC offer?"), "redemption");
assert.equal(classifyOfferDetailTopic("What is excluded from the Citi offer?"), "exclusions");
assert.equal(classifyOfferDetailTopic("Show the terms for the Mashreq offer"), "terms");

assert.equal(resolveLocalOfferTextTurn("How do bank offers work?"), null, "Generic offer FAQs must stay on the approved FAQ path");
assert.equal(resolveLocalOfferTextTurn("Which cards qualify?"), null, "A bank or uniquely resolved card is required");
assert.equal(resolveLocalOfferTextTurn("Cancel my FAB booking"), null, "Cancellation must retain routing priority");
assert.equal(resolveLocalOfferTextTurn("Can I get a refund for my ENBD booking?"), null, "Refund requests must retain routing priority");
assert.equal(resolveLocalOfferTextTurn("Can I use Apple Pay?"), null, "A payment method must not be misrouted to a bank offer");
assert.equal(resolveLocalOfferTextTurn("Can I use this card?"), null, "A card use question requires a uniquely named published offer");
assert.equal(resolveLocalOfferTextTurn("Can I use Visa Infinite for this booking?"), null, "A generic card tier requires its issuing bank");
assert.equal(resolveLocalOfferTextTurn("Can I use FAB SHARE to cancel my booking?"), null, "Cancellation must outrank a named offer use question");

const unpublished = expectTurn("Tell me the SIB offer", { offerId: "sharjah-islamic-bank", detailTopic: "summary" });
assert.match(unpublished.answer, /does not publish|checkout/i, "Unpublished offer details must be represented truthfully");

assert.equal(normalizeOfferText(null), "", "Missing offer fields must stay empty during normalization");
const cleanFabContext = resolveOfferForBankAndCard("FAB", "FAB SHARE Credit Card", {
  experience: null,
  format: null,
  seatType: null,
  isMember: true,
  channel: "web",
});
assert.equal(cleanFabContext.status, "card_required", "A missing experience must request context instead of being rejected");
assert.match(cleanFabContext.reason, /select a showtime experience/i, "The resolver must ask for the missing experience");

for (const [query, expectedIds] of [
  ["Sharjah Islamic Bank", ["sharjah-islamic-bank"]],
  ["FAB", ["fab-share"]],
  ["Citibank", ["citibank"]],
  ["Emirates NBD", ["emirates-nbd"]],
  ["HSBC", ["hsbc"]],
]) {
  assert.deepEqual(searchOffers(query).map(({ id }) => id), expectedIds, `${query} must not include weak issuer matches`);
}
const adcbSearch = searchOffers("ADCB").map(({ id }) => id);
assert.ok(adcbSearch.includes("adcb"), "ADCB must resolve to its primary offer");
assert.ok(adcbSearch.every((id) => ["adcb", "adcb-touchpoints"].includes(id)), "ADCB may only include the related TouchPoints offer");
assert.ok(searchOffers("Visa Infinite").length > 1, "Generic card-tier searches must remain broad");
assert.ok(searchOffers("buy one get one free").length > 1, "Generic benefit searches must remain broad");

const sendTextStart = app.indexOf("const sendText = useCallback");
const sendTextEnd = app.indexOf("const sendUiTurn", sendTextStart);
assert.ok(sendTextStart >= 0 && sendTextEnd > sendTextStart, "Typed send route was not found");
const sendText = app.slice(sendTextStart, sendTextEnd);
const cancellationIndex = sendText.indexOf("const directCancellation");
const fallbackIndex = sendText.indexOf("const localOfferTurn");
const dismissIndex = sendText.indexOf("dismissStaleTransactionalView", fallbackIndex);
const transportIndex = sendText.indexOf("await startTextSession", fallbackIndex);
assert.ok(cancellationIndex >= 0 && cancellationIndex < fallbackIndex, "Cancellation must be classified before the offer fallback");
assert.ok(fallbackIndex >= 0 && fallbackIndex < dismissIndex, "Offer fallback must run before stale transactional views are dismissed");
assert.ok(dismissIndex < transportIndex, "The general text transport path must remain after the local fallback");
assert.match(sendText, /localOfferTurn\s*&&\s*\(activeCheckout\s*\|\|\s*!isConnected\)/, "Named offers must be handled deterministically during checkout even when transport is connected");
assert.match(sendText, /clientTools\.show_offers\(\{/, "Fallback must open the existing rich offer panel");
assert.match(sendText, /say\("agent", localAnswer\)/, "Fallback must publish the local detail answer");
assert.match(sendText, /activeCheckout\s*&&\s*isConnected[\s\S]*sendContextualUpdate/, "Connected checkout must receive the exact locally published offer result without a duplicate user turn");
assert.match(sendText, /!cancellationFlowRef\.current/, "An active cancellation flow must block the offer fallback");

const callbacksStart = app.indexOf("const transportCallbacks");
const voiceMessageStart = app.indexOf("onMessage:", callbacksStart);
const voiceMessageEnd = app.indexOf("const startTextSession", voiceMessageStart);
assert.ok(callbacksStart >= 0 && voiceMessageStart >= 0 && voiceMessageEnd > voiceMessageStart, "Voice transcript route was not found");
const voiceMessages = app.slice(voiceMessageStart, voiceMessageEnd);
assert.match(voiceMessages, /resolveLocalOfferTextTurn\(safeMessage/, "Voice transcripts must use the same named-offer resolver as typed text");
assert.match(voiceMessages, /Approved published offer result for the guest's spoken question/, "Voice must receive the grounded checkout offer result before responding");
assert.match(voiceMessages, /checkoutOfferEvaluation[\s\S]*checkout is preserved but will be hidden[\s\S]*Do not claim the offer was applied/, "Voice offer guidance must hide but preserve checkout and avoid false application claims");

const showOffersStart = app.indexOf("show_offers: async");
const showOffersEnd = app.indexOf("handover_to_agent:", showOffersStart);
assert.ok(showOffersStart >= 0 && showOffersEnd > showOffersStart, "show_offers client tool was not found");
const showOffers = app.slice(showOffersStart, showOffersEnd);
assert.match(showOffers, /const origin = current\.view === "offers" \? offersReturnRef\.current/, "Offer origin must preserve the return stage");
assert.match(showOffers, /const preservedCheckout = activeCheckoutStage\(\)/, "Offer checks must detect the exact active checkout even while its panel is hidden");
assert.match(showOffers, /current\.view !== "offers"[\s\S]*offersReturnRef\.current = current[\s\S]*pauseRichRenderingForTopicChange/, "Offer navigation must save and pause the previous rich stage");
assert.match(showOffers, /showStage\(\{ view: "offers"/, "The offer panel must replace unrelated visible rendering while checkout data remains paused");
assert.match(showOffers, /checkoutPreserved,[\s\S]*checkoutId: preservedCheckout\?\.order\?\.checkoutId[\s\S]*seats: preservedCheckout\?\.order\?\.seats[\s\S]*total: preservedCheckout\?\.order\?\.total/, "The tool result must prove the same checkout, seats, and total were preserved");
assert.ok(showOffers.indexOf("offersReturnRef.current = current") < showOffers.indexOf('showStage({ view: "offers"'), "Return stage must be saved before the offer panel opens");
assert.doesNotMatch(showOffers, /setPendingOrder|clearPendingOrder|setSelectedSeats|seatsRef\.current\s*=/, "Offer evaluation must not mutate checkout order or seats");

console.log("Offer text fallback validation passed.");
