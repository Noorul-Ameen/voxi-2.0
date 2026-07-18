const normalizeDecisionText = (value) => String(value || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/[.!?,;:،؟]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export function resolveCancellationDecision(value) {
  const text = normalizeDecisionText(value);
  if (!text) return null;

  if (/^(?:no|no thanks|no thank you|not now|stop|back|keep it|keep the booking|keep my booking|do not cancel(?: it| this| the booking| my booking)?|dont cancel(?: it| this| the booking| my booking)?|لا|لأ|ليس الآن|تراجع|احتفظ بالحجز|لا تلغ(?:ه|يه|ي الحجز)?)$/u.test(text)) return false;

  if (/^(?:yes|yes please|yeah|yep|sure|okay|ok|confirm|confirmed|proceed|go ahead|do it|cancel it|yes cancel it|yes please cancel it|please cancel it|go ahead and cancel it|confirm cancellation|confirm the cancellation|proceed with cancellation|proceed with the cancellation)(?: now| please)?$/u.test(text)) return true;
  if (/^(?:yes|yeah|yep|sure|okay|ok)(?: please)? (?:go ahead(?: and)? )?(?:cancel|confirm|proceed)(?: with)?(?: it| this| the booking| my booking| this booking| the cancellation)?(?: now| please)?$/u.test(text)) return true;
  if (/^(?:نعم|ايوه|أيوه|أكيد|اكد|أكد|تأكيد|تابع|نفذ|نفّذ)(?: من فضلك)?(?: الغ(?:ه|يه|ي الحجز)| ألغ(?:ه|يه|ي الحجز)| أكد الإلغاء| تابع الإلغاء)?$/u.test(text)) return true;

  return null;
}
