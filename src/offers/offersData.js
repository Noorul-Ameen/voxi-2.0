// Static, display-only bank-offer knowledge for VOX Cinemas UAE.
// This module deliberately contains no redemption or payment logic.

export const OFFER_META = Object.freeze({
  source: "VOX Cinemas UAE bank deals",
  sourceUrl: "https://uae.voxcinemas.com/offers/bank-deals",
  capturedDate: "2026-07-17",
  verifiedDate: "2026-07-17",
  promotionCount: 21,
  issuerCount: 20,
  disclaimer: {
    en: "Offer information is for guidance only. Final eligibility is verified at VOX checkout and remains subject to the bank’s current terms.",
    ar: "معلومات العروض إرشادية. يتم التحقق من الأهلية النهائية عند إتمام الحجز لدى ڤوكس، وتظل خاضعة لشروط البنك الحالية.",
  },
});

export const COMMON_OFFER_TERMS = Object.freeze({
  en: [
    "Bank offers require a logged-in VOX member and an online or app booking.",
    "Verify the eligible card at the ticket-offers step and pay with the same card.",
    "Only one promotion applies per ticket; offer tickets are non-refundable, non-exchangeable and non-transferable.",
    "Age ratings and seat availability still apply.",
  ],
  ar: [
    "تتطلب عروض البنوك عضوية ڤوكس مسجلة وحجزاً عبر الموقع أو التطبيق.",
    "يجب التحقق من البطاقة المؤهلة عند خطوة عروض التذاكر والدفع بالبطاقة نفسها.",
    "يسري عرض واحد فقط لكل تذكرة، وتذاكر العروض غير قابلة للاسترداد أو الاستبدال أو التحويل.",
    "تظل قيود التصنيف العمري وتوفر المقاعد سارية.",
  ],
});

