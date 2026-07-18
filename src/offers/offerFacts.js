import { COMMON_OFFER_TERMS, OFFER_META } from "./offersData.js";

const COPY = Object.freeze({
  en: {
    benefits: {
      bogo: "Buy one ticket, get one free",
      half_price: "50% off eligible tickets",
      thirty_percent: "30% off eligible tickets",
      mixed: "Benefit depends on the eligible Citi card",
      points_payment: "Pay with ADCB TouchPoints",
    },
    unlimited: "No monthly ticket limit is stated for this card tier.",
    unpublishedLimit: "No numeric monthly limit is published.",
    maxFree: (count) => `Up to ${count} free ticket${count === 1 ? "" : "s"} per month.`,
    maxDiscounted: (count) => `Up to ${count} discounted ticket${count === 1 ? "" : "s"} per month.`,
    sessionTickets: (count) => `Up to ${count} tickets in one booking.`,
    sessionFree: (count) => `Up to ${count} free tickets in one booking.`,
    login: "Sign in to a VOX account. Guest checkout is not eligible.",
    guestAllowed: "VOX members and guests can use this payment method.",
    online: "Use the VOX website or mobile app.",
    minimumTickets: (count) => `At least ${count} selected seats are required.`,
    minimumOrder: (amount) => `Minimum order value: AED ${amount}.`,
    minimumSpend: (amount) => `Minimum monthly retail spend on the eligible card: AED ${amount}.`,
    formats: (formats) => `Eligible formats: ${formats.join(", ")}.`,
    experienceFormats: (experience, formats) => `${experience} formats: ${formats.join(", ")}.`,
    allowedSeats: (seats) => `Eligible seat categories: ${seats.join(", ")}.`,
    excludedSeats: (seats) => `Excluded seat categories: ${seats.join(", ")}.`,
    excludedExperiences: (items) => `Excluded experiences: ${items.join(", ")}.`,
    onlyAt: (experiences, cinemas) => `${experiences.join(", ")} is available only at ${cinemas.join(", ")}.`,
    excludedAt: (experiences, cinemas, seats) => `${experiences.length ? experiences.join(", ") : "This offer"}${seats.length ? ` with ${seats.join(", ")} seats` : ""} is excluded at ${cinemas.join(", ")}.`,
    excludedExperienceSeats: (experience, seats) => `${experience} excludes ${seats.join(", ")} seats.`,
    unpublished: "VOX currently lists this promotion, but the official detail and terms pages do not publish the eligible cards or conditions. Eligibility must be checked at VOX checkout.",
    checkoutOnly: "Final card validation, remaining monthly allowance, and application of the offer happen at VOX checkout.",
    cards: "Eligible cards",
    experiences: "Eligible experiences",
    limits: "Limits and requirements",
    exclusions: "Important exclusions",
    redemption: "How to use it",
    terms: "Terms",
    moreCards: (count) => `and ${count} more`,
  },
  ar: {
    benefits: {
      bogo: "اشترِ تذكرة واحصل على الثانية مجاناً",
      half_price: "خصم 50٪ على التذاكر المؤهلة",
      thirty_percent: "خصم 30٪ على التذاكر المؤهلة",
      mixed: "تختلف الميزة حسب بطاقة Citi المؤهلة",
      points_payment: "الدفع باستخدام نقاط ADCB TouchPoints",
    },
    unlimited: "لم يتم ذكر حد شهري لعدد التذاكر لهذه الفئة.",
    unpublishedLimit: "لم يتم نشر حد شهري رقمي.",
    maxFree: (count) => `حتى ${count} تذاكر مجانية شهرياً.`,
    maxDiscounted: (count) => `حتى ${count} تذاكر مخفضة شهرياً.`,
    sessionTickets: (count) => `حتى ${count} تذاكر في الحجز الواحد.`,
    sessionFree: (count) => `حتى ${count} تذاكر مجانية في الحجز الواحد.`,
    login: "سجل الدخول إلى حساب VOX. لا يتأهل الحجز كضيف.",
    guestAllowed: "يمكن لأعضاء VOX والضيوف استخدام طريقة الدفع هذه.",
    online: "استخدم موقع VOX أو تطبيق الهاتف.",
    minimumTickets: (count) => `يلزم اختيار ${count} مقاعد على الأقل.`,
    minimumOrder: (amount) => `الحد الأدنى لقيمة الطلب: ${amount} درهماً.`,
    minimumSpend: (amount) => `الحد الأدنى للإنفاق الشهري بالبطاقة المؤهلة: ${amount} درهماً.`,
    formats: (formats) => `الصيغ المؤهلة: ${formats.join("، ")}.`,
    experienceFormats: (experience, formats) => `صيغ ${experience}: ${formats.join("، ")}.`,
    allowedSeats: (seats) => `فئات المقاعد المؤهلة: ${seats.join("، ")}.`,
    excludedSeats: (seats) => `فئات المقاعد المستثناة: ${seats.join("، ")}.`,
    excludedExperiences: (items) => `التجارب المستثناة: ${items.join("، ")}.`,
    onlyAt: (experiences, cinemas) => `تتوفر ${experiences.join("، ")} فقط في ${cinemas.join("، ")}.`,
    excludedAt: (experiences, cinemas, seats) => `${experiences.length ? experiences.join("، ") : "هذا العرض"}${seats.length ? ` مع مقاعد ${seats.join("، ")}` : ""} غير متاح في ${cinemas.join("، ")}.`,
    excludedExperienceSeats: (experience, seats) => `تستثني ${experience} مقاعد ${seats.join("، ")}.`,
    unpublished: "تعرض VOX هذا العرض حالياً، لكن صفحات التفاصيل والشروط الرسمية لا تنشر البطاقات المؤهلة أو الأحكام. يجب التحقق من الأهلية عند إتمام الحجز لدى VOX.",
    checkoutOnly: "يتم التحقق النهائي من البطاقة والحد الشهري المتبقي وتطبيق العرض عند إتمام الحجز لدى VOX.",
    cards: "البطاقات المؤهلة",
    experiences: "التجارب المؤهلة",
    limits: "الحدود والمتطلبات",
    exclusions: "الاستثناءات المهمة",
    redemption: "طريقة الاستخدام",
    terms: "الشروط",
    moreCards: (count) => `و${count} أخرى`,
  },
});

