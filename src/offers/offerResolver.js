import { OFFER_META, OFFERS } from "./offersData.js";

export const ELIGIBILITY = Object.freeze({
  ELIGIBLE: "eligible",
  INELIGIBLE: "ineligible",
  CARD_REQUIRED: "card_required",
});

const CARD_STOP_WORDS = new Set(["bank", "card", "credit", "debit", "offer", "deal", "please", "my", "the", "a", "an"]);
const GENERIC_CARD_ONLY = /^(?:(?:visa|mastercard)\s+)?(?:infinite|signature|platinum|gold|classic|titanium|world|world elite|black|premier|rewards)(?:\s+(?:credit|debit))?(?:\s+card)?$/;
const GENERIC_CARD_SEARCH = /^(?:(?:which|what|show|list|eligible|qualifying|qualified|qualify|credit|debit|bank|visa|mastercard)\s+)*(?:card|cards)$/;

export function normalizeOfferText(value = "") {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const before = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = before;
    }
  }
  return row[b.length];
}

export function fuzzyScore(query, candidate) {
  const q = normalizeOfferText(query);
  const c = normalizeOfferText(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (q.includes(c)) return Math.min(0.97, 0.9 + (c.length / q.length) * 0.07);
  if (c.includes(q) && q.length >= 3) return Math.min(0.9, 0.8 + (q.length / c.length) * 0.1);

  const qTokens = new Set(q.split(" "));
  const cTokens = new Set(c.split(" "));
  const overlap = [...qTokens].filter((token) => cTokens.has(token)).length;
  const union = new Set([...qTokens, ...cTokens]).size;
  const tokenScore = union ? overlap / union : 0;
  const editScore = 1 - levenshtein(q, c) / Math.max(q.length, c.length);
  return tokenScore * 0.62 + Math.max(0, editScore) * 0.38;
}

function aliasesForOffer(offer) {
  return [offer.bank.en, offer.bank.ar, ...offer.aliases];
}

function aliasesForProfile(profile) {
  return [profile.name.en, profile.name.ar, ...profile.aliases];
}

function bestAlias(query, aliases) {
  return aliases.reduce((best, alias) => {
    const score = fuzzyScore(query, alias);
    return score > best.score ? { alias, score } : best;
  }, { alias: "", score: 0 });
}

function rankOffers(query, offers = OFFERS) {
  return offers
    .map((offer) => ({ offer, ...bestAlias(query, aliasesForOffer(offer)) }))
    .sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
}

function rankProfiles(query, offers = OFFERS) {
  return offers
    .flatMap((offer) => offer.profiles.map((profile) => ({ offer, profile, ...bestAlias(query, aliasesForProfile(profile)) })))
    .sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
}

function cardHintAfterBank(query, offer) {
  let remaining = normalizeOfferText(query);
  const normalizedAliases = aliasesForOffer(offer)
    .map(normalizeOfferText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const present = normalizedAliases.find((alias) => remaining.includes(alias));
  if (!present) return "";
  remaining = remaining.replace(present, " ");
  return remaining
    .split(" ")
    .filter((token) => token && !CARD_STOP_WORDS.has(token))
    .join(" ");
}

export function normalizeExperience(value = "") {
  const input = normalizeOfferText(value);
  if (!input) return "";
  if (/\btheatre pods?\b/.test(input)) return "THEATRE_PODS";
  if (/\bprivate cinema\b/.test(input)) return "PRIVATE_CINEMA";
  if (/\bcouch\b/.test(input)) return "COUCH";
  if (/\b4dx\b/.test(input)) return "4DX";
  if (/\bimax\b/.test(input)) return "IMAX";
  if (/\bmax\b|atmos/.test(input)) return "MAX";
  if (/\btheatre\b|\btheater\b/.test(input)) return "THEATRE";
  if (/\bgold\b/.test(input)) return "GOLD";
  if (/\bkids?\b/.test(input)) return "KIDS";
  if (/\bpremier\b/.test(input)) return "PREMIER";
  if (/\boutdoor\b|galleria/.test(input)) return "OUTDOOR";
  if (/\bonyx\b/.test(input)) return "ONYX";
  if (/\bsnow\b/.test(input)) return "SNOW";
  if (/\bvip\b/.test(input)) return "VIP";
  if (/\bpremium\b/.test(input) && !/view/.test(input)) return "PREMIUM";
  if (/\bstandard\b|\bregular\b|\b2d\b|\b3d\b/.test(input)) return "STANDARD";
  return "UNSUPPORTED";
}

function normalizeFormat(context) {
  const input = normalizeOfferText(`${context.format || ""} ${context.experience || ""}`);
  if (/\b3d\b/.test(input)) return "3D";
  if (/\b2d\b/.test(input)) return "2D";
  return "";
}

function normalizeSeat(context) {
  const input = normalizeOfferText(`${context.seatType || ""} ${context.experience || ""}`);
  if (/\bsapphire\b/.test(input)) return "SAPPHIRE";
  if (/\bbalcony\b/.test(input)) return "BALCONY";
  if (/\bpreferred\b/.test(input)) return "PREFERRED";
  if (/\bpremium\b/.test(input)) return "PREMIUM";
  if (/\bregular\b|\bstandard\b/.test(input)) return "REGULAR";
  return "";
}

function cinemaMatches(cinema, candidates = []) {
  const normalized = normalizeOfferText(cinema);
  return Boolean(normalized) && candidates.some((candidate) => {
    const value = normalizeOfferText(candidate);
    return normalized.includes(value) || value.includes(normalized);
  });
}

function failure(offer, profile, reason, context) {
  return {
    status: ELIGIBILITY.INELIGIBLE,
    eligible: false,
    offer,
    cardProfile: profile,
    effectiveBenefit: profile?.benefit || offer?.benefit || null,
    reason,
    advisory: "",
    context,
    contextFingerprint: context?.fingerprint || null,
  };
}

function needsDetails(offer, profile, reason, context, missingFields = []) {
  return {
    status: ELIGIBILITY.CARD_REQUIRED,
    eligible: false,
    offer,
    cardProfile: profile,
    effectiveBenefit: profile?.benefit || offer?.benefit || null,
    reason,
    advisory: "Final eligibility is confirmed at VOX checkout.",
    context,
    contextFingerprint: context?.fingerprint || null,
    missingFields: [...new Set(missingFields)],
  };
}

export function evaluateOfferEligibility(offer, profile, context = {}) {
  if (!offer) return { status: ELIGIBILITY.CARD_REQUIRED, eligible: false, offer: null, cardProfile: null, effectiveBenefit: null, reason: "Choose a bank offer first.", advisory: "", context, contextFingerprint: context?.fingerprint || null };
  if (!profile && !offer.profiles.some((item) => item.noCardRequired)) {
    return { status: ELIGIBILITY.CARD_REQUIRED, eligible: false, offer, cardProfile: null, effectiveBenefit: offer.benefit, reason: `Tell me the exact ${offer.bank.en} card to check eligibility.`, advisory: "", context, contextFingerprint: context?.fingerprint || null };
  }

  const selectedProfile = profile || offer.profiles.find((item) => item.noCardRequired);
  const rules = selectedProfile.eligibility || {};
  const experience = normalizeExperience(context.experience);
  const format = normalizeFormat(context);
  const seat = normalizeSeat(context);
  const cinema = context.cinemaName || context.cinema || context.cinemaId || "";
  const normalizedContext = { ...context, experience, format, seat, cinema };

  if (offer.detailsPublished === false || selectedProfile.verificationOnly) {
    return needsDetails(
      offer,
      selectedProfile,
      "VOX currently lists this promotion, but has not published the eligible cards or conditions. Check eligibility at VOX checkout.",
      normalizedContext,
      ["checkoutVerification"],
    );
  }

  if (!experience) return needsDetails(offer, selectedProfile, "Select a showtime experience before checking this offer.", normalizedContext, ["experience"]);
  if (experience === "UNSUPPORTED" || ["PRIVATE_CINEMA", "THEATRE_PODS"].includes(experience)) {
    return failure(offer, selectedProfile, `${context.experience || "This experience"} is not listed for this offer.`, normalizedContext);
  }

  if (offer.memberRequired && context.isMember === false) {
    return failure(offer, selectedProfile, "Bank offers require a logged-in VOX member.", normalizedContext);
  }
  if (offer.onlineOnly && context.channel && !["online", "web", "website", "app", "mobile app"].includes(normalizeOfferText(context.channel))) {
    return failure(offer, selectedProfile, "This offer is available only through the VOX website or app.", normalizedContext);
  }
  const minTickets = selectedProfile.minTickets ?? offer.minTickets;
  if (minTickets && Number.isFinite(context.ticketCount) && context.ticketCount < minTickets) {
    return failure(offer, selectedProfile, `Choose at least ${minTickets} tickets for this offer.`, normalizedContext);
  }
  const maxSessionTickets = offer.perSessionLimit?.maxTickets;
  if (Number.isFinite(maxSessionTickets) && Number.isFinite(context.ticketCount) && context.ticketCount > maxSessionTickets) {
    return failure(offer, selectedProfile, `Choose no more than ${maxSessionTickets} tickets in one booking for this offer.`, normalizedContext);
  }
  if (offer.minOrderTotal && Number.isFinite(context.orderTotal) && context.orderTotal < offer.minOrderTotal) {
    return failure(offer, selectedProfile, `The minimum order value is AED ${offer.minOrderTotal}.`, normalizedContext);
  }

  const limit = selectedProfile.monthlyLimit;
  const maxMonthly = limit && (limit.maxTickets ?? limit.maxFreeTickets);
  if (Number.isFinite(maxMonthly) && Number.isFinite(context.monthlyTicketsUsed) && context.monthlyTicketsUsed >= maxMonthly) {
    return failure(offer, selectedProfile, `The stated monthly limit of ${maxMonthly} ticket${maxMonthly === 1 ? "" : "s"} has been reached.`, normalizedContext);
  }
  const spendRule = selectedProfile.requirements?.find((item) => item.type === "minimum_monthly_spend");
  if (spendRule && Number.isFinite(context.monthlySpend) && context.monthlySpend < spendRule.amount) {
    return failure(offer, selectedProfile, `This card requires at least AED ${spendRule.amount} monthly retail spend.`, normalizedContext);
  }

  if (experience && rules.experiences?.length && !rules.experiences.includes(experience)) {
    return failure(offer, selectedProfile, `${experience} is not listed for this card.`, normalizedContext);
  }
  if (experience && rules.excludedExperiences?.includes(experience)) {
    return failure(offer, selectedProfile, `${experience} is excluded for this card.`, normalizedContext);
  }
  if (rules.formats?.length && !format) {
    return needsDetails(offer, selectedProfile, "The 2D/3D format is required to confirm this card's eligibility.", normalizedContext, ["format"]);
  }
  if (experience && rules.formatsByExperience?.[experience]?.length && !format) {
    return needsDetails(offer, selectedProfile, `The ${experience} 2D/3D format is required to confirm eligibility.`, normalizedContext, ["format"]);
  }
  if (format && rules.formats?.length && !rules.formats.includes(format)) {
    return failure(offer, selectedProfile, `${format} is not listed for this card.`, normalizedContext);
  }
  if (format && experience && rules.formatsByExperience?.[experience] && !rules.formatsByExperience[experience].includes(format)) {
    return failure(offer, selectedProfile, `${experience} ${format} is not listed for this card.`, normalizedContext);
  }
  if (!seat && (rules.allowedSeats?.length || rules.excludedSeats?.length || rules.excludedSeatsByExperience?.[experience]?.length)) {
    return needsDetails(offer, selectedProfile, "The seat category is required to confirm this card's eligibility.", normalizedContext, ["seatType"]);
  }
  if (seat && rules.allowedSeats?.length && !rules.allowedSeats.includes(seat)) {
    return failure(offer, selectedProfile, `${seat} seats are not listed for this card.`, normalizedContext);
  }
  if (seat && rules.excludedSeats?.includes(seat)) {
    return failure(offer, selectedProfile, `${seat} seats are excluded for this card.`, normalizedContext);
  }
  if (seat && experience && rules.excludedSeatsByExperience?.[experience]?.includes(seat)) {
    return failure(offer, selectedProfile, `${experience} ${seat} seats are excluded for this card.`, normalizedContext);
  }

  const onlyAt = rules.onlyAt?.find((rule) => rule.experiences.includes(experience));
  if (onlyAt && cinema && !cinemaMatches(cinema, onlyAt.cinemas)) {
    return failure(offer, selectedProfile, `${experience} is covered only at ${onlyAt.cinemas[0]}.`, normalizedContext);
  }
  const excludedAt = rules.excludedAt?.find((rule) => {
    if (!cinemaMatches(cinema, rule.cinemas)) return false;
    if (rule.experiences?.length && !rule.experiences.includes(experience)) return false;
    if (rule.seats?.length && !rule.seats.includes(seat)) return false;
    return true;
  });
  const unresolvedSeatExclusion = rules.excludedAt?.find((rule) => (
    !seat && rule.seats?.length && cinemaMatches(cinema, rule.cinemas)
      && (!rule.experiences?.length || rule.experiences.includes(experience))
  ));
  if (unresolvedSeatExclusion) {
    return needsDetails(offer, selectedProfile, "The seat category is required to check this cinema exclusion.", normalizedContext, ["seatType"]);
  }
  if (excludedAt) {
    return failure(offer, selectedProfile, `${experience || "This category"}${seat ? ` ${seat}` : ""} is excluded at this cinema.`, normalizedContext);
  }

  const missingFields = [];
  if (offer.memberRequired && typeof context.isMember !== "boolean") missingFields.push("membership");
  if (offer.onlineOnly && !normalizeOfferText(context.channel)) missingFields.push("channel");
  if ((minTickets || Number.isFinite(maxSessionTickets)) && !Number.isFinite(context.ticketCount)) missingFields.push("ticketCount");
  if (offer.minOrderTotal && !Number.isFinite(context.orderTotal)) missingFields.push("orderTotal");
  if (Number.isFinite(maxMonthly) && !Number.isFinite(context.monthlyTicketsUsed)) missingFields.push("monthlyTicketsUsed");
  if (spendRule && !Number.isFinite(context.monthlySpend)) missingFields.push("monthlySpend");
  const cinemaSpecificExclusions = rules.excludedAt?.some((rule) => (
    (!rule.experiences?.length || rule.experiences.includes(experience))
      && (!rule.seats?.length || !seat || rule.seats.includes(seat))
  ));
  if (!cinema && (onlyAt || cinemaSpecificExclusions)) missingFields.push("cinema");
  const cinemaRuleNeedsSeat = rules.excludedAt?.some((rule) => (
    rule.seats?.length
      && (!rule.experiences?.length || rule.experiences.includes(experience))
      && (!cinema || cinemaMatches(cinema, rule.cinemas))
  ));
  if (!seat && cinemaRuleNeedsSeat) missingFields.push("seatType");

  if (missingFields.length) {
    const labels = {
      membership: "VOX membership status",
      channel: "booking channel",
      ticketCount: "ticket count",
      orderTotal: "order total",
      monthlyTicketsUsed: "monthly offer usage",
      monthlySpend: "monthly retail spend",
      cinema: "cinema",
      seatType: "seat category",
      checkoutVerification: "VOX checkout verification",
    };
    const readable = missingFields.map((field) => labels[field]).join(", ");
    return needsDetails(offer, selectedProfile, `More details are needed: ${readable}.`, normalizedContext, missingFields);
  }

  const advisories = [];
  if (Number.isFinite(maxMonthly)) advisories.push(`Stated monthly limit: ${maxMonthly} ticket${maxMonthly === 1 ? "" : "s"}.`);
  if (limit?.termsConflict) advisories.push(limit.termsConflict);
  const confirmation = rules.checkoutConfirmation?.find((rule) => !rule.experiences?.length || rule.experiences.includes(experience));
  if (confirmation) advisories.push(confirmation.message);
  advisories.push("Final eligibility is confirmed at VOX checkout.");

  return {
    status: ELIGIBILITY.ELIGIBLE,
    eligible: true,
    offer,
    cardProfile: selectedProfile,
    effectiveBenefit: selectedProfile?.benefit || offer.benefit,
    reason: `${selectedProfile.name.en} is listed for${experience ? ` ${experience}` : " eligible VOX categories"}.`,
    advisory: advisories.join(" "),
    context: normalizedContext,
    contextFingerprint: normalizedContext?.fingerprint || null,
  };
}

export function resolveOffer(query, context = {}, offers = OFFERS) {
  const normalizedQuery = normalizeOfferText(query);
  if (!normalizedQuery) {
    return { status: ELIGIBILITY.CARD_REQUIRED, eligible: false, offer: null, cardProfile: null, reason: "Tell me your bank and exact card name.", advisory: "", context };
  }

  const offerRanks = rankOffers(query, offers);
  const profileRanks = rankProfiles(query, offers);
  const bankMatch = offerRanks[0];
  const globalCardMatch = profileRanks[0];
  const globalCardRunnerUp = profileRanks[1];
  const plausibleGlobalCard = globalCardMatch?.score >= 0.78;
  const uniqueGlobalCard = !GENERIC_CARD_ONLY.test(normalizedQuery)
    && globalCardMatch?.score >= 0.84
    && (!globalCardRunnerUp || globalCardMatch.score - globalCardRunnerUp.score >= 0.06);

  let selectedOffer = bankMatch?.score >= 0.64 ? bankMatch.offer : null;
  let selectedProfile = null;

  // A specific card phrase is more useful than a shorter bank/payment alias.
  if (uniqueGlobalCard && (!selectedOffer || globalCardMatch.score > bankMatch.score + 0.015)) {
    selectedOffer = globalCardMatch.offer;
    selectedProfile = globalCardMatch.profile;
  }

  if (!selectedOffer) {
    if (plausibleGlobalCard) {
      return {
        status: ELIGIBILITY.CARD_REQUIRED,
        eligible: false,
        offer: null,
        cardProfile: null,
        reason: "That card name can match more than one published offer. Tell me the issuing bank and exact card name.",
        advisory: "Final eligibility is confirmed at VOX checkout.",
        context,
        missingFields: ["bank", "card"],
      };
    }
    return { status: ELIGIBILITY.INELIGIBLE, eligible: false, offer: null, cardProfile: null, effectiveBenefit: null, reason: `I could not match that bank or card to the ${OFFER_META.promotionCount} published VOX UAE promotions.`, advisory: "", context, contextFingerprint: context?.fingerprint || null };
  }

  if (!selectedProfile) {
    const cardHint = cardHintAfterBank(query, selectedOffer);
    const withinOfferRanks = selectedOffer.profiles
      .map((profile) => ({ profile, ...bestAlias(cardHint || query, aliasesForProfile(profile)) }))
      .sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
    const withinOffer = withinOfferRanks[0];
    const withinRunnerUp = withinOfferRanks[1];
    const unambiguous = !withinRunnerUp || withinOffer.score - withinRunnerUp.score >= 0.04;
    if (cardHint && withinOffer?.score >= 0.78 && unambiguous) selectedProfile = withinOffer.profile;
    if (cardHint && withinOffer?.score >= 0.78 && !unambiguous) {
      return {
        status: ELIGIBILITY.CARD_REQUIRED,
        eligible: false,
        offer: selectedOffer,
        cardProfile: null,
        reason: `That description matches more than one ${selectedOffer.bank.en} card. Tell me the exact card name.`,
        advisory: "Final eligibility is confirmed at VOX checkout.",
        context,
        missingFields: ["card"],
      };
    }
  }
  if (!selectedProfile && selectedOffer.profiles.length === 1 && selectedOffer.profiles[0].noCardRequired) {
    selectedProfile = selectedOffer.profiles[0];
  }

  if (!selectedProfile) {
    const cardHint = cardHintAfterBank(query, selectedOffer);
    if (cardHint) {
      return { status: ELIGIBILITY.INELIGIBLE, eligible: false, offer: selectedOffer, cardProfile: null, reason: `“${cardHint}” is not in the published eligible-card list for ${selectedOffer.bank.en}.`, advisory: "Check the exact card name or confirm at VOX checkout.", context };
    }
    return evaluateOfferEligibility(selectedOffer, null, context);
  }

  return evaluateOfferEligibility(selectedOffer, selectedProfile, context);
}

export function resolveOfferForBankAndCard(bankQuery, cardQuery, context = {}, offers = OFFERS) {
  if (!cardQuery) return resolveOffer(bankQuery, context, offers);
  if (!bankQuery) return resolveOffer(cardQuery, context, offers);

  const candidates = offers
    .map((offer) => {
      const bankMatch = bestAlias(bankQuery, aliasesForOffer(offer));
      const cardMatch = offer.profiles
        .map((profile) => ({ profile, ...bestAlias(cardQuery, aliasesForProfile(profile)) }))
        .sort((a, b) => b.score - a.score || b.alias.length - a.alias.length)[0];
      return { offer, bankMatch, cardMatch };
    })
    .filter((item) => item.bankMatch.score >= 0.64)
    .sort((a, b) => b.cardMatch.score - a.cardMatch.score || b.bankMatch.score - a.bankMatch.score);

  const selected = candidates[0];
  const runnerUp = candidates[1];
  if (!selected) {
    return { status: ELIGIBILITY.INELIGIBLE, eligible: false, offer: null, cardProfile: null, effectiveBenefit: null, reason: `I could not match that bank to the ${OFFER_META.promotionCount} published VOX UAE promotions.`, advisory: "", context, contextFingerprint: context?.fingerprint || null };
  }
  if (!selected.cardMatch || selected.cardMatch.score < 0.72) {
    return { status: ELIGIBILITY.INELIGIBLE, eligible: false, offer: selected.offer, cardProfile: null, reason: `That card is not in the published eligible-card list for ${selected.offer.bank.en}.`, advisory: "Check the exact card name or confirm at VOX checkout.", context };
  }
  if (runnerUp?.cardMatch?.score >= 0.72 && selected.cardMatch.score - runnerUp.cardMatch.score < 0.04) {
    return {
      status: ELIGIBILITY.CARD_REQUIRED,
      eligible: false,
      offer: selected.offer,
      cardProfile: null,
      reason: "That bank and card description is ambiguous. Use the full issuing-bank and card names.",
      advisory: "Final eligibility is confirmed at VOX checkout.",
      context,
      missingFields: ["bank", "card"],
    };
  }
  return evaluateOfferEligibility(selected.offer, selected.cardMatch.profile, context);
}

export function searchOffers(query, offers = OFFERS) {
  const normalizedQuery = normalizeOfferText(query);
  if (!normalizedQuery) return [...offers];
  const ranked = offers
    .map((item) => {
      const bankScore = bestAlias(query, aliasesForOffer(item)).score;
      const cardScore = Math.max(...item.profiles.map((profile) => bestAlias(query, aliasesForProfile(profile)).score));
      const contentScore = Math.max(
        fuzzyScore(query, item.headline.en),
        fuzzyScore(query, item.headline.ar),
        fuzzyScore(query, item.summary.en),
        fuzzyScore(query, item.summary.ar),
      );
      const aliases = [
        ...aliasesForOffer(item),
        ...item.profiles.flatMap((profile) => aliasesForProfile(profile)),
      ];
      const containedAliasLength = aliases.reduce((maximum, alias) => {
        const normalizedAlias = normalizeOfferText(alias);
        const containsAlias = normalizedAlias
          && ` ${normalizedQuery} `.includes(` ${normalizedAlias} `);
        return containsAlias ? Math.max(maximum, normalizedAlias.length) : maximum;
      }, 0);
      return {
        item,
        bankScore,
        cardScore,
        contentScore,
        specificScore: Math.max(bankScore, cardScore),
        containedAliasLength,
        score: Math.max(bankScore, cardScore, contentScore),
      };
    })
    .filter(({ score }) => score >= 0.24)
    .sort((a, b) => b.score - a.score);

  const broadCardSearch = GENERIC_CARD_ONLY.test(normalizedQuery) || GENERIC_CARD_SEARCH.test(normalizedQuery);
  const longestContainedAlias = Math.max(0, ...ranked.map(({ containedAliasLength }) => containedAliasLength));
  if (longestContainedAlias && !broadCardSearch) {
    return ranked
      .filter(({ containedAliasLength }) => containedAliasLength === longestContainedAlias)
      .map(({ item }) => item);
  }

  const strongestSpecificScore = Math.max(0, ...ranked.map(({ specificScore }) => specificScore));
  if (!broadCardSearch && strongestSpecificScore >= 0.78) {
    const nearTopCutoff = Math.max(0.64, strongestSpecificScore - 0.04);
    return ranked
      .filter(({ specificScore }) => specificScore >= nearTopCutoff)
      .map(({ item }) => item);
  }

  return ranked.map(({ item }) => item);
}
