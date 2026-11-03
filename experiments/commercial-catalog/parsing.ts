import type { CommercialEvidence, CommercialSourceDefinition } from "./types";

export function normalizeCommercialText(value: string) {
  return value
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&")
    .replace(/&euro;/gi, "€").replace(/&egrave;/gi, "è").replace(/&eacute;/gi, "é")
    .replace(/&ecirc;/gi, "ê").replace(/&agrave;/gi, "à").replace(/&acirc;/gi, "â")
    .replace(/&ocirc;/gi, "ô").replace(/&ugrave;/gi, "ù").replace(/&ucirc;/gi, "û")
    .replace(/&rsquo;|&apos;/gi, "'").replace(/&deg;/gi, "°")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function commercialDocumentText(html: string, renderedText: string) {
  return `${normalizeCommercialText(renderedText)} ${normalizeCommercialText(html)}`
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function frenchAmount(value: string | null | undefined) {
  if (!value) return null;
  const match = value.replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function excerptAround(text: string, pattern: RegExp, radius = 140) {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return null;
  return text.slice(Math.max(0, match.index - radius), match.index + match[0].length + radius).trim();
}

export function evidence(
  field: string,
  excerpt: string | null | undefined,
  sourceUrl: string,
  capturedAt: string,
): CommercialEvidence[] {
  return excerpt?.trim() ? [{ field, excerpt: excerpt.trim(), sourceUrl, capturedAt }] : [];
}

export function commonOfferFields(
  source: CommercialSourceDefinition,
  offerName: string,
  retrievedAt: string,
  sourceUrl = source.sourceUrl,
) {
  return {
    catalogId: "",
    provider: source.provider,
    offerName,
    sourceUrl,
    retrievedAt,
    verifiedAt: null,
    validFrom: null,
    validUntil: null,
    verificationStatus: "VERIFIED" as const,
    extractionMethod: "deterministic" as const,
    conditions: [] as string[],
    evidence: evidence("offerName", offerName, sourceUrl, retrievedAt),
  };
}
