import { fetchOfficialHtml } from "../fetch";
import { cleanText, htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const LYCA_SOURCE_URL =
  "https://www.lycamobile.fr/fr/bundles/forfait-prepaye/";

export function parseLycaOffers(html: string, retrievedAt: string): CollectorResult {
  const pageText = htmlToText(html);
  const headingPattern =
    /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/gi;
  const offers: MobileOffer[] = [];

  for (const match of html.matchAll(headingPattern)) {
    const offerName = cleanText(match[1]);
    const segment = htmlToText(match[2]);
    const priceMatch = segment.match(
      /(\d+(?:[,.]\d+)?)\s*Go\s*[—–-]\s*(\d+(?:[,.]\d+)?)\s*(?:EUR|€)\s*\/\s*30\s*(?:days|jours)/i,
    );
    if (!priceMatch || !/(?:forfait|international|pass)/i.test(offerName)) continue;

    const euMatch = segment.match(
      /(\d+(?:[,.]\d+)?)\s*Go[^.]{0,100}(?:Europe|UE|itinérance)/i,
    );
    const simOffered = /SIM\s*\/\s*eSIM\s+OFFERTE/i.test(segment);
    offers.push({
      provider: "Lyca Mobile",
      offerName,
      monthlyPrice: parseFrenchAmount(priceMatch[2]),
      includedDataGB: parseFrenchAmount(priceMatch[1]),
      unlimitedData: false,
      euDataGB: parseFrenchAmount(euMatch?.[1]),
      network: /Bouygues Telecom/i.test(pageText)
        ? "Réseau Bouygues Telecom"
        : "Réseau Lyca Mobile",
      technology: /5G/i.test(`${offerName} ${pageText.slice(0, 500)}`) ? "5G" : null,
      commitmentMonths: /sans engagement/i.test(pageText) ? 0 : null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: /activation gratuite/i.test(pageText) ? 0 : null,
      simFees: simOffered ? 0 : null,
      conditionalPrices: [],
      pricingTiers: [],
      conditions: [
        "Forfait prépayé valable 30 jours; cette période ne correspond pas toujours à un mois civil.",
        "Le renouvellement automatique peut être désactivé depuis l'espace client Lyca Mobile.",
        ...(!simOffered ? ["Le coût de la SIM ou eSIM n'est pas confirmé pour cette offre."] : []),
      ],
      evidence: [`${offerName}; ${priceMatch[0]}; ${segment.slice(0, 260)}`],
      offerUrl: null,
      sourceUrl: LYCA_SOURCE_URL,
      billingPeriodDays: 30,
      autoRenewal: true,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    });
  }

  if (offers.length === 0) {
    return {
      provider: "Lyca Mobile",
      sourceUrl: LYCA_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Forfaits prépayés Lyca Mobile introuvables.",
        sourceUrl: LYCA_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, LYCA_SOURCE_URL);
  return {
    provider: "Lyca Mobile",
    sourceUrl: LYCA_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectLycaOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseLycaOffers(
      await fetchOfficialHtml(LYCA_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "Lyca Mobile",
      sourceUrl: LYCA_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: LYCA_SOURCE_URL,
      }],
    };
  }
}