const EXPERIENCE_AR = Object.freeze({
  STANDARD: "العادية",
  PREMIER: "Premier",
  MAX: "MAX",
  IMAX: "IMAX",
  KIDS: "KIDS",
  GOLD: "GOLD",
  THEATRE: "THEATRE",
  "4DX": "4DX",
  OUTDOOR: "Outdoor",
  PREMIUM: "Premium",
  COUCH: "Couch",
  VIP: "VIP",
  ONYX: "ONYX",
  SNOW: "Snow Cinema",
});

const FOOD_BENEFIT_AR = Object.freeze({
  "emirates-nbd": "خصم 25٪ على صنف واحد من الكاندي بار بحد أدنى للإنفاق قدره 40 درهماً.",
  liv: "خصم 25٪ على صنف واحد من الكاندي بار بحد أدنى للإنفاق قدره 40 درهماً.",
  hsbc: "خصم 25٪ على صنف منفرد غير مشمول ضمن الوجبات المجمعة، بحد أدنى للإنفاق قدره 40 درهماً.",
  deem: "خصم 25٪ على صنف واحد من الكاندي بار بحد أدنى للإنفاق قدره 40 درهماً.",
  "standard-chartered": "خصم 25٪ على صنف منفرد غير مشمول ضمن الوجبات المجمعة، بحد أدنى للإنفاق قدره 40 درهماً.",
  "arab-bank-signature": "ترقية مجانية لحجم الفشار والمشروب الغازي.",
  adcb: "خصم 25٪ على صنف منفرد غير مشمول ضمن الوجبات المجمعة، مع ترقية مجانية لحجم الفشار والمشروب الغازي.",
  rakbank: "خصم 25٪ على صنف منفرد غير مشمول ضمن الوجبات المجمعة، بحد أدنى للإنفاق قدره 40 درهماً.",
  "arab-bank": "خصم 25٪ على صنف منفرد غير مشمول ضمن الوجبات المجمعة، بحد أدنى للإنفاق قدره 40 درهماً.",
  "emirates-islamic": "خصم 25٪ على صنف واحد من الكاندي بار بحد أدنى للإنفاق قدره 40 درهماً.",
  mashreq: "خصم 25٪ على صنف منفرد غير مشمول ضمن الوجبات المجمعة، بحد أدنى للإنفاق قدره 40 درهماً.",
});

