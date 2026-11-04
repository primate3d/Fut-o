import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const SYMA_SOURCE_URL = "https://www.symamobile.com/forfait";

export function parseSymaOffers(html: string, retrievedAt: string): CollectorResult {
  const pageText = htmlToText(html);
  const matcher =
    /(?:VOTRE COMMANDE\s+)?(?:5G\s+)?(le\s+(?:sept|neuf|douze|quinze))\s+(4G|5G)[\s\S]{0,90}?(\d+)\s*€\s*(\d{2})[^0-9]{0,20}\/mois\s+(\d+(?:[,.]\d+)?)\s*Go/gi;
  const activationMatch = pageText.match(/Frais d['’]activation\s*:\s*(\d+(?:[,.]\d+)?)\s*€/i);
  const offers: MobileOffer[] = [];

  for (const match of pageText.matchAll(matcher)) {
    const data = parseFrenchAmount(match[5]);
    offers.push({
      provider: "Syma Mobile",
      offerName: `Forfait Syma ${match[1]} ${data} Go`,
      monthlyPrice: Number(`${match[3]}.${match[4]}`),
      includedDataGB: data,
      unlimitedData: false,
      euDataGB: null,
      network: "Réseau Syma",
      technology: match[2].toUpperCase(),
      commitmentMonths: /sans engagement/i.test(pageText) ? 0 : null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: parseFrenchAmount(activationMatch?.[1]),
      simFees: null,
      conditionalPrices: [],
      pricingTiers: [],
      conditions: [
        "Souscription d'un mois renouvelée mensuellement par prélèvement.",
        "Le coût distinct de la carte SIM n'est pas confirmé sur la carte de l'offre.",
      ],
      evidence: [match[0].slice(0, 300)],
      offerUrl: null,
      sourceUrl: SYMA_SOURCE_URL,
      billingPeriodDays: null,
      autoRenewal: true,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    });
  }

  if (offers.length === 0) {
    return {
      provider: "Syma Mobile",
      sourceUrl: SYMA_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Cartes de forfaits Syma introuvables.",
        sourceUrl: SYMA_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, SYMA_SOURCE_URL);
  return {
    provider: "Syma Mobile",
    sourceUrl: SYMA_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectSymaOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseSymaOffers(
      await fetchOfficialHtml(SYMA_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "Syma Mobile",
      sourceUrl: SYMA_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: SYMA_SOURCE_URL,
      }],
    };
  }
}
