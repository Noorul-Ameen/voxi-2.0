import React from "react";
import { BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, CreditCard, ExternalLink, HelpCircle, Info, ListChecks, RefreshCw, Search, ShieldCheck, Sparkles, Ticket, XCircle } from "lucide-react";
import "./OffersPanel.css";
import { C } from "../theme.js";
import { getMediaUrl, getOfferMedia } from "../mediaData.js";
import { COMMON_OFFER_TERMS, OFFER_META, OFFERS } from "../offers/offersData.js";
import { benefitLabel, buildOfferFacts, buildProfileFacts } from "../offers/offerFacts.js";
import { offerContextFingerprint } from "../offers/offerContext.js";
import { ELIGIBILITY, evaluateOfferEligibility, searchOffers } from "../offers/offerResolver.js";

const COPY = {
  en: {
    title: "Bank offers",
    subtitle: "{promotions} current promotions across {issuers} offer groups",
    search: "Search bank or card",
    searchLabel: "Search bank offers",
    cardLabel: "Card to check",
    chooseCard: "Choose your exact card",
    noResults: "No matching bank or card was found.",
    eligible: "Listed as eligible",
    ineligible: "Not eligible",
    cardRequired: "Card required",
    commonTerm: "Member and online-booking rules apply.",
    guestTerm: "TouchPoints can be used by a VOX member or guest; online-booking rules still apply.",
    foodBenefit: "A secondary Candy Bar benefit may apply; review the full bank terms.",
    verified: "Reference checked",
    detailsNeeded: "Details needed to assess eligibility: {fields}.",
    exactCardNeeded: "Choose the exact card name so eligibility is not guessed.",
    membershipLabel: "VOX account status",
    membershipUnknown: "Not provided",
    membershipMember: "Signed in to VOX",
    membershipGuest: "Guest checkout",
    fields: {
      bank: "issuing bank",
      card: "exact card",
      experience: "showtime experience",
      format: "2D/3D format",
      seatType: "seat category",
      membership: "VOX membership status",
      channel: "booking channel",
      ticketCount: "ticket count",
      orderTotal: "order total",
      monthlyTicketsUsed: "monthly offer usage",
      monthlySpend: "monthly retail spend",
      cinema: "cinema",
      checkoutVerification: "VOX checkout verification",
    },
    source: "Official offer page",
    back: "Go back",
    expand: "Show offer details",
    collapse: "Hide offer details",
    atAGlance: "At a glance",
    activePromotions: "Current promotions",
    cardTiers: "Cards, limits, and experiences",
    benefit: "Ticket benefit",
    experiences: "Eligible experiences",
    requirements: "Requirements",
    limits: "Monthly and booking limits",
    restrictions: "Exclusions and location rules",
    redemption: "How to use this offer",
    food: "Food and drink benefit",
    officialDetails: "Official details",
    officialTerms: "Full terms",
    checkoutOnly: "Guidance only, not applied",
    checkoutVerification: "VOX checkout verification",
    noPublishedDetails: "VOX lists this promotion, but its official detail and terms pages do not publish the eligible cards or conditions.",
    profileCards: "Cards in this tier",
    noCardList: "No exact card list is published.",
    selectHint: "Select your exact card to check it against the current showtime context.",
    notSelected: "Read all published details below, or select a card for a contextual check.",
    termsChecked: "Official listing checked",
    validity: "Published validity",
    validUntil: "Valid through {date}",
    noExpiry: "No dated expiry is published.",
    citiSourceBoundary: "Citi card-tier guidance below comes from the separately published Citi 30% off or BOGO campaign. It is not published as terms for the standalone Citi BOGO listing.",
  },
  ar: {
    title: "عروض البنوك",
    subtitle: "{promotions} عرضاً حالياً ضمن {issuers} مجموعة عروض",
    search: "ابحث عن البنك أو البطاقة",
    searchLabel: "البحث في عروض البنوك",
    cardLabel: "البطاقة المطلوب التحقق منها",
    chooseCard: "اختر اسم بطاقتك بدقة",
    noResults: "لم يتم العثور على بنك أو بطاقة مطابقة.",
    eligible: "مدرجة ضمن البطاقات المؤهلة",
    ineligible: "غير مؤهلة",
    cardRequired: "يلزم تحديد البطاقة",
    commonTerm: "تسري شروط العضوية والحجز عبر الإنترنت.",
    guestTerm: "يمكن استخدام TouchPoints كعضو أو كضيف، مع استمرار شروط الحجز عبر الإنترنت.",
    foodBenefit: "قد تنطبق ميزة إضافية لدى الكاندي بار؛ راجع شروط البنك الكاملة.",
    verified: "تاريخ مراجعة المرجع",
    detailsNeeded: "نحتاج إلى هذه التفاصيل لتقييم الأهلية: {fields}.",
    exactCardNeeded: "اختر الاسم الدقيق للبطاقة حتى لا يتم تخمين الأهلية.",
    membershipLabel: "حالة حساب VOX",
    membershipUnknown: "غير محددة",
    membershipMember: "تم تسجيل الدخول إلى VOX",
    membershipGuest: "الحجز كضيف",
    fields: {
      bank: "البنك المُصدر",
      card: "اسم البطاقة الدقيق",
      experience: "تجربة موعد العرض",
      format: "صيغة 2D أو 3D",
      seatType: "فئة المقعد",
      membership: "حالة عضوية VOX",
      channel: "قناة الحجز",
      ticketCount: "عدد التذاكر",
      orderTotal: "إجمالي الطلب",
      monthlyTicketsUsed: "الاستخدام الشهري للعرض",
      monthlySpend: "الإنفاق الشهري لدى البنك",
      cinema: "السينما",
      checkoutVerification: "التحقق عند إتمام الحجز لدى VOX",
    },
    source: "صفحة العرض الرسمية",
    back: "رجوع",
    expand: "عرض تفاصيل العرض",
    collapse: "إخفاء تفاصيل العرض",
    atAGlance: "نظرة سريعة",
    activePromotions: "العروض الحالية",
    cardTiers: "البطاقات والحدود والتجارب",
    benefit: "ميزة التذاكر",
    experiences: "التجارب المؤهلة",
    requirements: "المتطلبات",
    limits: "الحدود الشهرية وحدود الحجز",
    restrictions: "الاستثناءات وقواعد المواقع",
    redemption: "طريقة استخدام العرض",
    food: "ميزة المأكولات والمشروبات",
    officialDetails: "التفاصيل الرسمية",
    officialTerms: "الشروط الكاملة",
    checkoutOnly: "للاسترشاد فقط، لم يتم تطبيقه",
    checkoutVerification: "التحقق عند إتمام الحجز لدى VOX",
    noPublishedDetails: "تعرض VOX هذا العرض، لكن صفحات التفاصيل والشروط الرسمية لا تنشر البطاقات المؤهلة أو الأحكام.",
    profileCards: "البطاقات في هذه الفئة",
    noCardList: "لم يتم نشر قائمة دقيقة للبطاقات.",
    selectHint: "اختر بطاقتك بدقة للتحقق منها مقابل سياق موعد العرض الحالي.",
    notSelected: "اقرأ جميع التفاصيل المنشورة أدناه، أو اختر بطاقة للتحقق حسب السياق.",
    termsChecked: "تمت مراجعة الإعلان الرسمي",
    validity: "الصلاحية المنشورة",
    validUntil: "صالح حتى {date}",
    noExpiry: "لم يتم نشر تاريخ انتهاء محدد.",
    citiSourceBoundary: "تستند إرشادات فئات بطاقات Citi أدناه إلى الشروط المنشورة بشكل منفصل لعرض Citi بخصم 30٪ أو اشترِ واحدة واحصل على أخرى. ولا تُعد شروطاً منشورة لإعلان Citi المستقل لعرض اشترِ واحدة واحصل على أخرى.",
  },
};

