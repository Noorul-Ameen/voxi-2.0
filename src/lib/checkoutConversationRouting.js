const clean = (value) => String(value || "")
  .normalize("NFKC")
  .replace(/\s+/g, " ")
  .replace(/[.!?,،؟]+$/gu, "")
  .trim();

export function isCheckoutSeatEditTurn(value) {
  const text = clean(value);
  if (!text) return false;

  const backToSeats = /^(?:(?:please\s+)?(?:go|take\s+me|come|move)\s+back|(?:please\s+)?(?:return|back))\s+(?:back\s+)?to\s+(?:the\s+)?(?:seat\s*map|seats?)$/iu;
  const shortBack = /^(?:(?:please\s+)?(?:go\s+)?back|ارجع|أرجع|العودة|عد)(?:\s+(?:إلى|الى|ل)\s*(?:المقاعد|خريطة\s+المقاعد))?$/iu;
  if (backToSeats.test(text) || shortBack.test(text)) return true;

  const englishEdit = /^(?:(?:i\s+(?:want|need|would\s+like)\s+to|can\s+i|could\s+i|would\s+you|can\s+you|please)\s+)?(?:edit|change|modify|update|add|remove)(?:\s+(?:one|a|another|\d+)\s+more)?\s+(?:my\s+|the\s+)?(?:seat|seats|seat\s*map)(?:\s+to\s+[a-z]\d+(?:\s*(?:,|and)\s*[a-z]\d+)*)?$/iu;
  const englishSeatLabelEdit = /^(?:(?:please\s+)?(?:add|remove|change|replace|swap)\s+)(?:seat\s+)?[a-z]\d+(?:\s*(?:,|and|with|to)\s*(?:seat\s+)?[a-z]\d+)*$/iu;
  if (englishEdit.test(text) || englishSeatLabelEdit.test(text)) return true;

  return /^(?:(?:أريد|اريد|أحتاج|احتاج|هل\s+يمكنني|هل\s+تستطيع|من\s+فضلك)\s+)?(?:تعديل|تغيير|غيّر|غير|إضافة|اضافة|أضف|اضف|حذف|احذف)\s+(?:المقاعد|مقعد|المقعد)(?:\s+[a-z]\d+)?$/iu.test(text);
}