const ALL = ["STANDARD", "PREMIER", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE", "4DX", "OUTDOOR", "PREMIUM", "COUCH", "VIP", "ONYX", "SNOW"];
const CORE = ["STANDARD", "PREMIER", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE", "4DX"];
const MOE_THEATRE_EXCLUSION = [{ cinemas: ["mall of the emirates", "moe"], experiences: ["THEATRE"] }];

const OFFICIAL_OFFER_SLUGS = Object.freeze({
  "fab-share": "fab-buy-one-ticket-get-one-free",
  mawarid: "mawarid-50-off",
  nbf: "nbf-buy-one-get-one-free",
  "emirates-nbd": "enbd-offer-buy-one-ticket-get-one-free",
  liv: "liv-bank-buy-one-get-one-free",
  "sharjah-islamic-bank": "sharjah-islamic-bank-50-off",
  aafaq: "aafaq-buy-one-get-one",
  hsbc: "hsbc-buy-one-ticket-get-one-free",
  deem: "deem-buy-one-get-one-free",
  citibank: "citibank-buy-one-ticket-get-one-free",
  "standard-chartered": "standard-chartered-buy-one-ticket-get-one-free",
  "arab-bank-signature": "arab-bank-signature-bogof",
  cbd: "cbd-credit-card-50-off",
  adcb: "adcb-buy-one-ticket-get-one-free",
  rakbank: "rakbank-50-off",
  uab: "uab-buy-one-get-one-free",
  "arab-bank": "arab-bank-buy-one-get-one-free",
  "emirates-islamic": "emirates-islamic-bogof",
  mashreq: "mashreq-credit-cards-50-off",
  "adcb-touchpoints": "pay-with-touchpoints-and-experience-the-best-at-vox-cinemas",
});

const text = (en, ar) => ({ en, ar });
const eligibility = (experiences, extra = {}) => ({ experiences, ...extra });
const card = (id, name, aliases, rules, limit = null, extra = {}) => ({
  id,
  name: text(name, extra.nameAr || name),
  aliases,
  eligibility: rules,
  monthlyLimit: limit,
  ...extra,
});
const offer = (id, bank, bankAr, aliases, benefit, headline, headlineAr, summary, summaryAr, profiles, extra = {}) => {
  const officialSlug = OFFICIAL_OFFER_SLUGS[id];
  const detailUrl = officialSlug ? `${OFFER_META.sourceUrl}/${officialSlug}` : OFFER_META.sourceUrl;
  return {
    id,
    bank: text(bank, bankAr),
    aliases,
    benefit,
    headline: text(headline, headlineAr),
    summary: text(summary, summaryAr),
    profiles,
    memberRequired: true,
    onlineOnly: true,
    sourceUrl: OFFER_META.sourceUrl,
    detailUrl,
    termsUrl: `${detailUrl}/terms-conditions`,
    promotionCount: id === "citibank" ? 2 : 1,
    capturedDate: OFFER_META.capturedDate,
    verifiedDate: OFFER_META.verifiedDate,
    ...extra,
  };
};

export const OFFERS = Object.freeze([
  offer(
    "fab-share",
    "First Abu Dhabi Bank",
    "بنك أبوظبي الأول",
    ["FAB", "First Abu Dhabi Bank", "FAB SHARE"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "For the FAB SHARE Credit Card and Regular 2D tickets at all UAE VOX locations.",
    "لبطاقة FAB SHARE الائتمانية وتذاكر 2D العادية في جميع مواقع ڤوكس بالإمارات.",
    [card("fab-share-credit", "FAB SHARE Credit Card", ["FAB SHARE card", "SHARE Credit Card", "FAB SHARE Credit"], eligibility(["STANDARD"], { formats: ["2D"] }), { stated: false })],
  ),

  offer(
    "mawarid",
    "Mawarid Finance",
    "موارد للتمويل",
    ["Mawarid", "Mawarid Finance"],
    "half_price",
    "50% off every ticket",
    "خصم 50٪ على كل تذكرة",
    "Eligible Mawarid Mastercard tiers cover Standard, MAX, IMAX, KIDS, GOLD and most THEATRE sessions.",
    "تشمل بطاقات ماستركارد المؤهلة تجارب Standard وMAX وIMAX وKIDS وGOLD ومعظم عروض THEATRE.",
    [
      card("mawarid-world-elite", "World Elite Mastercard", ["Mawarid World Elite", "World Elite Mastercard"], eligibility(["STANDARD", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 10 }),
      card("mawarid-world", "World Mastercard", ["Mawarid World", "World Mastercard"], eligibility(["STANDARD", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 8 }),
      card("mawarid-platinum", "Platinum Mastercard", ["Mawarid Platinum", "Platinum Mastercard"], eligibility(["STANDARD", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 5 }),
      card("mawarid-titanium", "Titanium Mastercard", ["Mawarid Titanium", "Titanium Mastercard"], eligibility(["STANDARD", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 3 }),
    ],
  ),

  offer(
    "nbf",
    "National Bank of Fujairah",
    "بنك الفجيرة الوطني",
    ["NBF", "National Bank of Fujairah", "Fujairah bank"],
    "bogo",
    "Buy one, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "All NBF Visa Conventional credit cards; minimum AED 2,000 monthly retail spend applies.",
    "لجميع بطاقات NBF Visa Conventional الائتمانية، مع إنفاق شهري أدنى 2,000 درهم.",
    [card("nbf-visa-conventional", "NBF Visa Conventional credit card", ["NBF Visa", "Visa Conventional", "NBF conventional credit"], eligibility(["STANDARD", "KIDS", "PREMIER", "MAX", "IMAX"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 4 }, { requirements: [{ type: "minimum_monthly_spend", amount: 2000, currency: "AED" }] })],
    { minTickets: 2 },
  ),

  offer(
    "emirates-nbd",
    "Emirates NBD",
    "بنك الإمارات دبي الوطني",
    ["ENBD", "Emirates NBD", "NBD", "INBD"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Eligible credit and debit cards cover Standard, KIDS, Premier at MOE and, on selected tiers, Preferred View and 4DX.",
    "تشمل البطاقات المؤهلة Standard وKIDS وPremier في مول الإمارات، وتشمل بعض الفئات Preferred View و4DX.",
    [
      card("enbd-full-tier", "Full-eligibility cards", ["Priority Banking Visa Infinite", "Skywards Infinite", "Skywards Signature", "Etihad Limitless", "Etihad Elevate", "Etihad Inspire", "Darna Visa Infinite Privilege", "Darna Visa Infinite", "Darna Visa Signature", "Marriott Bonvoy World Elite", "Marriott Bonvoy World", "Visa Infinite", "dnata World", "Emirati Visa Signature Debit", "Share Visa Private", "Share Visa Infinite", "Share Visa Signature"], eligibility(["STANDARD", "KIDS", "PREMIER", "4DX"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 3 }),
      card("enbd-partial-tier", "Standard-tier cards", ["Lulu Platinum", "Dana Select Visa", "Go4it Platinum", "noon One Visa"], eligibility(["STANDARD", "KIDS", "PREMIER"], { excludedSeats: ["PREFERRED"], onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 3 }),
      card("enbd-share-platinum", "Share Visa Platinum", ["Share Visa Platinum", "ENBD Share Platinum"], eligibility(["STANDARD", "KIDS", "PREMIER"], { excludedSeats: ["PREFERRED"], onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 2 }),
    ],
    { minTickets: 2, foodBenefit: "25% off single Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "liv",
    "Liv Bank",
    "بنك Liv",
    ["Liv", "Liv Bank", "Liv by Emirates NBD"],
    "bogo",
    "Buy one, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Cashback Plus includes Preferred View and 4DX; Cashback covers Standard, KIDS and Premier at MOE.",
    "تشمل Cashback Plus مقاعد Preferred View و4DX، بينما تشمل Cashback تجارب Standard وKIDS وPremier في مول الإمارات.",
    [
      card("liv-cashback-plus", "Cashback Plus", ["Liv Cashback Plus", "Cashback Plus"], eligibility(["STANDARD", "KIDS", "PREMIER", "4DX"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { stated: false }),
      card("liv-cashback", "Cashback", ["Liv Cashback", "Cashback card"], eligibility(["STANDARD", "KIDS", "PREMIER"], { excludedSeats: ["PREFERRED"], onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { stated: false }),
    ],
    { minTickets: 2, foodBenefit: "25% off single Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "sharjah-islamic-bank",
    "Sharjah Islamic Bank",
    "مصرف الشارقة الإسلامي",
    ["SIB", "Sharjah Islamic Bank", "SIB card"],
    "half_price",
    "50% off movie tickets",
    "خصم 50٪ على تذاكر السينما",
    "VOX currently lists this 50% offer, but its official detail and terms pages do not yet publish eligible card names or conditions.",
    "تعرض VOX حالياً هذا العرض بخصم 50٪، لكن صفحة التفاصيل والشروط الرسمية لا تنشر بعد أسماء البطاقات المؤهلة أو الأحكام.",
    [card(
      "sib-checkout-verification",
      "Eligibility details not yet published",
      ["SIB eligible card", "Sharjah Islamic Bank eligible card"],
      eligibility([]),
      { stated: false },
      { noCardRequired: true, verificationOnly: true },
    )],
    {
      mediaCode: "SIB50",
      detailsPublished: false,
      notes: text(
        "Check the current VOX ticket-offers step or contact Sharjah Islamic Bank before relying on this listing. Voxi will not guess card eligibility.",
        "تحقق من خطوة عروض التذاكر الحالية لدى VOX أو تواصل مع مصرف الشارقة الإسلامي قبل الاعتماد على هذا الإعلان. لن يخمن Voxi أهلية البطاقة.",
      ),
    },
  ),

  offer(
    "aafaq",
    "Aafaq Finance",
    "آفاق للتمويل الإسلامي",
    ["Aafaq", "Aafaq Islamic Finance"],
    "bogo",
    "Buy one, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Platinum covers core Standard, Premier, MAX and IMAX 2D categories; World Elite also covers GOLD, THEATRE and IMAX 3D.",
    "تشمل Platinum الفئات الأساسية، بينما تشمل World Elite أيضاً GOLD وTHEATRE وIMAX 3D.",
    [
      card("aafaq-platinum", "Platinum Credit Card", ["Aafaq Platinum", "Platinum Credit Card"], eligibility(["STANDARD", "PREMIER", "MAX", "IMAX", "KIDS"], { excludedAt: [{ cinemas: ["mall of the emirates", "moe"], experiences: ["IMAX"] }], formatsByExperience: { IMAX: ["2D"], KIDS: ["3D"] } }), { maxTickets: 4 }),
      card("aafaq-world-elite", "World Elite Credit Card", ["Aafaq World Elite", "World Elite Credit Card"], eligibility(["STANDARD", "PREMIER", "MAX", "IMAX", "KIDS", "GOLD", "THEATRE"], { excludedAt: [...MOE_THEATRE_EXCLUSION, { cinemas: ["mall of the emirates", "moe"], experiences: ["IMAX"] }] }), { unlimited: true }),
    ],
    { minTickets: 2, notes: text("THEATRE packages that include F&B are excluded.", "لا تشمل باقات THEATRE التي تتضمن المأكولات والمشروبات.") },
  ),

  offer(
    "hsbc",
    "HSBC",
    "إتش إس بي سي",
    ["HSBC", "HSBC Bank Middle East"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Eligibility expands from Standard, Premier and MAX on entry cards to GOLD and THEATRE on higher tiers.",
    "تتوسع الأهلية من Standard وPremier وMAX في البطاقات الأساسية إلى GOLD وTHEATRE في الفئات الأعلى.",
    [
      card("hsbc-entry", "Entry-tier cards", ["HSBC Live Plus", "Live+", "HSBC Platinum", "Platinum Select", "MAX Rewards", "HSBC Advance", "Emirates Skywards Signature"], eligibility(["STANDARD", "PREMIER", "MAX"], { formatsByExperience: { PREMIER: ["2D", "3D"], MAX: ["2D"] } }), { maxFreeTickets: 2 }),
      card("hsbc-premium", "Premium-tier cards", ["HSBC Cashback Plus", "Cashback+", "HSBC Premier"], eligibility(["STANDARD", "PREMIER", "MAX", "KIDS", "GOLD"]), { maxFreeTickets: 4 }),
      card("hsbc-top", "Top-tier cards", ["HSBC Emirates Skywards Infinite", "HSBC Black", "Skywards Infinite", "Black card"], eligibility(["STANDARD", "PREMIER", "MAX", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxFreeTickets: 4 }),
    ],
    { minTickets: 2, foodBenefit: "25% off single, non-combo Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "deem",
    "DEEM Finance",
    "ديم للتمويل",
    ["DEEM", "Deem Finance"],
    "bogo",
    "Buy one, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Titanium and Platinum cover Standard 2D; World covers IMAX 2D and 3D.",
    "تشمل Titanium وPlatinum تذاكر Standard 2D، بينما تشمل World تذاكر IMAX 2D و3D.",
    [
      card("deem-titanium", "Titanium credit card", ["DEEM Titanium", "Titanium credit card"], eligibility(["STANDARD"], { formats: ["2D"] }), { maxTickets: 2 }),
      card("deem-platinum", "Platinum credit card", ["DEEM Platinum", "Platinum credit card"], eligibility(["STANDARD"], { formats: ["2D"] }), { maxTickets: 3 }),
      card("deem-world", "World credit card", ["DEEM World", "World credit card"], eligibility(["IMAX"], { formats: ["2D", "3D"] }), { maxTickets: 4 }),
    ],
    { minTickets: 2, foodBenefit: "25% off single Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "citibank",
    "Citibank",
    "سيتي بنك",
    ["Citi", "Citibank", "Citi Bank"],
    "mixed",
    "Buy one get one free, or 30% off",
    "اشترِ تذكرة واحصل على الثانية مجاناً أو خصم 30٪",
    "The benefit depends on the card. Eligible categories include Standard, MAX, KIDS and Premier at MOE.",
    "تختلف الميزة حسب البطاقة وتشمل الفئات المؤهلة Standard وMAX وKIDS وPremier في مول الإمارات.",
    [
      card("citi-bogo-four", "Prestige, Life World Elite or Ultima", ["Citi Prestige", "Citi Life World Elite", "Citi Ultima"], eligibility(["STANDARD", "MAX", "KIDS", "PREMIER"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }], excludedAt: [{ cinemas: ["city centre deira"], experiences: ["MAX"], seats: ["BALCONY"] }] }), { maxFreeTickets: 4 }, { benefit: "bogo", minTickets: 2 }),
      card("citi-bogo-two", "Life Infinite", ["Citi Life Infinite", "Life Infinite"], eligibility(["STANDARD", "MAX", "KIDS", "PREMIER"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }], excludedAt: [{ cinemas: ["city centre deira"], experiences: ["MAX"], seats: ["BALCONY"] }] }), { maxFreeTickets: 2 }, { benefit: "bogo", minTickets: 2 }),
      card("citi-30-four", "Premier", ["Citi Premier", "Premier card"], eligibility(["STANDARD", "MAX", "KIDS", "PREMIER"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }], excludedAt: [{ cinemas: ["city centre deira"], experiences: ["MAX"], seats: ["BALCONY"] }] }), { maxTickets: 4 }, { benefit: "thirty_percent" }),
      card("citi-30-two", "Life Platinum or Rewards", ["Citi Life Platinum", "Citi Rewards", "Life Platinum", "Rewards card"], eligibility(["STANDARD", "MAX", "KIDS", "PREMIER"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }], excludedAt: [{ cinemas: ["city centre deira"], experiences: ["MAX"], seats: ["BALCONY"] }] }), { maxTickets: 2 }, { benefit: "thirty_percent" }),
    ],
    {
      mediaCode: "citi30",
      notes: text("Primary cardholders only; excludes IMAX, GOLD, THEATRE, 4DX, VIP, ONYX, Snow Cinema and Kempinski VOX.", "لحامل البطاقة الأساسية فقط؛ لا يشمل IMAX وGOLD وTHEATRE و4DX وVIP وONYX وSnow Cinema وڤوكس كمبينسكي."),
      campaigns: [
        {
          id: "citi-bogo",
          benefit: "bogo",
          headline: text("Buy one ticket, get one free", "اشترِ تذكرة واحصل على الثانية مجاناً"),
          profileIds: ["citi-bogo-four", "citi-bogo-two"],
          mediaCode: "CITI",
          detailsPublished: false,
          detailUrl: "https://uae.voxcinemas.com/offers/bank-deals/citibank-buy-one-ticket-get-one-free",
          termsUrl: "https://uae.voxcinemas.com/offers/bank-deals/citibank-buy-one-ticket-get-one-free/terms-conditions",
        },
        {
          id: "citi-30",
          benefit: "thirty_percent",
          headline: text("30% off movie tickets", "خصم 30٪ على تذاكر السينما"),
          profileIds: ["citi-30-four", "citi-30-two"],
          mediaCode: "citi30",
          detailsPublished: true,
          validUntil: "2027-04-30",
          detailUrl: "https://uae.voxcinemas.com/offers/bank-deals/citi-bank-30-off",
          termsUrl: "https://uae.voxcinemas.com/offers/bank-deals/citi-bank-30-off/terms-conditions",
        },
      ],
    },
  ),

  offer(
    "standard-chartered",
    "Standard Chartered",
    "ستاندرد تشارترد",
    ["Standard Chartered", "StanChart", "SCB"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "For Manhattan Platinum, Visa Infinite and Shukran World cards on Regular, Premium View and MAX categories.",
    "لبطاقات Manhattan Platinum وVisa Infinite وShukran World ضمن فئات Regular وPremium View وMAX.",
    [card("sc-eligible", "Eligible credit cards", ["Manhattan Platinum", "Standard Chartered Visa Infinite", "Shukran World"], eligibility(["STANDARD", "PREMIUM", "MAX"], { excludedAt: [{ cinemas: ["city centre deira"], experiences: ["MAX"] }] }), { maxTickets: 8, maxFreeTickets: 4 })],
    { minTickets: 2, perSessionLimit: { maxTickets: 6, maxFreeTickets: 3 }, foodBenefit: "25% off single, non-combo Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "arab-bank-signature",
    "Arab Bank Signature",
    "البنك العربي Signature",
    ["Arab Bank Signature", "Arab Bank VIP"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "UAE-issued Signature, Platinum, Gold, Classic and Mastercard Titanium cards cover most experiences.",
    "تشمل بطاقات Signature وPlatinum وGold وClassic وMastercard Titanium الصادرة في الإمارات معظم التجارب.",
    [card("arab-signature-cards", "Eligible UAE-issued cards", ["Arab Bank Visa Signature", "Arab Bank Visa Platinum", "Arab Bank Visa Gold", "Arab Bank Visa Classic", "Arab Bank Mastercard Titanium"], eligibility(CORE, { excludedExperiences: ["4DX", "OUTDOOR"], excludedAt: MOE_THEATRE_EXCLUSION, excludedSeatsByExperience: { IMAX: ["BALCONY"] } }), { stated: false })],
    { minTickets: 2, foodBenefit: "Free size upgrade on popcorn and a soft drink", mediaCode: "ARABBIN7" },
  ),

  offer(
    "cbd",
    "Commercial Bank of Dubai",
    "بنك دبي التجاري",
    ["CBD", "Commercial Bank of Dubai"],
    "half_price",
    "50% off tickets",
    "خصم 50٪ على التذاكر",
    "Private Visa Infinite adds GOLD and THEATRE; other Infinite cards cover Standard, Premier, KIDS, MAX, IMAX, Premium, Couch and 4DX.",
    "تضيف Private Visa Infinite تجربتي GOLD وTHEATRE، وتشمل بطاقات Infinite الأخرى الفئات الأساسية و4DX.",
    [
      card("cbd-private-infinite", "Private Visa Infinite", ["CBD Private Visa Infinite", "Private Visa Infinite"], eligibility(["STANDARD", "PREMIER", "KIDS", "MAX", "IMAX", "PREMIUM", "COUCH", "4DX", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION, excludedSeatsByExperience: { IMAX: ["SAPPHIRE"] }, checkoutConfirmation: [{ experiences: ["4DX"], message: "CBD's eligibility table and written 4DX terms conflict; confirm at checkout." }] }), { maxTickets: 6, termsConflict: "The eligibility table states six tickets, while written terms state four; confirm the exact limit with CBD." }),
      card("cbd-infinite", "Visa Infinite cards", ["CBD Visa Infinite Metal", "CBD Islamic Visa Infinite", "Visa Infinite Covered", "Visa Infinite Conventional"], eligibility(["STANDARD", "PREMIER", "KIDS", "MAX", "IMAX", "PREMIUM", "COUCH", "4DX"], { excludedSeatsByExperience: { IMAX: ["SAPPHIRE"] }, checkoutConfirmation: [{ experiences: ["4DX"], message: "CBD's eligibility table and written 4DX terms conflict; confirm at checkout." }] }), { maxTickets: 6, termsConflict: "The eligibility table states six tickets, while written terms state four; confirm the exact limit with CBD." }),
    ],
  ),

  offer(
    "adcb",
    "Abu Dhabi Commercial Bank",
    "بنك أبوظبي التجاري",
    ["ADCB", "Abu Dhabi Commercial Bank"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Top tiers and Betaqti cover Standard, MAX, KIDS, IMAX Laser at MOE, GOLD and THEATRE; lower tiers cover fewer categories.",
    "تشمل الفئات العليا وBetaqti تجارب Standard وMAX وKIDS وIMAX Laser في مول الإمارات وGOLD وTHEATRE.",
    [
      card("adcb-top", "Top-tier or Betaqti cards", ["TouchPoints Visa Infinite", "Islamic TouchPoints Infinite Covered", "ADCB Betaqti", "Betaqti Credit Card"], eligibility(["STANDARD", "MAX", "KIDS", "IMAX", "THEATRE", "GOLD"], { excludedAt: [...MOE_THEATRE_EXCLUSION, { cinemas: ["city centre deira"], experiences: ["MAX"], seats: ["BALCONY"] }], onlyAt: [{ experiences: ["IMAX"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 4 }),
      card("adcb-mid", "Mid-tier cards", ["TouchPoints Platinum", "Islamic TouchPoints Platinum", "365 Cashback", "Islamic 365 Cashback Covered"], eligibility(["STANDARD", "MAX", "IMAX"], { onlyAt: [{ experiences: ["IMAX"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 4 }),
      card("adcb-entry", "Entry-tier cards", ["TouchPoints Gold", "ADCB Titanium", "ADCB Classic", "ADCB Regular", "Islamic TouchPoints Gold"], eligibility(["STANDARD", "MAX"], { formats: ["2D"], allowedSeats: ["REGULAR"] }), { maxFreeTickets: 2 }),
    ],
    { minTickets: 2, foodBenefit: "25% off single, non-combo Candy Bar items plus a free popcorn and soft-drink size upgrade" },
  ),

  offer(
    "rakbank",
    "RAKBANK",
    "بنك رأس الخيمة الوطني",
    ["RAKBANK", "RAK Bank", "National Bank of Ras Al Khaimah"],
    "half_price",
    "50% off movie tickets",
    "خصم 50٪ على تذاكر السينما",
    "Eligible cards cover Standard, Premier, MAX, IMAX, KIDS and THEATRE outside Mall of the Emirates.",
    "تشمل البطاقات المؤهلة Standard وPremier وMAX وIMAX وKIDS وTHEATRE خارج مول الإمارات.",
    [
      card("rakbank-four", "Four-ticket cards", ["RAKBANK World", "World Credit Card Islamic", "Emirati Watani Islamic", "RAKBANK Elevate"], eligibility(["STANDARD", "PREMIER", "MAX", "IMAX", "THEATRE", "KIDS"], { excludedAt: MOE_THEATRE_EXCLUSION, excludedSeatsByExperience: { IMAX: ["SAPPHIRE"] } }), { maxTickets: 4 }),
      card("rakbank-air-arabia", "Air Arabia Platinum", ["RAKBANK Air Arabia Platinum", "Air Arabia Platinum"], eligibility(["STANDARD", "PREMIER", "MAX", "IMAX", "THEATRE", "KIDS"], { excludedAt: MOE_THEATRE_EXCLUSION, excludedSeatsByExperience: { IMAX: ["SAPPHIRE"] } }), { maxTickets: 2 }),
    ],
    { foodBenefit: "25% off single, non-combo Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "uab",
    "United Arab Bank",
    "البنك العربي المتحد",
    ["UAB", "United Arab Bank"],
    "bogo",
    "Buy one ticket, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Eligible Mastercard credit and debit cards cover Standard, Premier at MOE, KIDS, MAX, IMAX and GOLD.",
    "تشمل بطاقات ماستركارد المؤهلة Standard وPremier في مول الإمارات وKIDS وMAX وIMAX وGOLD.",
    [card("uab-cards", "Eligible Mastercard cards", ["UAB World Elite", "UAB Titanium", "UAB World", "UAB Platinum", "UAB Islamic Titanium", "UAB SME Platinum", "UAB World Islamic"], eligibility(["STANDARD", "PREMIER", "KIDS", "MAX", "IMAX", "GOLD"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 3 })],
    { minTickets: 2 },
  ),

  offer(
    "arab-bank",
    "Arab Bank",
    "البنك العربي",
    ["Arab Bank standard", "Arab Bank"],
    "bogo",
    "Buy one, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Standard eligible cards cover all experiences except THEATRE and Balcony; Signature VIP and MCWE cover all experiences outside THEATRE at MOE.",
    "تشمل البطاقات القياسية جميع التجارب باستثناء THEATRE وBalcony؛ وتشمل Signature VIP وMCWE جميع التجارب خارج THEATRE في مول الإمارات.",
    [
      card("arab-standard", "Standard eligible cards", ["Arab Bank Classic", "Arab Bank Gold", "Arab Bank Platinum", "Arab Bank Signature", "Arab Bank ISC", "Arab Bank Mastercard Titanium", "Visa Travel Mate", "Arabi Junior"], eligibility(ALL, { excludedExperiences: ["THEATRE"], excludedSeats: ["BALCONY"] }), { maxTickets: 4 }),
      card("arab-premium", "Signature VIP or MCWE", ["Arab Bank Signature VIP", "Arab Bank MCWE", "Signature VIP", "MCWE"], eligibility(ALL, { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 4 }),
    ],
    { minTickets: 2, perSessionLimit: { maxTickets: 4 }, foodBenefit: "25% off single, non-combo Candy Bar items with AED 40 minimum spend", mediaCode: "ARAB" },
  ),

  offer(
    "emirates-islamic",
    "Emirates Islamic",
    "الإمارات الإسلامي",
    ["Emirates Islamic", "EIB", "Emirates Islamic Bank", "Islamic bank"],
    "bogo",
    "Buy one, get one free",
    "اشترِ تذكرة واحصل على الثانية مجاناً",
    "Switch Cashback and Skywards Black cover Standard, KIDS and Premier at Mall of the Emirates.",
    "تشمل Switch Cashback وSkywards Black تجارب Standard وKIDS وPremier في مول الإمارات.",
    [
      card("eib-switch", "Switch Cashback Credit Card", ["EIB Switch Cashback", "Switch Cashback"], eligibility(["STANDARD", "KIDS", "PREMIER"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 2 }),
      card("eib-black", "Skywards Black Credit Card", ["EIB Skywards Black", "Emirates Islamic Skywards Black"], eligibility(["STANDARD", "KIDS", "PREMIER"], { onlyAt: [{ experiences: ["PREMIER"], cinemas: ["mall of the emirates", "moe"] }] }), { maxFreeTickets: 4 }),
    ],
    { minTickets: 2, foodBenefit: "25% off single Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "mashreq",
    "Mashreq",
    "بنك المشرق",
    ["Mashreq", "Mashreq Bank", "Mashreq Al Islami"],
    "half_price",
    "50% off movie tickets",
    "خصم 50٪ على تذاكر السينما",
    "Solitaire tiers cover Standard, MAX, IMAX, Outdoor, KIDS, GOLD and THEATRE; Platinum tiers exclude IMAX, GOLD and THEATRE.",
    "تشمل فئات Solitaire معظم التجارب، بينما لا تشمل فئات Platinum تجارب IMAX وGOLD وTHEATRE.",
    [
      card("mashreq-top-ten", "Top-tier ten-ticket cards", ["Mashreq Al Islami Solitaire", "Mashreq Solitaire Elite", "Solitaire Credit Card", "Al Islami Platinum Elite"], eligibility(["STANDARD", "MAX", "IMAX", "OUTDOOR", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 10 }),
      card("mashreq-solitaire-eight", "Mashreq Solitaire Credit Card", ["Mashreq Solitaire Credit", "Solitaire eight"], eligibility(["STANDARD", "MAX", "IMAX", "OUTDOOR", "KIDS", "GOLD", "THEATRE"], { excludedAt: MOE_THEATRE_EXCLUSION }), { maxTickets: 8 }),
      card("mashreq-platinum", "Platinum-tier cards", ["Mashreq Al Islami Platinum", "Mashreq Platinum Elite"], eligibility(["STANDARD", "MAX", "OUTDOOR", "KIDS"]), { maxTickets: 4 }),
    ],
    { foodBenefit: "25% off single, non-combo Candy Bar items with AED 40 minimum spend" },
  ),

  offer(
    "adcb-touchpoints",
    "ADCB TouchPoints",
    "نقاط TouchPoints من بنك أبوظبي التجاري",
    ["TouchPoints", "ADCB TouchPoints", "ADCB points payment", "pay with TouchPoints"],
    "points_payment",
    "Pay with ADCB TouchPoints",
    "ادفع باستخدام نقاط ADCB TouchPoints",
    "A payment method, not a discount. Use points for tickets and F&B at all UAE locations and experiences, as a member or guest.",
    "طريقة دفع وليست خصماً. استخدم النقاط للتذاكر والمأكولات والمشروبات في جميع المواقع والتجارب، كعضو أو كضيف.",
    [card("adcb-touchpoints-payment", "ADCB TouchPoints", ["TouchPoints payment", "ADCB points", "pay with points"], eligibility(ALL), { stated: false }, { noCardRequired: true })],
    {
      memberRequired: false,
      minOrderTotal: 20,
      otpThreshold: 200,
      onlineOnly: true,
      notes: text("Full or part payment is supported; the balance uses an ADCB card. Payments cannot be reversed and BOGO cannot be combined.", "يمكن الدفع كلياً أو جزئياً بالنقاط ودفع الرصيد ببطاقة ADCB. لا يمكن عكس الدفع ولا يمكن الجمع مع عرض التذكرة المجانية."),
    },
  ),
]);

export const OFFER_BY_ID = Object.freeze(Object.fromEntries(OFFERS.map((item) => [item.id, item])));