const STATUS_STYLE = {
  [ELIGIBILITY.ELIGIBLE]: { color: C.green, background: C.successSoft, Icon: BadgeCheck },
  [ELIGIBILITY.INELIGIBLE]: { color: C.danger, background: C.dangerSoft, Icon: XCircle },
  [ELIGIBILITY.CARD_REQUIRED]: { color: C.primary, background: C.primarySoft, Icon: HelpCircle },
};

function localized(value, language) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[language] || value.en || "";
}

function Status({ result, copy, language }) {
  const view = STATUS_STYLE[result.status] || STATUS_STYLE[ELIGIBILITY.CARD_REQUIRED];
  const label = result.status === ELIGIBILITY.ELIGIBLE
    ? copy.eligible
    : result.status === ELIGIBILITY.INELIGIBLE
      ? copy.ineligible
      : language === "ar" ? "نحتاج تفاصيل إضافية" : "More details needed";
  const missingFields = (result.missingFields || []).map((field) => copy.fields[field] || field);
  const detailsReason = missingFields.length
    ? copy.detailsNeeded.replace("{fields}", missingFields.join(language === "ar" ? "، " : ", "))
    : copy.exactCardNeeded;
  const reason = language === "ar"
    ? result.status === ELIGIBILITY.ELIGIBLE
      ? "هذه البطاقة مدرجة ضمن الفئات المؤهلة للسياق المحدد."
      : result.status === ELIGIBILITY.INELIGIBLE
        ? "لا تتحقق جميع شروط هذا العرض في السياق المحدد؛ راجع الشروط أو أكد الأهلية عند الدفع."
        : detailsReason
    : result.reason;
  const advisory = language === "ar" && result.advisory
    ? "يتم التأكيد النهائي للأهلية عند إتمام الحجز لدى ڤوكس."
    : result.advisory;
  return (
    <div role="status" aria-live="polite" style={{ borderRadius: 10, background: view.background, padding: "9px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: view.color, fontSize: 12, fontWeight: 800 }}>
        <view.Icon size={15} aria-hidden="true" /> {label}
      </div>
      <div style={{ marginTop: 4, color: C.text, fontSize: 11, lineHeight: 1.45 }}>{reason}</div>
      {advisory && <div style={{ marginTop: 4, color: C.muted, fontSize: 10, lineHeight: 1.4 }}>{advisory}</div>}
    </div>
  );
}

function OfferMedia({ media }) {
  const imageUrl = getMediaUrl(media);
  const [imgOk, setImgOk] = React.useState(!!imageUrl);

  React.useEffect(() => setImgOk(!!imageUrl), [imageUrl]);

  return (
    <span aria-hidden="true" style={{ display: "grid", width: 52, height: 40, flexShrink: 0, overflow: "hidden", placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 9, background: C.surfaceAlt, color: C.primary }}>
      {imgOk && imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setImgOk(false)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <CreditCard size={18} />}
    </span>
  );
}

function InfoPill({ children, tone = "primary" }) {
  const palette = tone === "success"
    ? { color: C.green, background: C.successSoft }
    : tone === "warning"
      ? { color: C.warning, background: C.warningSoft }
      : { color: C.primary, background: C.primarySoft };
  return <span style={{ display: "inline-flex", maxWidth: "100%", alignItems: "center", gap: 4, overflowWrap: "anywhere", borderRadius: 999, background: palette.background, padding: "4px 7px", color: palette.color, fontSize: 10, fontWeight: 800, lineHeight: 1.3 }}>{children}</span>;
}

function DetailSection({ title, icon: Icon = Info, children, open = false }) {
  return (
    <details className="offer-detail-section" defaultOpen={open} style={{ borderTop: `1px solid ${C.border}`, padding: "2px 0 1px" }}>
      <summary className="offer-detail-summary" style={{ display: "flex", alignItems: "center", gap: 7, color: C.text, cursor: "pointer", listStyle: "none", fontSize: 12, fontWeight: 800 }}>
        <Icon size={14} aria-hidden="true" color={C.primary} />
        <span style={{ flex: 1 }}>{title}</span>
        <ChevronDown className="offer-detail-chevron" size={14} aria-hidden="true" color={C.muted} />
      </summary>
      <div style={{ padding: "8px 1px 2px" }}>{children}</div>
    </details>
  );
}

function BulletList({ items }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: 0, paddingInlineStart: 18, color: C.text, fontSize: 11, lineHeight: 1.5 }}>
      {items.map((item, index) => <li key={`${item}-${index}`} style={{ marginTop: 4 }}>{item}</li>)}
    </ul>
  );
}

