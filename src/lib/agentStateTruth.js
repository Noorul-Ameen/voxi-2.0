const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const seatEditRefusal = (value) => /\b(?:can(?:not|'t)|unable to)\b[\s\S]{0,80}\b(?:change|edit|add|remove)\b[\s\S]{0,80}\bseats?\b|\b(?:new|another) booking\b[\s\S]{0,80}\b(?:change|edit|add|remove|seat)\b|(?:لا يمكن|لا أستطيع|لا استطيع)[\s\S]{0,80}(?:تغيير|تعديل|إضافة|اضافة|حذف)[\s\S]{0,80}(?:المقاعد|مقعد)/iu.test(value);

const bookingConfirmationClaim = (value) => {
  if (/\b(?:not|isn't|is not|has not been)\s+confirmed\b|\bnot confirmed yet\b|(?:لم يتم|غير)\s+تأكيد\s+الحجز/iu.test(value)) return false;
  return /\b(?:booking|reservation)\b[\s\S]{0,140}\b(?:is\s+|has been\s+|was\s+)?(?:confirmed|completed|successful)\b|\b(?:confirmed|completed|successful)\b[\s\S]{0,100}\b(?:booking|reservation)\b|(?:تم تأكيد|تأكد|اكتمل)[\s\S]{0,80}(?:الحجز|حجزك)/iu.test(value);
};

const paymentCompletionClaim = (value) => /\bpayment\b[\s\S]{0,80}\b(?:was|is|has been)?\s*(?:charged|processed|completed|successful|approved)\b|\b(?:charged|processed|completed)\b[\s\S]{0,80}\bpayment\b|(?:تم|اكتملت)[\s\S]{0,50}(?:عملية الدفع|الدفع بنجاح)/iu.test(value);
const referenceCreationClaim = (value) => /\b(?:booking reference|reservation reference|reference number|qr code)\b[\s\S]{0,80}\b(?:is|created|generated|ready)\b|(?:مرجع الحجز|رقم الحجز|رمز QR)[\s\S]{0,80}(?:جاهز|تم إنشاؤه|هو)/iu.test(value);
const admissionReadyClaim = (value) => /\b(?:tickets?|admission|reservation)\b[\s\S]{0,60}\b(?:is|are)\s+ready\b|\b(?:use|scan|show)\b[\s\S]{0,50}\bqr(?:\s+code)?\b[\s\S]{0,70}\b(?:admission|entry|enter|cinema)\b|(?:التذكرة|التذاكر|الدخول|الحجز)[\s\S]{0,60}(?:جاهز|جاهزة|جاهزة للدخول)|(?:استخدم|امسح|اعرض)[\s\S]{0,50}(?:رمز QR)[\s\S]{0,60}(?:للدخول|السينما)/iu.test(value);
const seatMapDisplayClaim = (value) => /\b(?:displayed|shown|opened)\b[\s\S]{0,90}\bseat map\b|\bseat map\b[\s\S]{0,90}\b(?:displayed|shown|open|on (?:the )?screen)\b|(?:عرضت|فتحت|تظهر)[\s\S]{0,80}(?:خريطة المقاعد)/iu.test(value);
const bookingSummaryDisplayClaim = (value) => /\b(?:displayed|shown|created|opened)\b[\s\S]{0,90}\bbooking summary\b|\bbooking summary\b[\s\S]{0,90}\b(?:displayed|shown|created|open|on (?:the )?screen)\b|(?:عرضت|أنشأت|انشأت|فتحت)[\s\S]{0,80}(?:ملخص الحجز)/iu.test(value);
const checkoutInstructionClaim = (value) => /\b(?:complete|finish|continue)\b[\s\S]{0,60}\b(?:your\s+|the\s+)?booking\b[\s\S]{0,60}\b(?:screen|checkout)\b|(?:أكمل|اكمل|تابع)[\s\S]{0,50}(?:الحجز|حجزك)[\s\S]{0,50}(?:الشاشة|الدفع)/iu.test(value);
const checkoutDisplayClaim = (value) => /\bcheckout\b[\s\S]{0,70}\b(?:displayed|shown|open|on (?:the )?screen)\b|\b(?:displayed|shown|opened)\b[\s\S]{0,70}\bcheckout\b|(?:شاشة الدفع|الدفع)[\s\S]{0,60}(?:مفتوحة|ظاهرة|معروضة)/iu.test(value);
const referenceOnlyCancellationPrompt = (value) => /\b(?:need|provide|enter|give|have)\b[\s\S]{0,55}\b(?:booking\s+)?(?:reference|ref(?:erence)?\s+number)\b|\bwhat(?:'s| is)\s+(?:the|your)\s+(?:booking\s+)?(?:reference|ref(?:erence)?\s+number)\b|\bdo you have (?:it|the reference)\b|(?:احتاج|أحتاج|أدخل|ادخل|زودني|اعطني|هل لديك|ما هو|ما هي)[\s\S]{0,55}(?:مرجع الحجز|رقم الحجز|المرجع)/iu.test(value);

function orderSeatLabels(stage, pendingOrder) {
  const order = pendingOrder || stage?.order || {};
  return Array.isArray(order.seats) ? order.seats.map((seat) => clean(seat).toUpperCase()).filter(Boolean) : [];
}

function mismatchedCheckoutFacts(value, stage, pendingOrder) {
  const expectedSeats = orderSeatLabels(stage, pendingOrder);
  const claimsSeats = /\b(?:selected|chosen|your)\s+seats?\b|(?:المقاعد\s+(?:المحددة|المختارة)|مقاعدك)/iu.test(value);
  if (claimsSeats && expectedSeats.length) {
    const claimedSeats = [...value.matchAll(/\b([A-Z]\d{1,2})\b/giu)].map((match) => match[1].toUpperCase());
    if (claimedSeats.length && (claimedSeats.length !== expectedSeats.length || claimedSeats.some((seat) => !expectedSeats.includes(seat)))) return true;
  }

  const expectedTotal = Number((pendingOrder || stage?.order)?.total);
  const amountMatch = value.match(/(?:AED\s*([0-9]+(?:\.[0-9]{1,2})?)|([0-9]+(?:\.[0-9]{1,2})?)\s*AED)\b/iu);
  const claimedTotal = Number(amountMatch?.[1] || amountMatch?.[2]);
  return Number.isFinite(expectedTotal) && Number.isFinite(claimedTotal) && Math.abs(expectedTotal - claimedTotal) > 0.009;
}

function checkoutGuidance(stage, pendingOrder, locale) {
  const order = pendingOrder || stage?.order || {};
  const seats = Array.isArray(order.seats) ? order.seats.filter(Boolean) : [];
  if (locale === "ar") {
    return `${seats.length ? `المقاعد المحددة ${seats.join("، ")} ظاهرة في شاشة الدفع. ` : "المقاعد المحددة ظاهرة في شاشة الدفع. "}أكمل خطوة الدفع على الشاشة، أو اختر تعديل المقاعد لتغييرها. لم يتم تأكيد الحجز بعد.`;
  }
  return `${seats.length ? `Your selected seats ${seats.join(", ")} are shown in checkout. ` : "Your selected seats are shown in checkout. "}Complete the on-screen payment step, or choose Edit seats to change them. The booking is not confirmed yet.`;
}

function seatMapGuidance(locale) {
  return locale === "ar"
    ? "خريطة المقاعد مفتوحة ويمكنك تعديل اختيارك. اختر المقاعد التي تريدها، ثم أكدها للعودة إلى الدفع. لم يتم تأكيد الحجز بعد."
    : "The seat map is open and your seats are editable. Select the seats you want, then confirm them to return to checkout. The booking is not confirmed yet.";
}

function savedSummaryGuidance(booking, locale) {
  const title = clean(booking?.movieTitle);
  const ref = clean(booking?.ref);
  if (locale === "ar") {
    return `تم حفظ ملخص الحجز${title ? ` لفيلم ${title}` : ""} على هذا الجهاز${ref ? ` بالمرجع ${ref}` : ""}. لم يتم تحصيل أي دفعة أو إرسال حجز إلى السينما.`;
  }
  return `Your booking summary${title ? ` for ${title}` : ""} is saved on this device${ref ? ` with reference ${ref}` : ""}. No payment was charged and no cinema reservation was submitted.`;
}

function cancelledSummaryGuidance(booking, locale) {
  const title = clean(booking?.movieTitle);
  const ref = clean(booking?.ref);
  if (locale === "ar") {
    return `تم وضع علامة ملغي على ملخص الحجز${title ? ` لفيلم ${title}` : ""} على هذا الجهاز${ref ? ` بالمرجع ${ref}` : ""}. لم تتم معالجة استرداد أي مبلغ أو إرسال إلغاء إلى السينما.`;
  }
  return `The booking summary${title ? ` for ${title}` : ""}${ref ? ` with reference ${ref}` : ""} is marked cancelled on this device. No refund was processed and no cancellation was sent to the cinema.`;
}

function historyGuidance(locale) {
  return locale === "ar"
    ? "ملخصات حجوزاتك المحفوظة على هذا الجهاز ظاهرة الآن. اختر حجزاً لعرض التفاصيل، أو استخدم زر إلغاء الحجز الخاص به."
    : "Your current on-device booking summaries are shown. Select one to view its details, or use its Cancel booking button.";
}

function wrongDiscoveryQuestion(value, stage) {
  if (stage?.view !== "discovery" || !stage?.missing?.[0] || !stage.question) return false;
  const asksCinema = /\b(?:which|what)\b[\s\S]{0,30}\b(?:cinema|location)\b|\bwhere\b[\s\S]{0,30}\b(?:watch|cinema|location)\b|(?:أي|اي|ما)\s+(?:سينما|موقع)|وين[\s\S]{0,20}(?:سينما|موقع)/iu.test(value);
  const asksDate = /\b(?:which|what)\s+(?:date|day)\b|\bwhen\b[\s\S]{0,30}\b(?:go|visit|watch)\b|(?:ما|أي|اي)\s+(?:التاريخ|تاريخ|يوم)|متى/iu.test(value);
  const asksPreference = /\b(?:which|what)\s+(?:movie|film|time|showtime|genre|language|experience)\b|\bwhat would you prefer\b|\bwhat are you in the mood for\b|(?:أي|اي|ما)\s+(?:فيلم|وقت|موعد|نوع|لغة|تجربة)|ماذا تفضل/iu.test(value);
  if (stage.missing[0] === "cinema") return asksDate || asksPreference;
  if (stage.missing[0] === "date") return asksCinema || asksPreference;
  if (stage.missing[0] === "preference") return asksCinema || asksDate;
  return false;
}

export function guardAgentStateClaim(text, { stage = {}, pendingOrder = null, locale = "en" } = {}) {
  const value = clean(text);
  if (!value) return value;

  if (wrongDiscoveryQuestion(value, stage)) return clean(stage.question);

  if (stage?.view === "history"
    && stage?.purpose === "cancellation_target_selection"
    && Array.isArray(stage.candidateRefs)
    && stage.candidateRefs.length
    && referenceOnlyCancellationPrompt(value)) {
    return locale === "ar"
      ? "اختر أحد الحجوزات الحالية الظاهرة باسم الفيلم أو بمرجع الحجز."
      : "Choose one of the current bookings shown, by movie title or booking reference.";
  }

  const editableCheckout = stage?.view === "checkout" || Boolean(pendingOrder?.checkoutId);
  const editableSeatMap = stage?.view === "seatmap";
  if (seatEditRefusal(value) && editableCheckout) {
    return locale === "ar"
      ? "يمكنك تغيير المقاعد قبل إكمال الدفع. اختر تعديل المقاعد على الشاشة، أو قل تعديل المقاعد."
      : "You can change seats before completing checkout. Choose Edit seats on screen, or say edit seats.";
  }
  if (seatEditRefusal(value) && editableSeatMap) return seatMapGuidance(locale);

  if (editableCheckout && mismatchedCheckoutFacts(value, stage, pendingOrder)) {
    return checkoutGuidance(stage, pendingOrder, locale);
  }

  if (seatMapDisplayClaim(value) && stage?.view !== "seatmap") {
    if (editableCheckout) return checkoutGuidance(stage, pendingOrder, locale);
    if (stage?.view === "showtimes") {
      return locale === "ar"
        ? "اختر موعد عرض محدداً من الخيارات الظاهرة لفتح خريطة المقاعد."
        : "Choose one exact displayed showtime to open the seat map.";
    }
    return clean(stage?.question || stage?.error) || (locale === "ar"
      ? "خريطة المقاعد غير معروضة بعد."
      : "The seat map is not displayed yet.");
  }


  if (checkoutDisplayClaim(value) && stage?.view !== "checkout") {
    if (editableSeatMap) return seatMapGuidance(locale);
    const booking = stage?.booking || null;
    if (booking?.cancelled || String(booking?.bookingStatus || "").startsWith("cancelled")) {
      return cancelledSummaryGuidance(booking, locale);
    }
    if (booking) return savedSummaryGuidance(booking, locale);
    return clean(stage?.question || stage?.error) || (locale === "ar"
      ? "شاشة الدفع غير معروضة بعد. تابع من الخطوة الظاهرة على الشاشة."
      : "Checkout is not displayed yet. Continue from the step shown on screen.");
  }

  const transactionClaim = bookingConfirmationClaim(value)
    || paymentCompletionClaim(value)
    || referenceCreationClaim(value)
    || admissionReadyClaim(value)
    || bookingSummaryDisplayClaim(value)
    || checkoutInstructionClaim(value);
  if (!transactionClaim) return value;
  if (stage?.view === "history") return historyGuidance(locale);
  if (editableCheckout) return checkoutGuidance(stage, pendingOrder, locale);
  if (editableSeatMap) return seatMapGuidance(locale);

  const booking = stage?.booking || null;
  const isCancelledSummary = Boolean(booking && (
    booking.cancelled === true
    || String(booking.bookingStatus || "").startsWith("cancelled")
  ));
  if (isCancelledSummary) return cancelledSummaryGuidance(booking, locale);
  const isSavedSummary = Boolean(booking && (
    booking.verified !== true
    || booking.demo === true
    || booking.paymentStatus === "simulated_not_charged"
    || booking.bookingStatus === "confirmed_demo"
    || booking.bookingStatus === "summary_saved"
  ));
  if (isSavedSummary) return savedSummaryGuidance(booking, locale);
  if (stage?.view !== "booking") {
    return clean(stage?.question || stage?.error) || (locale === "ar"
      ? "لم يتم تأكيد الحجز بعد. تابع من الخطوة الظاهرة على الشاشة."
      : "The booking is not confirmed yet. Continue from the step shown on screen.");
  }
  return value;
}
