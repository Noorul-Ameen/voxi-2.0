import assert from "node:assert/strict";
import { getOfferMedia, OFFER_MEDIA } from "../src/mediaData.js";
import { hasForbiddenCustomerFacingDash } from "../src/lib/customerFacingText.js";
import { OFFER_META, OFFERS } from "../src/offers/offersData.js";
import { answerForOfferTopic, buildOfferFacts } from "../src/offers/offerFacts.js";
import { ELIGIBILITY, evaluateOfferEligibility, normalizeExperience, resolveOffer, resolveOfferForBankAndCard, searchOffers } from "../src/offers/offerResolver.js";

assert.equal(OFFERS.length, 20, "knowledge base must contain all 20 issuer groups");
assert.equal(new Set(OFFERS.map((offer) => offer.id)).size, 20, "offer IDs must be unique");
assert.equal(OFFERS.reduce((sum, offer) => sum + offer.promotionCount, 0), 21, "issuer groups must represent all 21 current promotions");
assert.equal(OFFER_META.promotionCount, 21);
assert.equal(OFFER_META.issuerCount, 20);
assert.equal(OFFER_META.capturedDate, "2026-07-17");
assert.equal(OFFER_META.verifiedDate, "2026-07-17");
assert.match(OFFER_META.disclaimer.en, /guidance only/i);
assert.match(OFFER_META.disclaimer.en, /Final eligibility is verified at VOX checkout/i);
assert.match(OFFER_META.disclaimer.en, /bank’s current terms/i);

