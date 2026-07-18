const VERIFIED_AT = "2026-07-13";

export const VOX_OFFICIAL_SOURCES = Object.freeze({
  faq: Object.freeze({
    title: "Frequently Asked Questions | VOX Cinemas UAE",
    url: "https://uae.voxcinemas.com/faq",
    publisher: "VOX Cinemas UAE",
  }),
  refunds: Object.freeze({
    title: "VOX Cinemas Refund Policy",
    url: "https://uae.voxcinemas.com/refunds",
    publisher: "VOX Cinemas UAE",
  }),
  contact: Object.freeze({
    title: "Contact Us | VOX Cinemas UAE",
    url: "https://uae.voxcinemas.com/contact-us",
    publisher: "VOX Cinemas UAE",
  }),
  about: Object.freeze({
    title: "About Us | VOX Cinemas UAE",
    url: "https://uae.voxcinemas.com/about",
    publisher: "VOX Cinemas UAE",
  }),
  promotions: Object.freeze({
    title: "Offers and Promotions | VOX Cinemas UAE",
    url: "https://uae.voxcinemas.com/promotions",
    publisher: "VOX Cinemas UAE",
  }),
  share: Object.freeze({
    title: "SHARE Rewards Program | VOX Cinemas UAE",
    url: "https://uae.voxcinemas.com/share",
    publisher: "VOX Cinemas UAE",
  }),
  app: Object.freeze({
    title: "VOX Cinemas Mobile App",
    url: "https://uae.voxcinemas.com/vox-cinemas-app",
    publisher: "VOX Cinemas UAE",
  }),
});

const staticUpdate = (volatility = "medium") => Object.freeze({
  reviewedAt: VERIFIED_AT,
  cadence: "monthly",
  volatility,
  freshness: "revalidate against the cited official page before publishing policy changes",
});

const apiUpdate = (provider) => Object.freeze({
  reviewedAt: VERIFIED_AT,
  cadence: "per-request",
  volatility: "high",
  freshness: `resolve current values from ${provider}; do not treat this entry as live inventory`,
});

const metadata = ({ tags, source, audience = ["all"], update, provenance = "official" }) => Object.freeze({
  tags: Object.freeze({ en: Object.freeze(tags.en), ar: Object.freeze(tags.ar) }),
  source: Object.freeze(source),
  audience: Object.freeze(audience),
  update,
  provenance,
});

const STATIC = Object.freeze({ kind: "static" });

