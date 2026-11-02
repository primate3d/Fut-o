import { fetchOfficialHtml } from "../fetch";
import { htmlToText } from "../html";
import type {
  CollectorOptions,
  CollectorResult,
  MobileOffer,
} from "../types";
import { validateAndDedupe } from "../validate";

export const RED_SOURCE_URL = "https://www.red-by-sfr.fr/forfaits-mobiles/";

interface RedVolume {
  dataGB: number;
  has5gLabel: boolean;
  voyage: boolean;
}

interface StructuredRedVariant {
  enabled?: boolean;
  label?: string;
  volume?: number;
  net5g?: string;
  dataInter?: { volume?: number };
  pricePerMonthWithDiscount?: number;
}

function extractAssignedObject(html: string, variableName: string): unknown | null {
  const assignment = html.indexOf(variableName);
  if (assignment < 0) return null;
  const start = html.indexOf("{", assignment + variableName.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseStructuredOffers(
  html: string,
  pageText: string,
  retrievedAt: string,
): MobileOffer[] {
  const payload = extractAssignedObject(html, "serviceOffer") as {
    data?: {
      redMobileOfferConfiguration?: { datanat?: StructuredRedVariant[] };
    };
  } | null;
  const variants = payload?.data?.redMobileOfferConfiguration?.datanat ?? [];
  const noCommitment = /sans engagement/i.test(pageText);
  return variants
    .filter((variant) => variant.enabled !== false)
    .map((variant): MobileOffer => {
      const dataGB =
        typeof variant.volume === "number" ? variant.volume / 1000 : null;
      const euDataGB =
        typeof variant.dataInter?.volume === "number"
          ? variant.dataInter.volume / 1000
          : null;
      const monthlyPrice =
        typeof variant.pricePerMonthWithDiscount === "number"
          ? variant.pricePerMonthWithDiscount / 100
          : null;
      const has5g = variant.net5g === "included";
      return {
        provider: "RED by SFR",
        offerName: `Forfait RED ${variant.label ?? `${dataGB ?? "?"}Go`}`,
        monthlyPrice,
        includedDataGB: dataGB,
        unlimitedData: false,
        euDataGB,
        network: has5g ? "Réseau SFR 5G/4G" : "Réseau SFR 4G",
        technology: has5g ? "5G" : "4G",
        commitmentMonths: noCommitment ? 0 : null,
        promotionPrice: null,
        promotionDuration: null,
        priceAfterPromotion: null,
        activationFees: null,
        simFees: null,
        conditionalPrices: [],
        pricingTiers: [],
        conditions: /250\s*Go/i.test(variant.label ?? "")
          ? ["Variante Voyage; consulter la page officielle pour les destinations incluses."]
          : [],
        evidence: [
          `${variant.label ?? "libellé inconnu"}; ${variant.volume ?? "volume inconnu"} Mo; ${variant.dataInter?.volume ?? "volume international inconnu"} Mo; ${variant.pricePerMonthWithDiscount ?? "prix inconnu"} centimes`,
        ],
        sourceUrl: RED_SOURCE_URL,
        retrievedAt,
        verifiedAt: null,
        verificationStatus: "VERIFIED",
      };
    });
}

function parseVolumes(pageText: string): RedVolume[] {
  const start = pageText.search(/Choisissez le volume d[’']Internet inclus/i);
  if (start < 0) return [];
  const following = pageText.slice(start, start + 800);
  const end = following.search(/Vitesse\s+Information|Choisissez la vitesse/i);
  const section = end >= 0 ? following.slice(0, end) : following;
  const matches = section.matchAll(
    /(\d+(?:[,.]\d+)?)\s*Go(?:\s+(5G))?(?:\s+(Voyage))?/gi,
  );
  const unique = new Map<number, RedVolume>();
  for (const match of matches) {
    const dataGB = Number(match[1].replace(",", "."));
    unique.set(dataGB, {
      dataGB,
      has5gLabel: Boolean(match[2]),
      voyage: Boolean(match[3]),
    });
  }
  return [...unique.values()];
}

export function parseRedOffers(
  html: string,
  retrievedAt: string,
): CollectorResult {
  const pageText = htmlToText(html);
  const structuredOffers = parseStructuredOffers(html, pageText, retrievedAt);
  if (structuredOffers.length > 0) {
    const validated = validateAndDedupe(structuredOffers, RED_SOURCE_URL);
    return {
      provider: "RED by SFR",
      sourceUrl: RED_SOURCE_URL,
      retrievedAt,
      offers: validated.offers,
      failures: validated.failures,
    };
  }
  const volumes = parseVolumes(pageText);

  if (volumes.length === 0) {
    return {
      provider: "RED by SFR",
      sourceUrl: RED_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "STRUCTURE_CHANGED",
          message: "Sélecteur de volumes RED introuvable.",
          sourceUrl: RED_SOURCE_URL,
        },
      ],
    };
  }

  const noCommitment = /sans engagement/i.test(pageText);
  const offers = volumes.map((volume): MobileOffer => {
    const conditions = [
      "Le volume est visible sur la page officielle, mais le HTML public ne relie pas de façon fiable chaque volume à son prix dynamique.",
    ];
    if (volume.voyage) {
      conditions.push("Variante Voyage; les destinations exactes restent à vérifier.");
    }
    return {
      provider: "RED by SFR",
      offerName: `Forfait RED ${volume.dataGB.toLocaleString("fr-FR")} Go${volume.has5gLabel ? " 5G" : ""}${volume.voyage ? " Voyage" : ""}`,
      monthlyPrice: null,
      includedDataGB: volume.dataGB,
      unlimitedData: false,
      euDataGB: null,
      network: volume.has5gLabel ? "Réseau SFR 5G/4G" : "Réseau SFR 4G",
      technology: volume.has5gLabel ? "5G" : "4G",
      commitmentMonths: noCommitment ? 0 : null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: null,
      conditionalPrices: [],
      pricingTiers: [],
      conditions,
      evidence: [
        `${volume.dataGB} Go${volume.has5gLabel ? " 5G" : ""}${volume.voyage ? " Voyage" : ""}`,
      ],
      sourceUrl: RED_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "PARTIAL",
    };
  });
  const validated = validateAndDedupe(offers, RED_SOURCE_URL);
  return {
    provider: "RED by SFR",
    sourceUrl: RED_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectRedOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    const html = await fetchOfficialHtml(RED_SOURCE_URL, options);
    return parseRedOffers(html, retrievedAt);
  } catch (error) {
    return {
      provider: "RED by SFR",
      sourceUrl: RED_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "FETCH_FAILED",
          message: error instanceof Error ? error.message : "Erreur inconnue",
          sourceUrl: RED_SOURCE_URL,
        },
      ],
    };
  }
}
