import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const LEBARA_SOURCE_URL = "https://www.lebara.fr/fr/forfait-mensuel.html";

export function parseLebaraOffers(html: string, retrievedAt: string): CollectorResult {
  const pageText = htmlToText(html);
  const matcher =
    /(\d+(?:[,.]\d+)?)\s*Go[\s\S]{0,100}?(\d+(?:[,.]\d+)?)\s*€\s*\/\s*mois/gi;
  const offers: MobileOffer[] = [];

  for (const match of pageText.matchAll(matcher)) {
    const data = parseFrenchAmount(match[1]);
    offers.push({
      provider: "Lebara",
      offerName: `Forfait Lebara ${data} Go`,
      monthlyPrice: parseFrenchAmount(match[2]),
      includedDataGB: data,
      unlimitedData: false,
      euDataGB: null,
      network: null,
      technology: /5G/i.test(match[0]) ? "5G" : null,
      commitmentMonths: /sans engagement/i.test(pageText) ? 0 : null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: null,
      conditionalPrices: [],
      pricingTiers: [],
      conditions: [
        "Tarif détecté sur la page officielle, mais réseau et conditions critiques non confirmés dans la même preuve.",
      ],
      evidence: [match[0].slice(0, 260)],
      offerUrl: null,
      sourceUrl: LEBARA_SOURCE_URL,
      billingPeriodDays: null,
      autoRenewal: null,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "PARTIAL",
    });
  }

  if (offers.length === 0) {
    return {
      provider: "Lebara",
      sourceUrl: LEBARA_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "La page Lebara ne fournit pas de cartes exploitables sans exécuter son application ou son contrôle d'accès.",
        sourceUrl: LEBARA_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, LEBARA_SOURCE_URL);
  return {
    provider: "Lebara",
    sourceUrl: LEBARA_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectLebaraOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseLebaraOffers(
      await fetchOfficialHtml(LEBARA_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "Lebara",
      sourceUrl: LEBARA_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: LEBARA_SOURCE_URL,
      }],
    };
  }
}