const unique = (values) => [...new Set(values.filter(Boolean))];
const languageFor = (locale) => String(locale || "en").toLowerCase().startsWith("ar") ? "ar" : "en";

export function localizedOfferValue(value, locale = "en") {
  if (!value) return "";
  if (typeof value === "string") return value;
  const language = languageFor(locale);
  return value[language] || value.en || "";
}

export function localizedExperience(value, locale = "en") {
  const key = String(value || "").toUpperCase();
  return languageFor(locale) === "ar" ? EXPERIENCE_AR[key] || key : key;
}

export function benefitLabel(offer, profile = null, locale = "en") {
  const language = languageFor(locale);
  const code = profile?.benefit || offer?.benefit || "";
  return COPY[language].benefits[code] || localizedOfferValue(offer?.headline, language);
}

function limitFacts(offer, profile, locale) {
  const language = languageFor(locale);
  const copy = COPY[language];
  const limit = profile?.monthlyLimit || {};
  const output = [];
  if (limit.unlimited) output.push(copy.unlimited);
  else if (Number.isFinite(limit.maxFreeTickets)) output.push(copy.maxFree(limit.maxFreeTickets));
  else if (Number.isFinite(limit.maxTickets)) output.push(copy.maxDiscounted(limit.maxTickets));
  else if (limit.stated === false) output.push(copy.unpublishedLimit);
  if (limit.termsConflict) output.push(language === "ar" ? "توجد معلومات متعارضة عن الحد في الشروط المنشورة، لذلك يجب تأكيده عند إتمام الحجز." : limit.termsConflict);
  if (Number.isFinite(offer?.perSessionLimit?.maxTickets)) output.push(copy.sessionTickets(offer.perSessionLimit.maxTickets));
  if (Number.isFinite(offer?.perSessionLimit?.maxFreeTickets)) output.push(copy.sessionFree(offer.perSessionLimit.maxFreeTickets));
  return output;
}

function profileRestrictionFacts(profile, locale) {
  const language = languageFor(locale);
  const copy = COPY[language];
  const rules = profile?.eligibility || {};
  const output = [];
  if (rules.formats?.length) output.push(copy.formats(rules.formats));
  for (const [experience, formats] of Object.entries(rules.formatsByExperience || {})) {
    output.push(copy.experienceFormats(localizedExperience(experience, language), formats));
  }
  if (rules.allowedSeats?.length) output.push(copy.allowedSeats(rules.allowedSeats));
  if (rules.excludedSeats?.length) output.push(copy.excludedSeats(rules.excludedSeats));
  if (rules.excludedExperiences?.length) output.push(copy.excludedExperiences(rules.excludedExperiences.map((item) => localizedExperience(item, language))));
  for (const rule of rules.onlyAt || []) {
    output.push(copy.onlyAt((rule.experiences || []).map((item) => localizedExperience(item, language)), rule.cinemas || []));
  }
  for (const rule of rules.excludedAt || []) {
    output.push(copy.excludedAt((rule.experiences || []).map((item) => localizedExperience(item, language)), rule.cinemas || [], rule.seats || []));
  }
  for (const [experience, seats] of Object.entries(rules.excludedSeatsByExperience || {})) {
    output.push(copy.excludedExperienceSeats(localizedExperience(experience, language), seats));
  }
  for (const item of rules.checkoutConfirmation || []) {
    output.push(language === "ar" ? "يجب تأكيد هذه الحالة عند إتمام الحجز بسبب اختلاف المعلومات المنشورة." : item.message);
  }
  return unique(output);
}

