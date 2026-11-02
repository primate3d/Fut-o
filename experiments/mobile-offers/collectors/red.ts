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
      commitmentMonths: noCommitment ? 0 : null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: null,
      conditions,
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