function ChipList({ items, emptyText }) {
  if (!items?.length) return <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.45 }}>{emptyText}</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {items.map((item, index) => <span key={`${item}-${index}`} style={{ maxWidth: "100%", overflowWrap: "anywhere", border: `1px solid ${C.border}`, borderRadius: 999, background: C.surfaceAlt, padding: "4px 7px", color: C.text, fontSize: 10, lineHeight: 1.35 }}>{item}</span>)}
    </div>
  );
}

function ProfileDetails({ offer, profile, language, copy }) {
  const facts = buildProfileFacts(offer, profile, language);
  return (
    <details className="offer-profile-card" style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceAlt, padding: "0 9px" }}>
      <summary className="offer-profile-summary" style={{ display: "flex", alignItems: "center", gap: 6, color: C.text, cursor: "pointer", listStyle: "none", fontSize: 11, fontWeight: 800 }}>
        <span style={{ minWidth: 0, flex: 1 }}>{facts.name}</span>
        <span style={{ maxWidth: "44%", flexShrink: 0, color: C.primary, fontSize: 10, fontWeight: 800, lineHeight: 1.3, textAlign: "end" }}>{facts.benefit}</span>
        <ChevronDown className="offer-detail-chevron" size={13} aria-hidden="true" color={C.muted} />
      </summary>
      <div style={{ padding: "0 0 9px" }}>
        <div style={{ marginBottom: 5, color: C.muted, fontSize: 9, fontWeight: 800 }}>{copy.profileCards}</div>
        <ChipList items={facts.cards} emptyText={copy.noCardList} />
        {facts.experiences.length > 0 && <div style={{ marginTop: 8 }}><div style={{ marginBottom: 5, color: C.muted, fontSize: 9, fontWeight: 800 }}>{copy.experiences}</div><ChipList items={facts.experiences} /></div>}
        {facts.limits.length > 0 && <div style={{ marginTop: 8 }}><div style={{ marginBottom: 3, color: C.muted, fontSize: 9, fontWeight: 800 }}>{copy.limits}</div><BulletList items={facts.limits} /></div>}
        {facts.requirements.length > 0 && <div style={{ marginTop: 8 }}><div style={{ marginBottom: 3, color: C.muted, fontSize: 9, fontWeight: 800 }}>{copy.requirements}</div><BulletList items={facts.requirements} /></div>}
        {facts.restrictions.length > 0 && <div style={{ marginTop: 8 }}><div style={{ marginBottom: 3, color: C.muted, fontSize: 9, fontWeight: 800 }}>{copy.restrictions}</div><BulletList items={facts.restrictions} /></div>}
      </div>
    </details>
  );
}