function requirementFacts(offer, profile, locale) {
  const language = languageFor(locale);
  const copy = COPY[language];
  const output = [offer.memberRequired ? copy.login : copy.guestAllowed];
  if (offer.onlineOnly) output.push(copy.online);
  const minimumTickets = profile?.minTickets ?? offer.minTickets;
  if (Number.isFinite(minimumTickets)) output.push(copy.minimumTickets(minimumTickets));
  if (Number.isFinite(offer.minOrderTotal)) output.push(copy.minimumOrder(offer.minOrderTotal));
  for (const item of profile?.requirements || []) {
    if (item.type === "minimum_monthly_spend" && Number.isFinite(item.amount)) output.push(copy.minimumSpend(item.amount));
  }
  return output;
}

function cardNames(profile) {
  const groupName = profile?.name?.en || "";
  return unique((profile?.aliases || []).filter((item) => item && item !== groupName));
}

export function buildProfileFacts(offer, profile, locale = "en") {
  const language = languageFor(locale);
  return {
    id: profile.id,
    name: localizedOfferValue(profile.name, language),
    cards: cardNames(profile),
    benefit: benefitLabel(offer, profile, language),
    experiences: (profile.eligibility?.experiences || []).map((item) => localizedExperience(item, language)),
    limits: limitFacts(offer, profile, language),
    requirements: requirementFacts(offer, profile, language),
    restrictions: profileRestrictionFacts(profile, language),
    verificationOnly: Boolean(profile.verificationOnly),
  };
}

function redemptionSteps(offer, locale) {
  const language = languageFor(locale);
  if (offer.id === "adcb-touchpoints") {
    return language === "ar"
      ? [
        "اختر الفيلم وموعد العرض ثم المقاعد.",
        "تابع إلى صفحة الدفع وتجاوز قسم العروض.",
        "اختر ADCB TouchPoints كطريقة دفع وأدخل بيانات بطاقة ADCB في شاشة الدفع الآمنة.",
        "استخدم النقاط للدفع كلياً أو جزئياً، ثم ادفع الرصيد المتبقي ببطاقة ADCB عند الحاجة.",
      ]
      : [
        "Choose the movie, showtime, and seats.",
        "Continue to payment and skip the Offers section.",
        "Choose ADCB TouchPoints as the payment method and enter the ADCB card details only on the secure payment screen.",
        "Pay fully or partly with points, then use an ADCB card for any remaining balance.",
      ];
  }
  if (offer.detailsPublished === false) return [COPY[language].unpublished];
  return language === "ar"
    ? [
      "اختر الفيلم وموعد العرض.",
      "سجل الدخول إلى حساب VOX.",
      "اختر المقاعد. يساوي عدد التذاكر عدد المقاعد المختارة.",
      "في خطوة عروض التذاكر، اختر العرض وتحقق من البطاقة المؤهلة.",
      "أكد العرض وادفع بالبطاقة المؤهلة نفسها على شاشة الدفع الآمنة.",
    ]
    : [
      "Choose the movie and showtime.",
      "Sign in to a VOX account.",
      "Select seats. The ticket count equals the number of selected seats.",
      "At the ticket-offers step, choose the offer and verify the eligible card.",
      "Confirm the offer and pay with the same eligible card on the secure payment screen.",
    ];
}

