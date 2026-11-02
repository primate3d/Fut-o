import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type {
  CollectorOptions,
  CollectorResult,
  MobileOffer,
  PricingTier,
} from "../types";
import { validateAndDedupe } from "../validate";

export const PRIXTEL_SOURCE_URL = "https://www.prixtel.com/";

const PRIXTEL_OFFERS = [
  {
    name: "Oxygène",
    url: "https://www.prixtel.com/forfait-mobile/forfait-illimite/",
  },
  {
    name: "Le petit",
    url: "https://www.prixtel.com/forfait-mobile/forfait-lepetit/",
  },
  {
    name: "Le grand",
    url: "https://www.prixtel.com/forfait-mobile/forfait-legrand/",
  },
  {
    name: "Le géant",
    url: "https://www.prixtel.com/forfait-mobile/forfait-legeant/",
  },
] as const;

function listItems(html: string, className: string): string[] {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const list = html.match(
    new RegExp(`<ul\\b[^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/ul>`, "i"),
  )?.[1];
  if (!list) return [];
  return [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) =>
    htmlToText(match[1]),
  );
}

function parsePricingTiers(html: string): PricingTier[] {
  const thresholdItems = listItems(html, "col1");
  const priceItems = listItems(html, "col2");
  const thresholds = thresholdItems.flatMap((value) => {
    const match = value.match(/(\d+(?:[,.]\d+)?)\s*Go/i);
    return match ? [Number(match[1].replace(",", "."))] : [];
  });
  const prices = priceItems.flatMap((value) => {
    const amount = parseFrenchAmount(value.match(/\d[\d\s]*[,.]\s*\d{2}/)?.[0]);
    return amount === null ? [] : [amount];
  });
  return prices.flatMap((monthlyPrice, index) => {
    const fromDataGB = thresholds[index];
    const upToDataGB = thresholds[index + 1];
    return fromDataGB === undefined || upToDataGB === undefined
      ? []
      : [{ fromDataGB, upToDataGB, monthlyPrice }];
  });
}

export function parsePrixtelOffer(
  html: string,
  retrievedAt: string,
  config: { name: string; url: string },
): MobileOffer | null {
  const pageText = htmlToText(html);
  const pricingTiers = parsePricingTiers(html);
  const range = pageText.match(/De\s+(\d+)\s+à\s+(\d+)\s+Go\/mois/i);
  const euSection = pageText.match(
    /Quand vous êtes dans l['’]UE ou les DOM[\s\S]{0,180}?(\d+(?:[,.]\d+)?)\s*Go\/mois/i,
  );
  if (pricingTiers.length === 0 || !range) return null;

  const maxData = Number(range[2]);
  const has5g = /De\s+\d+\s+à\s+\d+\s+Go\/mois[^.]{0,100}5G/i.test(pageText);
  const network = /réseau\s+SFR/i.test(pageText) ? "Réseau SFR" : null;
  const noCommitment = /sans engagement/i.test(pageText);
  return {
    provider: "Prixtel",
    offerName: `Forfait Prixtel ${config.name}`,
    monthlyPrice: null,
    includedDataGB: maxData,
    unlimitedData: false,
    euDataGB: parseFrenchAmount(euSection?.[1]),
    network,
    technology: has5g ? "5G" : "4G",
    commitmentMonths: noCommitment ? 0 : null,
    promotionPrice: null,
    promotionDuration: null,
    priceAfterPromotion: null,
    activationFees: null,
    simFees: null,
    conditionalPrices: [],
    pricingTiers,
    conditions: [
      "Forfait flexible: le prix mensuel dépend de la consommation de données.",
      "Le tarif minimal ne constitue pas un prix garanti pour tous les paliers.",
    ],
    evidence: [
      `${range[0]}; ${pricingTiers.map((tier) => `${tier.fromDataGB}-${tier.upToDataGB} Go: ${tier.monthlyPrice} €`).join("; ")}`,
    ],
    sourceUrl: config.url,
    retrievedAt,
    verifiedAt: null,
    verificationStatus: "VERIFIED",
  };
}

export async function collectPrixtelOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  const offers: MobileOffer[] = [];
  const failures: CollectorResult["failures"] = [];

  await Promise.all(
    PRIXTEL_OFFERS.map(async (config) => {
      try {
        const html = await fetchOfficialHtml(config.url, options);
        const offer = parsePrixtelOffer(html, retrievedAt, config);
        if (offer) offers.push(offer);
        else {
          failures.push({
            code: "STRUCTURE_CHANGED",
            message: `Paliers Prixtel introuvables pour ${config.name}.`,
            sourceUrl: config.url,
          });
        }
      } catch (error) {
        failures.push({
          code: "FETCH_FAILED",
          message: error instanceof Error ? error.message : "Erreur inconnue",
          sourceUrl: config.url,
        });
      }
    }),
  );

  const validated = validateAndDedupe(offers, PRIXTEL_SOURCE_URL);
  return {
    provider: "Prixtel",
    sourceUrl: PRIXTEL_SOURCE_URL,
    retrievedAt,
    offers: validated.offers.sort((left, right) =>
      left.offerName.localeCompare(right.offerName, "fr"),
    ),
    failures: [...failures, ...validated.failures],
  };
}
