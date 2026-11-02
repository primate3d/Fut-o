import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const CDISCOUNT_SOURCE_URL =
  "https://www.cdiscount.com/cdiscount-mobile/v-164-0.html";

export function parseCdiscountOffers(
  html: string,
  retrievedAt: string,
): CollectorResult {
  const pageText = htmlToText(html);
  const matcher =
    /(\d+(?:[,.]\d+)?)\s*Go\s+(\d+)\s*€\s*(\d{2})\s*\/mois\s+Sans engagement([\s\S]*?)(?=\d+(?:[,.]\d+)?\s*Go\s+\d+\s*€|Des forfaits Cdiscount|$)/gi;
  const offers: MobileOffer[] = [];
  for (const match of pageText.matchAll(matcher)) {
    const data = Number(match[1].replace(",", "."));
    const segment = match[4];
    const euMatch = segment.match(/\+(\d+(?:[,.]\d+)?)\s*Go[^.]{0,80}(?:Europe|destinations)/i);
    const simMatch = segment.match(/Carte SIM(?: à)?\s*(\d+(?:[,.]\d+)?)€/i);
    offers.push({
      provider: "Cdiscount Mobile",
      offerName: `Forfait Cdiscount Mobile ${data.toLocaleString("fr-FR")} Go`,
      monthlyPrice: Number(`${match[2]}.${match[3]}`),
      includedDataGB: data,
      unlimitedData: false,
      euDataGB: parseFrenchAmount(euMatch?.[1]),
      network: /réseau\s+Bouygues Telecom/i.test(pageText)
        ? "Réseau Bouygues Telecom"
        : null,
      technology: /5G/i.test(segment) ? "5G" : "4G",
      commitmentMonths: 0,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: parseFrenchAmount(simMatch?.[1]),
      conditionalPrices: [],
      pricingTiers: [],
      conditions: ["Offre publiée pour l'ouverture d'une nouvelle ligne."],
      evidence: [match[0].slice(0, 360)],
      sourceUrl: CDISCOUNT_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    });
  }

  if (offers.length === 0) {
    return {
      provider: "Cdiscount Mobile",
      sourceUrl: CDISCOUNT_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "La page renvoyée ne contient pas de cartes d'offres exploitables (coquille JavaScript possible).",
        sourceUrl: CDISCOUNT_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, CDISCOUNT_SOURCE_URL);
  return {
    provider: "Cdiscount Mobile",
    sourceUrl: CDISCOUNT_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectCdiscountOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseCdiscountOffers(
      await fetchOfficialHtml(CDISCOUNT_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "Cdiscount Mobile",
      sourceUrl: CDISCOUNT_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: CDISCOUNT_SOURCE_URL,
      }],
    };
  }
}
