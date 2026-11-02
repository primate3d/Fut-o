import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const NRJ_SOURCE_URL = "https://www.nrjmobile.fr/forfait-se";

function parseData(value: string): { data: number | null; unlimited: boolean } {
  if (/illimit[ée]/i.test(value)) return { data: null, unlimited: true };
  const match = value.match(/(\d+(?:[,.]\d+)?)\s*(Go|Mo)/i);
  if (!match) return { data: null, unlimited: false };
  const amount = Number(match[1].replace(",", "."));
  return {
    data: match[2].toLowerCase() === "mo" ? amount / 1000 : amount,
    unlimited: false,
  };
}

export function parseNrjOffers(html: string, retrievedAt: string): CollectorResult {
  const pageText = htmlToText(html);
  const matcher =
    /Carte SIM à\s+(\d+(?:[,.]\d+)?)€\s+(Illimité|\d+(?:[,.]\d+)?\s*(?:Go|Mo))\s+POUR\s+(\d+)\s*€\s*(\d{2})\s*\/mois\s+SANS ENGAGEMENT([\s\S]*?)Voir le détail/gi;
  const offers: MobileOffer[] = [];

  for (const match of pageText.matchAll(matcher)) {
    const data = parseData(match[2]);
    const segment = match[5];
    const euMatch = segment.match(/\+\s*(\d+(?:[,.]\d+)?)\s*Go\s+depuis/i);
    const technology = /en\s+5G/i.test(segment) ? "5G" : "4G";
    const dataLabel = data.unlimited
      ? "Illimité"
      : `${data.data?.toLocaleString("fr-FR")}${(data.data ?? 0) < 1 ? " Go" : " Go"}`;

    offers.push({
      provider: "NRJ Mobile",
      offerName: `Série spéciale NRJ Mobile ${dataLabel}`,
      monthlyPrice: Number(`${match[3]}.${match[4]}`),
      includedDataGB: data.data,
      unlimitedData: data.unlimited,
      euDataGB: parseFrenchAmount(euMatch?.[1]),
      network: /réseau mobile Bouygues Telecom/i.test(pageText)
        ? "Réseau Bouygues Telecom"
        : null,
      technology,
      commitmentMonths: 0,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: parseFrenchAmount(match[1]),
      conditionalPrices: [],
      pricingTiers: [],
      conditions: ["Offre valable pour l'ouverture d'une nouvelle ligne."],
      evidence: [match[0].slice(0, 360)],
      sourceUrl: NRJ_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    });
  }

  if (offers.length === 0) {
    return {
      provider: "NRJ Mobile",
      sourceUrl: NRJ_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Cartes NRJ Mobile introuvables.",
        sourceUrl: NRJ_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, NRJ_SOURCE_URL);
  return {
    provider: "NRJ Mobile",
    sourceUrl: NRJ_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectNrjOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseNrjOffers(
      await fetchOfficialHtml(NRJ_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "NRJ Mobile",
      sourceUrl: NRJ_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: NRJ_SOURCE_URL,
      }],
    };
  }
}
