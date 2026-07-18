import { resolveFaqQuery } from "./faqResolver.js";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function stableJson(value) {
  try {
    return JSON.stringify(stableValue(value));
  } catch {
    return "unavailable";
  }
}

function sourceLine(sources) {
  return sources.map((source) => `${source.title} (${source.url})`).join("; ");
}

function resultBlock(result, locale, liveData) {
  const entry = result.entry || result;
  const answer = typeof result.answer === "string" ? result.answer : entry.answer?.[locale] || entry.answer?.en || "";
  const lines = [
    `[${entry.id} | ${entry.topic} | ${entry.delivery.kind.toUpperCase()}]`,
    `Approved answer (${locale}): ${answer}`,
  ];

  if (entry.delivery.kind === "api") {
    lines.push(`Live provider: ${entry.delivery.provider}`);
    lines.push(`Live-data rule: ${entry.delivery.instruction?.[locale] || entry.delivery.instruction?.en}`);
    const supplied = liveData?.[entry.id];
    lines.push(supplied === undefined
      ? "Live result: NOT SUPPLIED. Ask for the missing selection or call the existing provider; never invent a current value."
      : `Live result: ${stableJson(supplied)}`);
  }

  lines.push(`Audience: ${entry.metadata.audience.join(", ")}`);
  lines.push(`Verified: ${entry.metadata.update.reviewedAt}; freshness: ${entry.metadata.update.freshness}`);
  if (entry.metadata.provenance === "product") {
    lines.push("Capability basis: current Voxi in-product behavior. Present this as a Voxi capability, not as VOX policy or an external service guarantee.");
  } else {
    lines.push(`Official source: ${sourceLine(entry.metadata.source)}`);
  }
  return lines.join("\n");
}

export function serializeFaqContext(results, {
  locale = "en",
  liveData = {},
  maxChars = 6000,
} = {}) {
  const activeLocale = locale === "ar" ? "ar" : "en";
  const safeMax = Math.max(500, Number(maxChars) || 6000);
  const header = [
    "VOX CINEMAS UAE: CURATED GENERAL-ENQUIRY CONTEXT",
    `Reply language: ${activeLocale === "ar" ? "Arabic" : "English"}. Do not infer or switch language from the query text.`,
    "Use static facts as written. For API entries, use only supplied live results or the named existing provider.",
    "Do not read provenance URLs aloud unless the guest asks for the source.",
  ].join("\n");

  let output = header;
  for (const result of results || []) {
    const block = `\n\n${resultBlock(result, activeLocale, liveData)}`;
    if (output.length + block.length > safeMax) break;
    output += block;
  }
  return output.slice(0, safeMax);
}

export function buildFaqContextForQuery(queryText, {
  locale = "en",
  audience = "all",
  limit = 3,
  minScore = 25,
  liveData = {},
  maxChars = 6000,
  entries,
} = {}) {
  const matches = resolveFaqQuery(queryText, { locale, audience, limit, minScore, entries });
  return Object.freeze({
    matches,
    context: serializeFaqContext(matches, { locale, liveData, maxChars }),
  });
}
