export const isResumeOnlyTurn = (value) => /^(?:continue|resume|go on|carry on|متابعة|تابع|اكمل|أكمل)(?:\s+(?:please|من فضلك))?[.!?،]*$/iu.test(String(value || "").trim());

export const isResumeCheckoutTurn = (value) => /^(?:(?:return|go|take me|back)\s+(?:me\s+)?(?:back\s+)?to\s+(?:the\s+)?(?:checkout|payment)|(?:back|return|resume|continue|complete|finish)\s+(?:the\s+)?(?:checkout|payment)|(?:checkout|payment)\s+(?:again|please)|(?:العودة|ارجع|أرجع|عد)\s+(?:إلى|الى|ل)\s*(?:الدفع|صفحة الدفع)|(?:متابعة|استكمال|اكمال|إكمال)\s+(?:الدفع|عملية الدفع)|(?:الدفع|صفحة الدفع)\s+(?:مرة أخرى|من فضلك))[.!?،]*$/iu.test(String(value || "").trim());

export function pausedResumeTarget(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (isResumeCheckoutTurn(text)) return "checkout";
  if (/\b(?:go|come|take me|return|back)\s+(?:me\s+)?(?:back\s+)?to\s+(?:my|the)?\s*(?:seats?|seat map)|\b(?:show|open)\s+(?:my|the)?\s*seats?\s+(?:again|please)|(?:ارجع|أرجع|عد|العودة)\s+(?:إلى|الى|ل)?\s*(?:مقاعدي|المقاعد|خريطة المقاعد)/iu.test(text)) return "seatmap";
  if (/\b(?:show|open|return|go|back)\s+(?:me\s+)?(?:back\s+)?(?:to\s+)?(?:the\s+)?showtimes?\s*(?:again|please)?|(?:اعرض|أعرض|اظهر|أظهر|ارجع|أرجع|عد)\s+(?:إلى|الى|ل)?\s*(?:مواعيد العرض|العروض)/iu.test(text)) return "showtimes";
  if (/\b(?:continue|resume|return to)\s+(?:my|the|this)?\s*cancell?ation|(?:متابعة|استكمال|اكمال|إكمال)\s+(?:طلب\s+)?(?:الإلغاء|الالغاء)/iu.test(text)) return "cancellation";
  if (/\b(?:show|open|return to)\s+(?:my|the)?\s*(?:booking history|bookings?)\s*(?:again|please)?|(?:اعرض|أعرض|افتح|أظهر)\s+(?:سجل\s+)?حجوزي\s*(?:مرة أخرى)?/iu.test(text)) return "history";
  if (/\bcontinue\s+where\s+i\s+(?:stopped|left off)|(?:تابع|أكمل)\s+من\s+حيث\s+توقفت/iu.test(text)) return "last";
  if (/\b(?:continue|resume)\s+(?:my|the|this)?\s*(?:booking|journey)|(?:متابعة|استكمال|اكمال|إكمال)\s+(?:حجزي|الحجز)/iu.test(text)) return "journey";
  if (isResumeOnlyTurn(text)) return "last";
  return null;
}
