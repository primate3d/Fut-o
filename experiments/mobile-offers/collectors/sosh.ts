import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const SOSH_SOURCE_URL = "https://shop.sosh.fr/information/tarifs-et-contrats";

export function parseSoshOffers(html: string, retrievedAt: string): CollectorResult {
  const pageText = htmlToText(html);
  const matches = pageText.matchAll(
    /Forfait(?: Voyage)? Sosh\s+(\d+(?:[,.]\d+)?)€\s+(\d+(?:[,.]\d+)?)Go(?:\s+(5G))?/gi,
  );
  const offers: MobileOffer[] = [];
  for (const match of matches) {
    const data = Number(match[2].replace(",", "."));
    const technology = match[3] ? "5G" : null;
    offers.push({
      provider: "Sosh",
      offerName: `Forfait${/Voyage/i.test(match[0]) ? " Voyage" : ""} Sosh ${data.toLocaleString("fr-FR")}Go${technology ? ` ${technology}` : ""}`,
      monthlyPrice: parseFrenchAmount(match[1]),
      includedDataGB: data,
      unlimitedData: false,
      euDataGB: null,
      network: null,
      technology,
      commitmentMonths: null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: null,
      conditionalPrices: [],
      pricingTiers: [],
      conditions: [
        "La page contractuelle associe le prix et le volume, mais ne détaille pas ici le réseau, l'engagement et l'enveloppe Europe/DOM.",
      ],
      evidence: [match[0]],
      sourceUrl: SOSH_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "PARTIAL",
    });
  }
  if (offers.length === 0) {
    return {
      provider: "Sosh",
      sourceUrl: SOSH_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Liens contractuels Sosh introuvables.",
        sourceUrl: SOSH_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, SOSH_SOURCE_URL);
  return {
    provider: "Sosh",
    sourceUrl: SOSH_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectSoshOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseSoshOffers(
      await fetchOfficialHtml(SOSH_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "Sosh",
      sourceUrl: SOSH_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: SOSH_SOURCE_URL,
      }],
    };
  }
}