export const VOX_FAQ_ENTRIES = Object.freeze([
  Object.freeze({
    id: "cinema-locations-hours",
    topic: "locations_hours",
    priority: 100,
    utterances: Object.freeze({
      en: Object.freeze(["cinema locations", "where is vox", "nearest cinema", "opening hours", "what time do you open", "when does the cinema open"]),
      ar: Object.freeze(["مواقع السينما", "أين توجد فوكس", "أقرب سينما", "ساعات العمل", "متى تفتح السينما", "مواعيد فتح السينما"]),
    }),
    answer: Object.freeze({
      en: "VOX Cinemas UAE locations and opening times vary. Tell me which cinema you mean and I can use its current movie schedule. VOX advises checking the first listed session; the venue typically opens shortly before that first showtime.",
      ar: "تختلف مواقع ڤوكس سينما في الإمارات ومواعيد فتحها. أخبرني بالسينما التي تقصدها لأتحقق من جدول عروضها الحالي. تنصح ڤوكس بالرجوع إلى أول عرض مدرج، إذ تفتح السينما عادةً قبله بقليل.",
    }),
    delivery: Object.freeze({
      kind: "api",
      provider: "vista.getCinemas + vista.getScheduledFilms + vista.getSessions",
      requiredData: Object.freeze(["selectedCinema", "firstScheduledSession"]),
      instruction: Object.freeze({
        en: "List locations from the current cinema feed. Never quote a fixed cinema opening hour; derive guidance from the selected location's earliest current session.",
        ar: "اعرض المواقع من بيانات السينما الحالية. لا تذكر ساعة فتح ثابتة؛ استند إلى أبكر عرض حالي في الموقع المحدد.",
      }),
    }),
    metadata: metadata({
      tags: { en: ["location", "cinema", "hours", "open", "nearest"], ar: ["موقع", "سينما", "ساعات", "تفتح", "أقرب"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      update: apiUpdate("the Vista-shaped cinema and session providers"),
    }),
  }),
  Object.freeze({
    id: "tickets-and-etickets",
    topic: "tickets",
    priority: 96,
    utterances: Object.freeze({
      en: Object.freeze(["how do i use my e-ticket", "e ticket", "electronic ticket", "print my ticket", "booking confirmation", "how many tickets can i book"]),
      ar: Object.freeze(["كيف أستخدم التذكرة الإلكترونية", "تذكرة إلكترونية", "طباعة التذكرة", "تأكيد الحجز", "كم تذكرة يمكنني حجزها"]),
    }),
    answer: Object.freeze({
      en: "Scan the code in your booking-confirmation email at the ticket podium. One e-ticket contains every ticket in that booking, so enter when your whole group has arrived. You can also print tickets at a cinema kiosk with the booking reference. Online bookings allow up to 10 tickets per booking.",
      ar: "امسح الرمز الموجود في رسالة تأكيد الحجز عند بوابة التذاكر. تشمل التذكرة الإلكترونية جميع تذاكر الحجز، لذلك ادخل بعد وصول مجموعتك كاملة. ويمكنك أيضاً طباعة التذاكر من جهاز الخدمة في السينما باستخدام رقم الحجز. الحد الأقصى للحجز الإلكتروني هو 10 تذاكر في الحجز الواحد.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["ticket", "e-ticket", "qr", "booking", "kiosk", "print"], ar: ["تذكرة", "إلكترونية", "رمز", "حجز", "طباعة"] },
      source: [VOX_OFFICIAL_SOURCES.faq, VOX_OFFICIAL_SOURCES.app],
      update: staticUpdate("low"),
    }),
  }),
  Object.freeze({
    id: "experiences-overview",
    topic: "experiences",
    priority: 80,
    utterances: Object.freeze({
      en: Object.freeze(["cinema experiences", "ways to watch", "what is imax", "what is max", "what is theatre", "what is gold", "imax or 4dx", "kids cinema"]),
      ar: Object.freeze(["تجارب السينما", "طرق المشاهدة", "ما هي آيماكس", "ما هي تجربة ماكس", "ما هي تجربة ثياتر", "ما هي جولد", "آيماكس أو فور دي إكس", "سينما الأطفال"]),
    }),
    answer: Object.freeze({
      en: "VOX offers formats for different occasions, including luxury THEATRE and GOLD, the large-format MAX experience with Dolby Atmos, IMAX, multisensory 4DX and family-focused KIDS. The formats available depend on the cinema and showtime.",
      ar: "تقدم ڤوكس تجارب تناسب مناسبات مختلفة، منها THEATRE وGOLD الفاخرتان، وتجربة MAX ذات الشاشة الكبيرة وصوت Dolby Atmos، وIMAX، وتجربة 4DX متعددة المؤثرات، وتجربة KIDS للعائلات. وتختلف التجارب المتاحة حسب السينما وموعد العرض.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["experience", "imax", "4dx", "max", "gold", "theatre", "kids"], ar: ["تجربة", "آيماكس", "فور دي إكس", "ماكس", "جولد", "ثياتر", "أطفال"] },
      source: [VOX_OFFICIAL_SOURCES.about, VOX_OFFICIAL_SOURCES.faq],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "experience-availability",
    topic: "experiences",
    priority: 95,
    utterances: Object.freeze({
      en: Object.freeze(["where is imax available", "which cinema has 4dx", "is gold available", "experience showtimes", "does this cinema have max"]),
      ar: Object.freeze(["أين تتوفر آيماكس", "أي سينما فيها فور دي إكس", "هل جولد متاحة", "مواعيد تجربة", "هل توجد ماكس في هذه السينما"]),
    }),
    answer: Object.freeze({
      en: "Experience availability changes by cinema, movie and session. Choose a cinema and movie so I can check the current session formats instead of guessing.",
      ar: "تتغير التجارب المتاحة حسب السينما والفيلم وموعد العرض. اختر السينما والفيلم لأتحقق من تجارب العروض الحالية بدلاً من التخمين.",
    }),
    delivery: Object.freeze({
      kind: "api",
      provider: "vista.getSessions",
      requiredData: Object.freeze(["selectedCinema", "selectedMovie", "session.exp"]),
      instruction: Object.freeze({
        en: "Use only experience labels returned on current sessions for the selected cinema and movie.",
        ar: "استخدم فقط أسماء التجارب الواردة في العروض الحالية للسينما والفيلم المحددين.",
      }),
    }),
    metadata: metadata({
      tags: { en: ["available", "experience", "session", "cinema", "imax", "4dx", "gold", "max"], ar: ["متاح", "تجربة", "عرض", "سينما", "آيماكس", "فور دي إكس", "جولد", "ماكس"] },
      source: [VOX_OFFICIAL_SOURCES.about, VOX_OFFICIAL_SOURCES.faq],
      update: apiUpdate("vista.getSessions"),
    }),
  }),
  Object.freeze({
    id: "food-and-drinks",
    topic: "food_beverage",
    priority: 82,
    utterances: Object.freeze({
      en: Object.freeze(["food and drinks", "outside food", "candy bar", "online food order", "prepare now", "food qr code", "collect my food"]),
      ar: Object.freeze(["الطعام والمشروبات", "طعام من الخارج", "الكاندي بار", "طلب الطعام أونلاين", "جهز الآن", "رمز طلب الطعام", "استلام الطعام"]),
    }),
    answer: Object.freeze({
      en: "Food and drinks bought outside the cinema are not permitted. VOX says its online and Candy Bar menus are the same, although in-cinema specials may differ. An online order is collected only from the selected cinema and starts being prepared after its QR code is activated at the kiosk.",
      ar: "لا يُسمح بإدخال أطعمة أو مشروبات تم شراؤها من خارج السينما. وتوضح ڤوكس أن قائمة الطلب الإلكتروني وقائمة Candy Bar متطابقتان، مع احتمال وجود عروض خاصة داخل السينما. يُستلم الطلب الإلكتروني من السينما المحددة فقط، ويبدأ تحضيره بعد تفعيل رمز QR في جهاز الخدمة.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["food", "drink", "snack", "candy bar", "qr", "collect", "outside"], ar: ["طعام", "مشروبات", "وجبات", "كاندي بار", "رمز", "استلام", "الخارج"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "bank-and-card-offers",
    topic: "offers",
    priority: 93,
    utterances: Object.freeze({
      en: Object.freeze(["bank offer", "card offer", "ticket promotion", "discount with my card", "why is my card not listed", "redeem an offer"]),
      ar: Object.freeze(["عرض البنك", "عرض البطاقة", "عرض تذاكر", "خصم ببطاقتي", "لماذا بطاقتي غير موجودة", "استخدام العرض"]),
    }),
    answer: Object.freeze({
      en: "Bank offers require a VOX account and appear only when they apply to the selected showtime and eligible card. Choose a showtime and provide the bank and card product so current eligibility can be checked. An offer is not confirmed until checkout accepts it.",
      ar: "تتطلب العروض البنكية حساب ڤوكس، ولا تظهر إلا عندما تنطبق على موعد العرض والبطاقة المؤهلة. اختر موعد العرض وحدد البنك ونوع البطاقة للتحقق من الأهلية الحالية. لا يُعد العرض مؤكداً إلا بعد قبوله عند الدفع.",
    }),
    delivery: Object.freeze({
      kind: "api",
      provider: "offers.resolveOffer / offers.resolveOfferForBankAndCard",
      requiredData: Object.freeze(["selectedShowtime", "bankName", "cardName", "experience"]),
      instruction: Object.freeze({
        en: "Resolve against current offer data and selected-session context. Never claim redemption or guaranteed eligibility.",
        ar: "تحقق من بيانات العروض الحالية وسياق العرض المحدد. لا تدّعِ تطبيق العرض أو ضمان الأهلية.",
      }),
    }),
    metadata: metadata({
      tags: { en: ["offer", "bank", "card", "discount", "promotion", "eligible"], ar: ["عرض", "بنك", "بطاقة", "خصم", "ترويج", "مؤهل"] },
      source: [VOX_OFFICIAL_SOURCES.faq, VOX_OFFICIAL_SOURCES.promotions],
      audience: ["all", "registered-members"],
      update: apiUpdate("the current offers resolver and offer data"),
    }),
  }),
  Object.freeze({
    id: "wheelchair-accessibility",
    topic: "accessibility",
    priority: 91,
    utterances: Object.freeze({
      en: Object.freeze(["wheelchair access", "wheelchair spaces", "accessible seating", "people of determination", "pod accessibility"]),
      ar: Object.freeze(["دخول الكرسي المتحرك", "أماكن الكراسي المتحركة", "مقاعد مهيأة", "أصحاب الهمم", "سهولة الوصول"]),
    }),
    answer: Object.freeze({
      en: "VOX cinemas have allocated wheelchair areas. Exact positions and availability depend on the auditorium and session, so VOX recommends arranging the ticket at the cinema counter or confirming with Customer Care.",
      ar: "توفر سينمات ڤوكس مساحات مخصصة للكراسي المتحركة. وتختلف المواقع والتوافر حسب القاعة والعرض، لذلك توصي ڤوكس بترتيب التذكرة من شباك السينما أو التأكيد مع خدمة العملاء.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["accessible", "accessibility", "wheelchair", "determination", "mobility", "seating"], ar: ["مهيأ", "سهولة الوصول", "كرسي متحرك", "أصحاب الهمم", "حركة", "مقاعد"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "people-of-determination", "companions"],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "movie-age-ratings",
    topic: "age_restrictions",
    priority: 99,
    utterances: Object.freeze({
      en: Object.freeze(["movie age rating", "can my child watch", "underage entry", "pg 13", "pg 15", "15 plus", "18 plus", "21 plus", "will staff ask for id"]),
      ar: Object.freeze(["التصنيف العمري", "هل يستطيع طفلي مشاهدة الفيلم", "دخول القاصرين", "بي جي 13", "بي جي 15", "فوق 15", "فوق 18", "فوق 21", "هل يطلبون الهوية"]),
    }),
    answer: Object.freeze({
      en: "UAE film ratings are enforced: guests below a restricted 15+, 18+ or 21+ rating cannot enter even with a parent, and photo ID may be requested. PG13 and PG15 allow younger guests only with someone meeting the stated age. An 18TC film is provisionally treated as 18+ until its final rating is approved.",
      ar: "تُطبق التصنيفات العمرية الإماراتية: لا يُسمح لمن هم دون تصنيفات +15 أو +18 أو +21 بدخول الفيلم حتى برفقة ولي الأمر، وقد تُطلب هوية تحمل صورة. يسمح تصنيفا PG13 وPG15 لمن هم أصغر سناً بالدخول فقط برفقة شخص يستوفي العمر المحدد. ويُعامل تصنيف 18TC مؤقتاً على أنه +18 حتى اعتماد التصنيف النهائي.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["age", "rating", "child", "id", "pg13", "pg15", "15+", "18+", "21+", "18tc"], ar: ["عمر", "تصنيف", "طفل", "هوية", "قاصر", "+15", "+18", "+21"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "parents-guardians"],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "experience-age-and-safety",
    topic: "age_restrictions",
    priority: 94,
    utterances: Object.freeze({
      en: Object.freeze(["4dx age limit", "4dx height", "gold child age", "theatre child age", "moonlight child age", "is 4dx safe"]),
      ar: Object.freeze(["عمر فور دي إكس", "طول فور دي إكس", "عمر الأطفال في جولد", "عمر الأطفال في ثياتر", "عمر الأطفال في مونلايت", "هل فور دي إكس آمنة"]),
    }),
    answer: Object.freeze({
      en: "For MOONLIGHT, GOLD and THEATRE, children under 5 are not admitted; guests aged 5 to 18 must follow the film rating and be accompanied by a parent or guardian. For 4DX, children 7 and under need a parent or guardian, and anyone under 100 cm is not admitted. VOX also lists health and motion-sensitivity warnings for 4DX.",
      ar: "في تجارب MOONLIGHT وGOLD وTHEATRE لا يُسمح بدخول الأطفال دون 5 سنوات، ويجب أن يلتزم الضيوف من 5 إلى 18 سنة بتصنيف الفيلم وأن يكونوا برفقة ولي أمر. وفي 4DX يحتاج الأطفال بعمر 7 سنوات أو أقل إلى مرافق، ولا يُسمح بدخول من يقل طولهم عن 100 سم. كما تنشر ڤوكس تحذيرات صحية ومتعلقة بالحساسية للحركة لتجربة 4DX.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["4dx", "gold", "theatre", "moonlight", "age", "height", "safety", "child"], ar: ["فور دي إكس", "جولد", "ثياتر", "مونلايت", "عمر", "طول", "سلامة", "طفل"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "parents-guardians"],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "booking-management",
    topic: "booking_refund",
    priority: 88,
    utterances: Object.freeze({
      en: Object.freeze(["manage my booking", "find my booking", "purchase history", "link guest booking", "booking confirmation missing"]),
      ar: Object.freeze(["إدارة الحجز", "العثور على حجزي", "سجل المشتريات", "ربط حجز زائر", "لم يصل تأكيد الحجز"]),
    }),
    answer: Object.freeze({
      en: "Registered guests can view upcoming and past bookings in My Account under Purchases or Purchase History. A guest booking can be linked to an account with the cinema, booking email and booking reference up to 30 minutes before the movie starts. For a missing confirmation, use the official contact form or show proof of purchase at the cinema counter.",
      ar: "يمكن للمستخدم المسجل عرض الحجوزات القادمة والسابقة من قسم المشتريات أو سجل المشتريات في حسابي. ويمكن ربط حجز الزائر بالحساب باستخدام السينما وبريد الحجز ورقم الحجز حتى 30 دقيقة قبل بدء الفيلم. إذا لم يصلك التأكيد، استخدم نموذج التواصل الرسمي أو اعرض إثبات الشراء عند شباك السينما.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["booking", "manage", "history", "guest", "link", "confirmation"], ar: ["حجز", "إدارة", "سجل", "زائر", "ربط", "تأكيد"] },
      source: [VOX_OFFICIAL_SOURCES.faq, VOX_OFFICIAL_SOURCES.refunds],
      audience: ["all", "registered-members", "guest-bookers"],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "cancellation-and-refunds",
    topic: "booking_refund",
    routingTopic: "cancellations_refunds",
    intent: "cancellation",
    priority: 100,
    utterances: Object.freeze({
      en: Object.freeze(["can I cancel a booking", "ticket refund eligibility", "refund policy", "can tickets be exchanged", "cash refund", "refund deadline", "how do cancellations work"]),
      ar: Object.freeze(["هل أقدر ألغي حجزي", "كيف ألغي الحجز", "استرداد التذاكر", "سياسة الاسترداد", "تبديل التذكرة", "استرداد نقدي", "موعد الاسترداد", "وش شروط الاسترجاع", "متى آخر وقت للإلغاء", "ممكن أسترجع قيمة التذاكر"]),
    }),
    answer: Object.freeze({
      en: "Eligible online purchases may be submitted for refund up to 30 minutes before the movie starts. Approved refunds are VOX credits, not cash. Guest bookings, bank or telco offers, promotions, collected or scanned tickets, and activated F&B orders can be ineligible. Registered users should open My Account, Past Purchases, then Manage Booking; approval remains subject to the official policy.",
      ar: "يمكن طلب استرداد المشتريات الإلكترونية المؤهلة حتى 30 دقيقة قبل بدء الفيلم. تصدر المبالغ المعتمدة كرصيد ڤوكس وليس نقداً. قد لا تكون حجوزات الزوار أو عروض البنوك والاتصالات أو العروض الترويجية أو التذاكر المستلمة أو الممسوحة أو طلبات الطعام المفعلة مؤهلة. على المستخدم المسجل فتح حسابي، ثم المشتريات السابقة، ثم إدارة الحجز، وتبقى الموافقة خاضعة للسياسة الرسمية.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["cancel", "refund", "exchange", "credit", "booking", "deadline", "policy"], ar: ["إلغاء", "الغي", "استرداد", "استرجاع", "تبديل", "رصيد", "حجز", "موعد", "شروط", "سياسة"] },
      source: [VOX_OFFICIAL_SOURCES.refunds, VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "registered-members", "guest-bookers"],
      update: staticUpdate("high"),
    }),
  }),
  Object.freeze({
    id: "vox-account",
    topic: "account",
    priority: 82,
    utterances: Object.freeze({
      en: Object.freeze(["vox account", "create an account", "account benefits", "forgot password", "reset password", "save my card", "purchase history"]),
      ar: Object.freeze(["حساب ڤوكس", "إنشاء حساب", "مزايا الحساب", "نسيت كلمة المرور", "إعادة تعيين كلمة المرور", "حفظ البطاقة", "سجل المشتريات"]),
    }),
    answer: Object.freeze({
      en: "A VOX account provides access to ticket offers, saved contact and payment details, quicker booking, and upcoming and past purchases. Reset a password from the Forgot Password link on the login page. Purchase History is available from My Account and the app settings.",
      ar: "يمنحك حساب ڤوكس إمكانية الوصول إلى عروض التذاكر وحفظ بيانات الاتصال والدفع وتسريع الحجز وعرض المشتريات القادمة والسابقة. يمكن إعادة تعيين كلمة المرور من رابط نسيت كلمة المرور في صفحة الدخول، ويتوفر سجل المشتريات في حسابي وإعدادات التطبيق.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["account", "login", "password", "member", "history", "saved card"], ar: ["حساب", "دخول", "كلمة المرور", "عضو", "سجل", "بطاقة محفوظة"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "registered-members"],
      update: staticUpdate("medium"),
    }),
  }),
  Object.freeze({
    id: "vox-credit-wallet",
    topic: "loyalty_wallet",
    priority: 95,
    utterances: Object.freeze({
      en: Object.freeze(["vox credit", "vox wallet", "credit expiry", "where is my refund credit", "use credit at checkout", "credit for food"]),
      ar: Object.freeze(["رصيد ڤوكس", "محفظة ڤوكس", "انتهاء الرصيد", "أين رصيد الاسترداد", "استخدام الرصيد عند الدفع", "رصيد للطعام"]),
    }),
    answer: Object.freeze({
      en: "In the UAE, 1 VOX credit equals AED 1. Credit is valid for 90 days, is shown in My Account under Wallet, can be used online for tickets and F&B, and is applied automatically at checkout while logged in. It cannot be exchanged for cash.",
      ar: "في الإمارات يعادل رصيد ڤوكس واحد درهماً إماراتياً واحداً. يكون الرصيد صالحاً لمدة 90 يوماً، ويظهر في المحفظة ضمن حسابي، ويمكن استخدامه إلكترونياً للتذاكر والطعام والمشروبات، ويُطبق تلقائياً عند الدفع بعد تسجيل الدخول. ولا يمكن تحويله إلى نقد.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["wallet", "vox credit", "refund", "expiry", "checkout", "aed"], ar: ["محفظة", "رصيد ڤوكس", "استرداد", "انتهاء", "دفع", "درهم"] },
      source: [VOX_OFFICIAL_SOURCES.refunds, VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "registered-members"],
      update: staticUpdate("high"),
    }),
  }),
  Object.freeze({
    id: "share-loyalty",
    topic: "loyalty_wallet",
    priority: 84,
    utterances: Object.freeze({
      en: Object.freeze(["share points", "loyalty points", "vox rewards", "earn points", "redeem points", "share id"]),
      ar: Object.freeze(["نقاط شير", "نقاط الولاء", "مكافآت ڤوكس", "كسب النقاط", "استبدال النقاط", "رقم شير"]),
    }),
    answer: Object.freeze({
      en: "VOX loyalty is provided through SHARE. Members can identify themselves with the SHARE ID in the VOX or SHARE app and can earn or redeem through logged-in VOX purchases or at the cinema where eligible. Redemption and offer-combination rules can change, so check the current SHARE terms before quoting a rate or guaranteeing eligibility.",
      ar: "يُقدم برنامج ولاء ڤوكس عبر SHARE. يمكن للأعضاء استخدام رقم SHARE الموجود في تطبيق ڤوكس أو SHARE، وكسب النقاط أو استبدالها عبر مشتريات ڤوكس بعد تسجيل الدخول أو في السينما عند الأهلية. قد تتغير قواعد الاستبدال والجمع مع العروض، لذلك يجب التحقق من شروط SHARE الحالية قبل ذكر معدل أو ضمان الأهلية.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["share", "loyalty", "points", "rewards", "earn", "redeem"], ar: ["شير", "ولاء", "نقاط", "مكافآت", "كسب", "استبدال"] },
      source: [VOX_OFFICIAL_SOURCES.share],
      audience: ["all", "share-members"],
      update: staticUpdate("high"),
    }),
  }),
  Object.freeze({
    id: "voxi-language-support",
    topic: "support",
    priority: 120,
    utterances: Object.freeze({
      en: Object.freeze([
        "what languages can we use",
        "which languages do you support",
        "what languages does voxi support",
        "can you speak arabic",
        "can you speak english",
        "can i type during voice",
        "can i use text during voice chat",
        "does text work while voice is on",
      ]),
      ar: Object.freeze([
        "ما اللغات التي يمكننا استخدامها",
        "ما اللغات التي تدعمها ڤوكسي",
        "هل تتحدث العربية",
        "هل تتحدث الإنجليزية",
        "هل يمكنني الكتابة أثناء المحادثة الصوتية",
        "هل يمكنني استخدام النص أثناء المحادثة الصوتية",
        "هل تعمل الكتابة أثناء تشغيل الصوت",
      ]),
    }),
    answer: Object.freeze({
      en: "Voxi supports English and Arabic. You can type at any time, including during an active voice conversation; typed messages stay in the same conversation and keep the current booking context. Use the language selector to choose English or العربية.",
      ar: "تدعم ڤوكسي المحادثة بالإنجليزية والعربية. يمكنك الكتابة في أي وقت، حتى أثناء محادثة صوتية نشطة؛ وتبقى الرسائل المكتوبة ضمن المحادثة نفسها مع الاحتفاظ بسياق الحجز الحالي. استخدم محدد اللغة لاختيار English أو العربية.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: {
        en: ["language support", "english", "arabic", "voice and text", "type during voice"],
        ar: ["دعم اللغات", "الإنجليزية", "العربية", "الصوت والكتابة", "الكتابة أثناء الصوت"],
      },
      source: [],
      audience: ["all"],
      update: staticUpdate("low"),
      provenance: "product",
    }),
  }),
  Object.freeze({
    id: "customer-support",
    topic: "support",
    priority: 92,
    utterances: Object.freeze({
      en: Object.freeze(["contact vox", "customer support", "customer care", "phone number", "call centre", "support hours", "complaint"]),
      ar: Object.freeze(["التواصل مع ڤوكس", "دعم العملاء", "خدمة العملاء", "رقم الهاتف", "مركز الاتصال", "ساعات الدعم", "شكوى"]),
    }),
    answer: Object.freeze({
      en: "Use the official VOX Cinemas UAE contact form or call 600 599 905. Customer Care is listed as available from 10:00 AM to 12:00 AM, seven days a week. Include the booking reference for a booking enquiry.",
      ar: "استخدم نموذج التواصل الرسمي لڤوكس سينما الإمارات أو اتصل على 600 599 905. ساعات خدمة العملاء المعلنة من 10 صباحاً حتى 12 منتصف الليل طوال أيام الأسبوع. أرفق رقم الحجز عند الاستفسار عن حجز.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["support", "contact", "phone", "customer care", "complaint", "help"], ar: ["دعم", "تواصل", "هاتف", "خدمة العملاء", "شكوى", "مساعدة"] },
      source: [VOX_OFFICIAL_SOURCES.contact],
      audience: ["all"],
      update: staticUpdate("high"),
    }),
  }),
  Object.freeze({
    id: "group-and-private-bookings",
    topic: "support",
    priority: 78,
    utterances: Object.freeze({
      en: Object.freeze(["private screening", "group booking", "birthday party", "corporate event", "book a cinema"]),
      ar: Object.freeze(["عرض خاص", "حجز مجموعة", "حفلة عيد ميلاد", "فعالية شركة", "حجز سينما كاملة"]),
    }),
    answer: Object.freeze({
      en: "VOX accepts enquiries for private screenings, conferences, staff outings and birthday parties. Email events@maf.ae with the cinema, group size and event type.",
      ar: "تستقبل ڤوكس طلبات العروض الخاصة والمؤتمرات وفعاليات الموظفين وحفلات أعياد الميلاد. أرسل إلى events@maf.ae اسم السينما وعدد الضيوف ونوع الفعالية.",
    }),
    delivery: STATIC,
    metadata: metadata({
      tags: { en: ["private", "group", "event", "birthday", "corporate", "screening"], ar: ["خاص", "مجموعة", "فعالية", "عيد ميلاد", "شركة", "عرض"] },
      source: [VOX_OFFICIAL_SOURCES.faq],
      audience: ["all", "groups", "corporate"],
      update: staticUpdate("medium"),
    }),
  }),
]);

export const VOX_FAQ_TOPICS = Object.freeze([
  "locations_hours",
  "tickets",
  "experiences",
  "food_beverage",
  "offers",
  "accessibility",
  "age_restrictions",
  "booking_refund",
  "account",
  "loyalty_wallet",
  "support",
]);