for (const offer of OFFERS) {
  assert.ok(offer.bank.en && offer.bank.ar, `${offer.id}: bilingual bank name`);
  assert.ok(offer.headline.en && offer.headline.ar, `${offer.id}: bilingual headline`);
  assert.ok(offer.summary.en && offer.summary.ar, `${offer.id}: bilingual summary`);
  assert.ok(offer.aliases.length, `${offer.id}: bank aliases`);
  assert.ok(offer.profiles.length, `${offer.id}: card profiles`);
  assert.equal(offer.promotionCount, offer.campaigns?.length || 1, `${offer.id}: promotion count must match campaign records`);
  assert.equal(offer.sourceUrl, OFFER_META.sourceUrl, `${offer.id}: source URL`);
  assert.match(offer.detailUrl, /^https:\/\/uae\.voxcinemas\.com\/offers\/bank-deals\//, `${offer.id}: official detail URL`);
  assert.equal(offer.termsUrl, `${offer.detailUrl}/terms-conditions`, `${offer.id}: official terms URL`);
  assert.equal(offer.verifiedDate, OFFER_META.verifiedDate, `${offer.id}: verification date`);
  const facts = buildOfferFacts(offer, "en");
  assert.equal(facts.profiles.length, offer.profiles.length, `${offer.id}: all card tiers are present in details`);
  assert.ok(facts.redemptionSteps.length, `${offer.id}: redemption guidance`);
  assert.ok(facts.commonTerms.length, `${offer.id}: common terms`);
  for (const profile of offer.profiles) {
    assert.ok(profile.aliases.length, `${offer.id}/${profile.id}: card aliases`);
    if (offer.detailsPublished !== false) assert.ok(profile.eligibility.experiences.length, `${offer.id}/${profile.id}: structured experiences`);
  }
  if (offer.campaigns?.length) {
    const mappedProfileIds = offer.campaigns.flatMap((campaign) => campaign.profileIds);
    assert.equal(new Set(mappedProfileIds).size, mappedProfileIds.length, `${offer.id}: each card profile must belong to only one promotion`);
    assert.deepEqual(
      [...mappedProfileIds].sort(),
      offer.profiles.map((profile) => profile.id).sort(),
      `${offer.id}: campaign records must cover every card profile`,
    );
  }
}

const DETAIL_TOPICS = Object.freeze(["summary", "cards", "experiences", "limits", "redemption", "exclusions", "terms"]);
const LANGUAGES = Object.freeze(["en", "ar"]);
const officialPage = (value, label) => {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", `${label}: official link must use HTTPS`);
  assert.equal(url.hostname, "uae.voxcinemas.com", `${label}: official link must remain on the VOX UAE host`);
  assert.match(url.pathname, /^\/offers\/bank-deals(?:\/|$)/, `${label}: official link must remain under bank deals`);
  assert.equal(url.search, "", `${label}: official page link must not contain an unexpected query`);
  assert.equal(url.hash, "", `${label}: official page link must not contain an unexpected fragment`);
  return url;
};

const promotionViews = OFFERS.flatMap((offer) => {
  if (!offer.campaigns?.length) {
    return [{
      id: offer.id,
      issuer: offer,
      offer,
      detailUrl: offer.detailUrl,
      termsUrl: offer.termsUrl,
      detailsPublished: offer.detailsPublished !== false,
      mediaCode: offer.mediaCode,
    }];
  }
  return offer.campaigns.map((campaign) => {
    const profiles = campaign.profileIds.map((profileId) => {
      const profile = offer.profiles.find((item) => item.id === profileId);
      assert.ok(profile, `${offer.id}/${campaign.id}: campaign profile ${profileId} must exist`);
      return profile;
    });
    return {
      id: campaign.id,
      issuer: offer,
      offer: {
        ...offer,
        benefit: campaign.benefit || offer.benefit,
        headline: campaign.headline || offer.headline,
        profiles,
        detailsPublished: campaign.detailsPublished !== false,
        detailUrl: campaign.detailUrl,
        termsUrl: campaign.termsUrl,
      },
      detailUrl: campaign.detailUrl,
      termsUrl: campaign.termsUrl,
      detailsPublished: campaign.detailsPublished !== false,
      mediaCode: campaign.mediaCode || offer.mediaCode,
    };
  });
});

assert.equal(promotionViews.length, OFFER_META.promotionCount, "every published promotion must have a validation view");
assert.equal(new Set(promotionViews.map((promotion) => promotion.id)).size, OFFER_META.promotionCount, "promotion IDs must be unique");
assert.equal(OFFER_MEDIA.length, OFFER_META.promotionCount, "the official snapshot must contain artwork metadata for every promotion");
assert.equal(new Set(OFFER_MEDIA.map((media) => String(media.code).toLowerCase())).size, OFFER_MEDIA.length, "official promotion media codes must be unique");

const coveredMediaCodes = new Set();
let checkedTopicAnswers = 0;
let checkedProfileTopicAnswers = 0;
let unpublishedPromotions = 0;
for (const promotion of promotionViews) {
  const label = `${promotion.issuer.id}/${promotion.id}`;
  const detailUrl = officialPage(promotion.detailUrl, `${label} details`);
  const termsUrl = officialPage(promotion.termsUrl, `${label} terms`);
  assert.equal(termsUrl.pathname, `${detailUrl.pathname}/terms-conditions`, `${label}: terms link must belong to its detail page`);

  const media = getOfferMedia({ ...promotion.issuer, mediaCode: promotion.mediaCode });
  assert.ok(media, `${label}: official promotion media must resolve`);
  coveredMediaCodes.add(String(media.code).toLowerCase());
  assert.equal(media.sourcePageUrl, OFFER_META.sourceUrl, `${label}: media must cite the official bank-deals page`);
  const mediaApiUrl = new URL(media.sourceUrl);
  assert.equal(mediaApiUrl.protocol, "https:", `${label}: media source API must use HTTPS`);
  assert.equal(mediaApiUrl.hostname, "uae-apife.voxcinemas.com", `${label}: media source API host`);
  assert.equal(mediaApiUrl.searchParams.get("region"), "UAE", `${label}: media source region`);
  assert.equal(mediaApiUrl.searchParams.get("type"), "bank", `${label}: media source type`);

  if (!promotion.detailsPublished) unpublishedPromotions += 1;
  for (const language of LANGUAGES) {
    const facts = buildOfferFacts(promotion.offer, language);
    assert.ok(facts, `${label}/${language}: promotion facts must be available`);
    assert.equal(facts.detailsPublished, promotion.detailsPublished, `${label}/${language}: published-detail state`);
    assert.equal(facts.detailUrl, promotion.detailUrl, `${label}/${language}: detail source must survive fact rendering`);
    assert.equal(facts.termsUrl, promotion.termsUrl, `${label}/${language}: terms source must survive fact rendering`);
    assert.equal(facts.sourceUrl, OFFER_META.sourceUrl, `${label}/${language}: catalog source must survive fact rendering`);

    for (const topic of DETAIL_TOPICS) {
      const answer = answerForOfferTopic(promotion.offer, null, language, topic);
      checkedTopicAnswers += 1;
      assert.equal(typeof answer, "string", `${label}/${language}/${topic}: answer type`);
      assert.ok(answer.trim(), `${label}/${language}/${topic}: answer must not be empty`);
      assert.doesNotMatch(answer, /\b(?:undefined|null)\b|\[object Object\]/iu, `${label}/${language}/${topic}: answer must not expose unresolved data`);
      assert.equal(hasForbiddenCustomerFacingDash(answer), false, `${label}/${language}/${topic}: answer punctuation`);
      if (!promotion.detailsPublished) {
        assert.match(answer, language === "ar" ? /لا تنشر|التحقق من الأهلية/u : /do not publish|has not published|not publish/iu, `${label}/${language}/${topic}: unpublished details must be disclosed`);
        assert.match(answer, language === "ar" ? /إتمام الحجز لدى VOX/u : /VOX checkout/iu, `${label}/${language}/${topic}: unpublished details must retain the checkout boundary`);
      }
    }

    for (const profile of promotion.offer.profiles) {
      for (const topic of DETAIL_TOPICS) {
        const answer = answerForOfferTopic(promotion.offer, profile, language, topic);
        checkedProfileTopicAnswers += 1;
        assert.equal(typeof answer, "string", `${label}/${profile.id}/${language}/${topic}: answer type`);
        assert.ok(answer.trim(), `${label}/${profile.id}/${language}/${topic}: answer must not be empty`);
        assert.doesNotMatch(answer, /\b(?:undefined|null)\b|\[object Object\]/iu, `${label}/${profile.id}/${language}/${topic}: answer must not expose unresolved data`);
        assert.equal(hasForbiddenCustomerFacingDash(answer), false, `${label}/${profile.id}/${language}/${topic}: answer punctuation`);
        if (!promotion.detailsPublished) {
          assert.match(answer, language === "ar" ? /لا تنشر|التحقق من الأهلية/u : /do not publish|has not published|not publish/iu, `${label}/${profile.id}/${language}/${topic}: unpublished details must be disclosed`);
        }
      }
    }
  }

  if (!promotion.detailsPublished) {
    const result = evaluateOfferEligibility(promotion.offer, promotion.offer.profiles[0], {
      experience: "STANDARD 2D",
      isMember: true,
      channel: "web",
      ticketCount: 2,
      monthlyTicketsUsed: 0,
      monthlySpend: 10_000,
      orderTotal: 100,
      cinemaName: "Yas Mall",
    });
    assert.equal(result.status, ELIGIBILITY.CARD_REQUIRED, `${label}: unpublished details must never resolve as eligible`);
    assert.equal(result.eligible, false, `${label}: unpublished details must not claim eligibility`);
    assert.deepEqual(result.missingFields, ["checkoutVerification"], `${label}: checkout verification must be explicit`);
  }
}

assert.equal(coveredMediaCodes.size, OFFER_MEDIA.length, "all 21 official promotion media records must be covered exactly once");
assert.equal(unpublishedPromotions, 2, "SIB and Citi BOGO must retain their unpublished-detail state");
assert.equal(checkedTopicAnswers, OFFER_META.promotionCount * LANGUAGES.length * DETAIL_TOPICS.length, "every promotion topic must be checked in English and Arabic");
assert.equal(checkedProfileTopicAnswers, OFFERS.reduce((sum, offer) => sum + offer.profiles.length, 0) * LANGUAGES.length * DETAIL_TOPICS.length, "every card-profile topic must be checked in English and Arabic");
assert.equal(hasForbiddenCustomerFacingDash(JSON.stringify({ OFFER_META, OFFERS })), false, "offer catalog customer-facing text must not contain forbidden dash punctuation");

const sib = OFFERS.find((offer) => offer.id === "sharjah-islamic-bank");
assert.equal(sib.detailsPublished, false, "SIB must preserve the official blank-terms state");
assert.deepEqual(resolveOffer("SIB", {}).missingFields, ["checkoutVerification"], "SIB eligibility must not be guessed");
assert.match(answerForOfferTopic(sib, null, "en", "cards"), /do not publish|has not published/i);

const citi = OFFERS.find((offer) => offer.id === "citibank");
assert.equal(citi.campaigns.length, 2, "Citi must expose both current landing cards");
assert.equal(citi.campaigns[0].detailsPublished, false, "the separate Citi BOGO terms body is blank");
assert.equal(citi.campaigns[1].validUntil, "2027-04-30", "the detailed Citi campaign expiry must be retained");
assert.match(answerForOfferTopic(citi, citi.profiles[2], "en", "limits"), /discounted tickets/i);
assert.ok(searchOffers("خصم 50٪").length, "Arabic offer content must be searchable");

const expectStatus = (query, context, expected, expectedOffer) => {
  const result = resolveOffer(query, context);
  assert.equal(result.status, expected, `${query}: ${result.reason}`);
  if (expectedOffer) assert.equal(result.offer?.id, expectedOffer, `${query}: wrong offer resolved`);
  return result;
};

const qualified = (context = {}) => ({
  isMember: true,
  channel: "online",
  ticketCount: 2,
  orderTotal: 100,
  monthlyTicketsUsed: 0,
  monthlySpend: 10_000,
  cinemaName: "Yas Mall",
  ...context,
});

expectStatus("FAB", { experience: "Regular 2D" }, ELIGIBILITY.CARD_REQUIRED, "fab-share");
expectStatus("FAB SHARE card", qualified({ experience: "Regular 2D", cinemaName: "City Centre Mirdif" }), ELIGIBILITY.ELIGIBLE, "fab-share");
expectStatus("FAB SHARE card", { experience: "IMAX 2D" }, ELIGIBILITY.INELIGIBLE, "fab-share");
expectStatus("HSBC Platinum", { experience: "GOLD 2D" }, ELIGIBILITY.INELIGIBLE, "hsbc");
expectStatus("HSBC Black", { experience: "THEATRE 2D", cinemaName: "Mall of the Emirates" }, ELIGIBILITY.INELIGIBLE, "hsbc");
expectStatus("HSBC Black", qualified({ experience: "THEATRE 2D", cinemaName: "Yas Mall" }), ELIGIBILITY.ELIGIBLE, "hsbc");
expectStatus("RAK Bank Air Arabia Platinum", { experience: "4DX" }, ELIGIBILITY.INELIGIBLE, "rakbank");
expectStatus("NBF Visa", { experience: "MAX 2D", monthlySpend: 1000 }, ELIGIBILITY.INELIGIBLE, "nbf");
expectStatus("ENBD Visa Infinite", qualified({ experience: "4DX" }), ELIGIBILITY.ELIGIBLE, "emirates-nbd");
expectStatus("Citi Life Platinum", { experience: "IMAX 2D", ticketCount: 1 }, ELIGIBILITY.INELIGIBLE, "citibank");
expectStatus("Citi Life Platinum", qualified({ experience: "Standard 2D", ticketCount: 1 }), ELIGIBILITY.ELIGIBLE, "citibank");
expectStatus("Arab Bank Signature VIP", { experience: "THEATRE", cinemaName: "Mall of the Emirates" }, ELIGIBILITY.INELIGIBLE, "arab-bank-signature");
const fullEnbd = resolveOfferForBankAndCard("Emirates NBD", "Visa Infinite", qualified({ experience: "4DX" }));
assert.equal(fullEnbd.status, ELIGIBILITY.ELIGIBLE);
assert.equal(resolveOfferForBankAndCard("ADCB", "TouchPoints Visa Infinite", qualified({ experience: "STANDARD", seatType: "REGULAR", format: "2D" })).offer?.id, "adcb");
assert.equal(resolveOfferForBankAndCard("ADCB", "TouchPoints Platinum", qualified({ experience: "MAX", format: "2D" })).offer?.id, "adcb");
assert.equal(resolveOfferForBankAndCard("FAB", "FAB SHARE card", { experience: "STANDARD" }).status, ELIGIBILITY.CARD_REQUIRED, "missing 2D/3D detail must stay conditional");
assert.equal(resolveOfferForBankAndCard("FAB", "FAB SHARE card", { experience: "PRIVATE CINEMA" }).status, ELIGIBILITY.INELIGIBLE);
assert.equal(resolveOfferForBankAndCard("Aafaq", "Platinum Credit Card", qualified({ experience: "KIDS 3D", ticketCount: 2 })).status, ELIGIBILITY.ELIGIBLE);
assert.equal(resolveOfferForBankAndCard("Citi", "Life Infinite", { experience: "STANDARD 2D", ticketCount: 1 }).status, ELIGIBILITY.INELIGIBLE, "Citi BOGO needs two tickets");
assert.equal(resolveOfferForBankAndCard("Citi", "Premier", qualified({ experience: "STANDARD 2D", ticketCount: 1 })).status, ELIGIBILITY.ELIGIBLE, "Citi 30% has no two-ticket minimum");
assert.equal(resolveOfferForBankAndCard("Citi", "Life Infinite", { experience: "MAX 2D", cinemaName: "City Centre Deira", seatType: "Balcony", ticketCount: 2 }).status, ELIGIBILITY.INELIGIBLE);
assert.equal(resolveOfferForBankAndCard("CBD", "Visa Infinite Metal", { experience: "IMAX", seatType: "Sapphire" }).status, ELIGIBILITY.INELIGIBLE);

const experienceMappings = {
  "4DX": "4DX", "Couch - 2 Seater": "COUCH", GOLD: "GOLD", IMAX: "IMAX", KIDS: "KIDS", MAX: "MAX",
  ONYX: "ONYX", PREMIER: "PREMIER", PREMIUM: "PREMIUM", "PRIVATE CINEMA": "PRIVATE_CINEMA",
  STANDARD: "STANDARD", THEATRE: "THEATRE", "THEATRE PODS IN IMAX": "THEATRE_PODS",
};
for (const [source, expected] of Object.entries(experienceMappings)) assert.equal(normalizeExperience(source), expected, source);

const cbdConflict = expectStatus("CBD Visa Infinite Metal", qualified({ experience: "4DX" }), ELIGIBILITY.ELIGIBLE, "cbd");
assert.match(cbdConflict.advisory, /conflict/i, "CBD 4DX conflict must be disclosed");

expectStatus("ADCB TouchPoints", qualified({ experience: "IMAX 3D", isMember: false, orderTotal: 30 }), ELIGIBILITY.ELIGIBLE, "adcb-touchpoints");
expectStatus("ADCB TouchPoints", { experience: "Standard 2D", isMember: false, orderTotal: 10 }, ELIGIBILITY.INELIGIBLE, "adcb-touchpoints");

const incompleteEnbd = resolveOffer("ENBD Visa Infinite", { experience: "4DX" });
assert.equal(incompleteEnbd.status, ELIGIBILITY.CARD_REQUIRED, "unknown membership, channel, ticket count and usage must not be called eligible");
assert.deepEqual(incompleteEnbd.missingFields, ["membership", "channel", "ticketCount", "monthlyTicketsUsed"]);
assert.equal(resolveOffer("NBF Visa", qualified({ experience: "MAX 2D", monthlySpend: undefined })).status, ELIGIBILITY.CARD_REQUIRED, "missing spend must remain conditional");
assert.equal(resolveOffer("HSBC Black", qualified({ experience: "THEATRE 2D", cinemaName: undefined })).status, ELIGIBILITY.CARD_REQUIRED, "cinema-specific exclusions require a cinema");
assert.equal(resolveOffer("Visa Infinite", qualified({ experience: "4DX" })).status, ELIGIBILITY.CARD_REQUIRED, "generic card names must not guess an issuing bank");
assert.equal(resolveOffer("Platinum", qualified({ experience: "STANDARD 2D" })).status, ELIGIBILITY.CARD_REQUIRED, "ambiguous card tiers must ask for bank and exact card");

assert.equal(searchOffers("RAK bak")[0]?.id, "rakbank", "fuzzy bank search");
assert.equal(searchOffers("cashbak plus")[0]?.id, "liv", "fuzzy card search");
assert.equal(getOfferMedia(OFFERS.find((offer) => offer.id === "arab-bank-signature"))?.code, "ARABBIN7", "Arab Bank Signature must use its own official artwork");
assert.equal(getOfferMedia(OFFERS.find((offer) => offer.id === "arab-bank"))?.code, "ARAB", "plain Arab Bank must not inherit Signature artwork");

console.log(`Validated ${OFFER_META.promotionCount} VOX UAE promotions across ${OFFERS.length} issuer groups, ${OFFERS.reduce((sum, offer) => sum + offer.profiles.length, 0)} card profiles, ${checkedTopicAnswers + checkedProfileTopicAnswers} bilingual topic answers, official sources, unpublished-detail boundaries, and tri-state eligibility scenarios.`);