function CampaignDetails({ offer, language, copy }) {
  if (!offer.campaigns?.length) return null;
  return (
    <DetailSection title={copy.activePromotions} icon={Sparkles} open>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {offer.campaigns.map((campaign) => (
          <div key={campaign.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceAlt, padding: "8px 9px" }}>
            <div className="offer-campaign-heading" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <strong style={{ minWidth: 0, flex: 1, color: C.text, fontSize: 11, lineHeight: 1.4 }}>{localized(campaign.headline, language)}</strong>
              <InfoPill tone={campaign.detailsPublished === false ? "warning" : "primary"}>{campaign.detailsPublished === false ? (language === "ar" ? "شروط غير منشورة" : "Terms not published") : benefitLabel({ ...offer, benefit: campaign.benefit }, null, language)}</InfoPill>
            </div>
            {campaign.detailsPublished === false && <p style={{ margin: "7px 0 0", color: C.muted, fontSize: 9, lineHeight: 1.45 }}>{copy.noPublishedDetails}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 9 }}>
              <a className="offer-official-link" href={campaign.detailUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.primary }}>{copy.officialDetails}<ExternalLink size={11} aria-hidden="true" /></a>
              <a className="offer-official-link" href={campaign.termsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.primary }}>{copy.officialTerms}<ExternalLink size={11} aria-hidden="true" /></a>
              {campaign.validUntil && <span style={{ color: C.muted }}>{copy.validUntil.replace("{date}", campaign.validUntil)}</span>}
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function OfferRow({ offer, expanded, onToggle, selectedProfileId, onProfileChange, language, copy, context }) {
  const isRtl = language === "ar";
  const profile = offer.profiles.find((item) => item.id === selectedProfileId) || null;
  const result = evaluateOfferEligibility(offer, profile, context);
  const facts = buildOfferFacts(offer, language);
  const Arrow = isRtl ? ChevronLeft : ChevronRight;

  return (
    <article style={{ minWidth: 0, overflow: "hidden", borderRadius: 13, border: `1px solid ${expanded ? C.primary : C.border}`, background: C.surface }}>
      <button
        className="offer-row-toggle"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`offer-details-${offer.id}`}
        aria-label={`${expanded ? copy.collapse : copy.expand}: ${localized(offer.bank, language)}`}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, border: 0, background: "transparent", padding: "11px 12px", color: C.text, textAlign: isRtl ? "right" : "left", cursor: "pointer" }}
      >
        <OfferMedia media={getOfferMedia(offer)} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", overflow: "hidden", color: C.text, fontSize: 13, fontWeight: 800, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{localized(offer.bank, language)}</span>
          <span style={{ display: "block", marginTop: 2, overflow: "hidden", color: C.muted, fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{localized(offer.headline, language)}{offer.promotionCount > 1 ? ` (${offer.promotionCount})` : ""}</span>
        </span>
        <Arrow size={16} aria-hidden="true" color={C.muted} style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform .15s ease" }} />
      </button>

      {expanded && (
        <div id={`offer-details-${offer.id}`} role="region" aria-label={`${localized(offer.bank, language)} ${copy.activePromotions}`} style={{ borderTop: `1px solid ${C.border}`, padding: "11px 12px 12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 9 }}>
            <InfoPill><Ticket size={10} aria-hidden="true" />{benefitLabel(offer, profile, language)}</InfoPill>
            <InfoPill tone="warning"><ShieldCheck size={10} aria-hidden="true" />{copy.checkoutOnly}</InfoPill>
          </div>

          <p style={{ margin: "0 0 9px", color: C.text, fontSize: 11, lineHeight: 1.55 }}>{facts.summary}</p>
          {!facts.detailsPublished && <div role="note" style={{ marginBottom: 9, borderRadius: 9, background: C.warningSoft, padding: "8px 9px", color: C.warning, fontSize: 10, lineHeight: 1.45 }}>{copy.noPublishedDetails}</div>}

          {!offer.profiles.some((item) => item.noCardRequired) && (
            <label style={{ display: "block", marginBottom: 7 }}>
              <span style={{ display: "block", marginBottom: 5, color: C.muted, fontSize: 10, fontWeight: 700 }}>{copy.cardLabel}</span>
              <select
                className="offer-card-select"
                value={selectedProfileId || ""}
                onChange={(event) => onProfileChange(event.target.value)}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 9, outlineOffset: 2, background: C.surface, padding: "8px 9px", color: C.text, fontSize: 11 }}
              >
                <option value="">{copy.chooseCard}</option>
                {offer.profiles.map((item) => <option key={item.id} value={item.id}>{localized(item.name, language)}</option>)}
              </select>
            </label>
          )}

          {profile || offer.profiles.some((item) => item.noCardRequired)
            ? <Status result={result} copy={copy} language={language} />
            : <div role="note" style={{ borderRadius: 9, background: C.primarySoft, padding: "8px 9px", color: C.text, fontSize: 10, lineHeight: 1.45 }}>{copy.notSelected}</div>}

          <CampaignDetails offer={offer} language={language} copy={copy} />

          {offer.id === "citibank" && (
            <div role="note" style={{ marginTop: 9, borderRadius: 9, background: C.warningSoft, padding: "9px 10px", color: C.warning, fontSize: 11, lineHeight: 1.5 }}>
              {copy.citiSourceBoundary}
            </div>
          )}

          <DetailSection title={copy.cardTiers} icon={CreditCard}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {offer.profiles.map((item) => <ProfileDetails key={item.id} offer={offer} profile={item} language={language} copy={copy} />)}
            </div>
          </DetailSection>

          <DetailSection title={copy.redemption} icon={ListChecks}>
            <BulletList items={facts.redemptionSteps} />
          </DetailSection>

          {facts.foodBenefit && (
            <DetailSection title={copy.food} icon={Sparkles}>
              <p style={{ margin: 0, color: C.text, fontSize: 10, lineHeight: 1.5 }}>{facts.foodBenefit}</p>
            </DetailSection>
          )}

          <DetailSection title={copy.officialTerms} icon={ShieldCheck}>
            <BulletList items={facts.commonTerms} />
            <p style={{ margin: "7px 0 0", color: C.muted, fontSize: 9, lineHeight: 1.45 }}>{facts.checkoutBoundary}</p>
            {!offer.campaigns?.some((campaign) => campaign.validUntil) && <p style={{ margin: "7px 0 0", color: C.muted, fontSize: 10 }}>{copy.noExpiry}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: 10 }}>
              <a className="offer-official-link" href={offer.detailUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.primary }}>{copy.officialDetails}<ExternalLink size={11} aria-hidden="true" /></a>
              <a className="offer-official-link" href={offer.termsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.primary }}>{copy.officialTerms}<ExternalLink size={11} aria-hidden="true" /></a>
              <span style={{ color: C.muted }}>{copy.termsChecked}: {offer.verifiedDate}</span>
            </div>
          </DetailSection>
        </div>
      )}
    </article>
  );
}