export function buildOfferFacts(offer, locale = "en") {
  if (!offer) return null;
  const language = languageFor(locale);
  const profiles = offer.profiles.map((profile) => buildProfileFacts(offer, profile, language));
  const foodBenefit = offer.foodBenefit
    ? language === "ar" ? FOOD_BENEFIT_AR[offer.id] || localizedOfferValue(offer.foodBenefit, language) : localizedOfferValue(offer.foodBenefit, language)
    : "";
  return {
    id: offer.id,
    bank: localizedOfferValue(offer.bank, language),
    headline: localizedOfferValue(offer.headline, language),
    summary: localizedOfferValue(offer.summary, language),
    benefit: benefitLabel(offer, null, language),
    promotionCount: offer.promotionCount || 1,
    profiles,
    cards: unique(profiles.flatMap((profile) => profile.cards)),
    experiences: unique(profiles.flatMap((profile) => profile.experiences)),
    limits: unique(profiles.flatMap((profile) => profile.limits)),
    requirements: unique(profiles.flatMap((profile) => profile.requirements)),
    restrictions: unique([
      ...profiles.flatMap((profile) => profile.restrictions),
      localizedOfferValue(offer.notes, language),
    ]),
    foodBenefit,
    redemptionSteps: redemptionSteps(offer, language),
    commonTerms: COMMON_OFFER_TERMS[language],
    checkoutBoundary: COPY[language].checkoutOnly,
    detailsPublished: offer.detailsPublished !== false,
    detailUrl: offer.detailUrl,
    termsUrl: offer.termsUrl,
    sourceUrl: offer.sourceUrl || OFFER_META.sourceUrl,
    verifiedDate: offer.verifiedDate,
  };
}

function compactList(values, copy, maximum = 6) {
  const shown = values.slice(0, maximum);
  const remaining = values.length - shown.length;
  return `${shown.join(", ")}${remaining > 0 ? `, ${copy.moreCards(remaining)}` : ""}`;
}

export function answerForOfferTopic(offer, profile = null, locale = "en", detailTopic = "summary") {
  const language = languageFor(locale);
  const copy = COPY[language];
  const facts = buildOfferFacts(offer, language);
  if (!facts) return language === "ar" ? "لم يتم العثور على عرض مطابق." : "No matching offer was found.";
  const profileFacts = profile ? buildProfileFacts(offer, profile, language) : null;
  const topic = String(detailTopic || "summary").toLowerCase();
  if (!facts.detailsPublished) return `${facts.bank}: ${copy.unpublished}`;
  if (topic === "cards") {
    const cards = profileFacts?.cards?.length ? profileFacts.cards : facts.cards;
    return `${copy.cards}: ${cards.length ? compactList(cards, copy) : language === "ar" ? "يجب التحقق من البطاقة عند إتمام الحجز." : "Card verification is required at checkout."}`;
  }
  if (topic === "experiences") {
    const experiences = profileFacts?.experiences?.length ? profileFacts.experiences : facts.experiences;
    return `${copy.experiences}: ${experiences.join(language === "ar" ? "، " : ", ") || (language === "ar" ? "يتم تأكيدها عند إتمام الحجز." : "Confirm at checkout.")}`;
  }
  if (topic === "limits") {
    const limits = profileFacts?.limits?.length ? profileFacts.limits : facts.limits;
    return `${copy.limits}: ${limits.join(" ") || facts.checkoutBoundary}`;
  }
  if (topic === "redemption") return `${copy.redemption}: ${facts.redemptionSteps.join(" ")}`;
  if (topic === "exclusions") {
    const restrictions = profileFacts?.restrictions?.length ? profileFacts.restrictions : facts.restrictions;
    return `${copy.exclusions}: ${restrictions.join(" ") || facts.checkoutBoundary}`;
  }
  if (topic === "terms") return `${copy.terms}: ${facts.commonTerms.join(" ")} ${facts.checkoutBoundary}`;
  return `${facts.bank}: ${profileFacts?.benefit || facts.headline}. ${facts.summary}`;
}

export const OFFER_FACT_COPY = COPY;
