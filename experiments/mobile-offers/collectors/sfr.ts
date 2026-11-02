import { fetchOfficialHtml } from "../fetch";
import { extractScriptById } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const SFR_SOURCE_URL = "https://www.sfr.fr/offre-mobile";

interface SfrProduct {
  name?: string;
  url?: string;
  description?: string;
  offers?: Array<{ name?: string; price?: string }>;
}

function dataFromName(name: string): { data: number | null; unlimited: boolean } {
  if (/illimit[ée]/i.test(name)) return { data: null, unlimited: true };
  const match = name.match(/(\d+)\s*Go/i);
  return { data: match ? Number(match[1]) : null, unlimited: false };
}

export function parseSfrOffers(html: string, retrievedAt: string): CollectorResult {
  const script = extractScriptById(html, "mobileOffersItemListLD");
  let products: SfrProduct[] = [];
  try {
    const payload = JSON.parse(script ?? "null") as {
      mainEntity?: { itemListElement?: Array<{ item?: SfrProduct }> };
    } | null;
    products = payload?.mainEntity?.itemListElement?.flatMap((entry) =>
      entry.item ? [entry.item] : [],
    ) ?? [];
  } catch {
    products = [];
  }

  if (products.length === 0) {
    return {
      provider: "SFR",
      sourceUrl: SFR_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "JSON-LD des forfaits SFR introuvable.",
        sourceUrl: SFR_SOURCE_URL,
      }],
    };
  }

  const offers = products.map((product): MobileOffer => {
    const name = product.name?.trim() ?? "";
    const description = product.description?.trim() ?? "";
    const standards = product.offers?.filter((offer) => offer.name === "Prix Standard") ?? [];
    const standard = standards[0];
    const box = product.offers?.find((offer) => offer.name === "Prix Client Box");
    const data = dataFromName(name);
    const standardPrices = new Set(standards.map((offer) => offer.price));
    const ambiguousPrice = standardPrices.size > 1;
    const monthlyPrice = !ambiguousPrice && standard?.price ? Number(standard.price) : null;
    const boxPrice = box?.price ? Number(box.price) : null;
    const commitmentMonths = /sans engagement/i.test(description) ? 0 : null;

    return {
      provider: "SFR",
      offerName: name,
      monthlyPrice,
      includedDataGB: data.data,
      unlimitedData: data.unlimited,
      euDataGB: null,
      network: "Réseau SFR",
      technology: /5G\+/i.test(name) ? "5G+" : /5G/i.test(name) ? "5G" : "4G",
      commitmentMonths,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: null,
      conditionalPrices:
        boxPrice === null
          ? []
          : [{
              kind: "BOX",
              monthlyPrice: boxPrice,
              durationMonths: null,
              priceAfter: monthlyPrice,
              condition: "Prix réservé aux clients Box SFR.",
            }],
      pricingTiers: [],
      conditions: [
        ...(boxPrice === null ? [] : ["Un prix Client Box distinct est publié."]),
        ...(ambiguousPrice ? ["Plusieurs prix standard contradictoires sont publiés."] : []),
      ],
      evidence: [
        `${name}; ${description}; Prix Standard ${standard?.price ?? "inconnu"}; Prix Client Box ${box?.price ?? "inconnu"}`,
      ],
      sourceUrl: product.url ?? SFR_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus:
        commitmentMonths === null || ambiguousPrice ? "PARTIAL" : "VERIFIED",
    };
  });
  const validated = validateAndDedupe(offers, SFR_SOURCE_URL);
  return {
    provider: "SFR",
    sourceUrl: SFR_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectSfrOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseSfrOffers(
      await fetchOfficialHtml(SFR_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "SFR",
      sourceUrl: SFR_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: SFR_SOURCE_URL,
      }],
    };
  }
}