export function OffersPanel({
  locale = "en",
  context = {},
  cinemaName = "",
  experience = "",
  onBack,
  initialQuery = "",
  initialOfferId = "",
  initialProfileId = "",
  onSelectionChange,
  error,
  onRetry,
}) {
  const language = String(locale).toLowerCase().startsWith("ar") ? "ar" : "en";
  const copy = COPY[language];
  const isRtl = language === "ar";
  const [query, setQuery] = React.useState(initialQuery);
  const firstMatch = React.useMemo(() => searchOffers(initialQuery)[0], [initialQuery]);
  const [expandedId, setExpandedId] = React.useState(initialOfferId || (initialQuery ? firstMatch?.id || "" : ""));
  const [profiles, setProfiles] = React.useState(() => initialOfferId && initialProfileId ? { [initialOfferId]: initialProfileId } : {});
  const [membership, setMembership] = React.useState(() => typeof context.isMember === "boolean" ? context.isMember : null);
  const visibleOffers = React.useMemo(() => searchOffers(query), [query]);
  const contextWithMembership = { ...context, cinemaName: cinemaName || context.cinemaName, experience: experience || context.experience, isMember: membership };
  const resolvedContext = { ...contextWithMembership, fingerprint: offerContextFingerprint(contextWithMembership) };
  const touchpointsOnly = visibleOffers.length === 1 && visibleOffers[0]?.id === "adcb-touchpoints";

  React.useEffect(() => {
    setQuery(initialQuery);
    const nextOfferId = initialOfferId || (initialQuery ? firstMatch?.id || "" : "");
    setExpandedId(nextOfferId);
    setProfiles(initialOfferId && initialProfileId ? { [initialOfferId]: initialProfileId } : {});
  }, [firstMatch?.id, initialOfferId, initialProfileId, initialQuery]);

  React.useEffect(() => {
    setMembership(typeof context.isMember === "boolean" ? context.isMember : null);
  }, [context.fingerprint, context.isMember]);

  return (
    <section className="offers-panel" dir={isRtl ? "rtl" : "ltr"} aria-labelledby="offers-heading" style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={copy.back} style={iconButton}>
            {isRtl ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
          </button>
        )}
        <span aria-hidden="true" style={{ display: "grid", width: 34, height: 34, placeItems: "center", borderRadius: 9, background: C.primarySoft, color: C.primary }}><CreditCard size={17} /></span>
        <div className="offers-panel-header-copy" style={{ minWidth: 0, flex: 1 }}>
          <h2 id="offers-heading" style={{ margin: 0, color: C.text, fontSize: 16, lineHeight: 1.2 }}>{copy.title}</h2>
          <div style={{ marginTop: 2, color: C.muted, fontSize: 11, lineHeight: 1.35 }}>{copy.subtitle.replace("{promotions}", OFFER_META.promotionCount).replace("{issuers}", OFFER_META.issuerCount)}</div>
        </div>
      </header>

      <label className="offers-search-field" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 11, background: C.surface, padding: "8px 10px" }}>
        <Search size={15} aria-hidden="true" color={C.muted} />
        <span style={srOnly}>{copy.searchLabel}</span>
        <input
          className="offers-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          style={{ minWidth: 0, flex: 1, border: 0, background: "transparent", color: C.text, fontSize: 14, textAlign: isRtl ? "right" : "left" }}
        />
      </label>

      <label className="offer-membership-control" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(150px, 190px)", alignItems: "center", gap: 8, marginBottom: 9, color: C.muted, fontSize: 11 }}>
        <span style={{ flex: 1, fontWeight: 700 }}>{copy.membershipLabel}</span>
        <select
          className="offer-membership-select"
          value={membership === true ? "member" : membership === false ? "guest" : ""}
          onChange={(event) => {
            const nextMembership = event.target.value === "member" ? true : event.target.value === "guest" ? false : null;
            setMembership(nextMembership);
            const selectedOffer = OFFERS.find((item) => item.id === expandedId);
            const selectedProfile = selectedOffer?.profiles.find((item) => item.id === profiles[expandedId])
              || selectedOffer?.profiles.find((item) => item.noCardRequired)
              || null;
            const nextContextBase = { ...resolvedContext, isMember: nextMembership };
            const nextContext = { ...nextContextBase, fingerprint: offerContextFingerprint(nextContextBase) };
            if (selectedOffer && selectedProfile) onSelectionChange?.(evaluateOfferEligibility(selectedOffer, selectedProfile, nextContext));
          }}
          style={{ width: "100%", maxWidth: 190, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, padding: "8px", color: C.text, fontSize: 12 }}
        >
          <option value="">{copy.membershipUnknown}</option>
          <option value="member">{copy.membershipMember}</option>
          <option value="guest">{copy.membershipGuest}</option>
        </select>
      </label>

      <p style={{ margin: "0 1px 10px", color: C.muted, fontSize: 11, lineHeight: 1.4 }}>{touchpointsOnly ? copy.guestTerm : copy.commonTerm}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {!error && visibleOffers.map((offer) => (
          <OfferRow
            key={offer.id}
            offer={offer}
            expanded={expandedId === offer.id}
            onToggle={() => {
              const isOpening = expandedId !== offer.id;
              setExpandedId((current) => current === offer.id ? "" : offer.id);
              if (isOpening) {
                const profile = offer.profiles.find((item) => item.id === profiles[offer.id])
                  || offer.profiles.find((item) => item.noCardRequired)
                  || null;
                if (profile) onSelectionChange?.(evaluateOfferEligibility(offer, profile, resolvedContext));
              }
            }}
            selectedProfileId={profiles[offer.id] || ""}
            onProfileChange={(profileId) => {
              setProfiles((current) => ({ ...current, [offer.id]: profileId }));
              const profile = offer.profiles.find((item) => item.id === profileId) || null;
              onSelectionChange?.(evaluateOfferEligibility(offer, profile, resolvedContext));
            }}
            language={language}
            copy={copy}
            context={resolvedContext}
          />
        ))}
        {error && <div role="alert" style={{ border: `1px dashed ${C.warning}`, borderRadius: 11, background: C.warningSoft, padding: 18, color: C.text, fontSize: 11, textAlign: "center" }}>
          <div>{language === "ar" ? "تعذر تحميل عروض البطاقات." : "Card offers could not be loaded."}</div>
          {onRetry && <button className="offer-retry-button" type="button" onClick={onRetry} style={{ display: "inline-flex", minHeight: 44, alignItems: "center", gap: 5, marginTop: 9, border: 0, borderRadius: 8, background: C.primary, padding: "8px 12px", color: C.onPrimary, cursor: "pointer", fontSize: 11 }}><RefreshCw size={12} aria-hidden="true" />{language === "ar" ? "حاول مرة أخرى" : "Try again"}</button>}
        </div>}
        {!error && !visibleOffers.length && <div role="status" style={{ border: `1px dashed ${C.border}`, borderRadius: 11, background: C.surfaceAlt, padding: 18, color: C.muted, fontSize: 11, textAlign: "center" }}>{copy.noResults}</div>}
      </div>

      <footer style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, color: C.muted, fontSize: 10, lineHeight: 1.5 }}>
        <div>{localized(OFFER_META.disclaimer, language)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 5 }}>
          <span>{copy.verified}: <time dateTime={OFFER_META.verifiedDate}>{OFFER_META.verifiedDate}</time></span>
          <a className="offer-official-link" href={OFFER_META.sourceUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.primary }}>{copy.source}<ExternalLink size={10} aria-hidden="true" /></a>
        </div>
        <details style={{ marginTop: 5 }}>
          <summary className="offer-footer-summary" style={{ cursor: "pointer" }}>{language === "ar" ? "الشروط العامة" : "Common terms"}</summary>
          <ul style={{ margin: "5px 0 0", paddingInlineStart: 17 }}>
            {(touchpointsOnly ? COMMON_OFFER_TERMS[language].slice(1) : COMMON_OFFER_TERMS[language]).map((term, index) => <li key={`${term}-${index}`} style={{ marginTop: 3 }}>{term}</li>)}
          </ul>
        </details>
      </footer>
    </section>
  );
}

const iconButton = { display: "grid", width: 44, height: 44, flexShrink: 0, placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 9, outlineOffset: 2, background: C.surfaceAlt, color: C.primary, cursor: "pointer" };
const srOnly = { position: "absolute", width: 1, height: 1, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap" };

export default OffersPanel;
