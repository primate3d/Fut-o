import { fetchOfficialHtml } from "../fetch";
import {
  cleanText,
  htmlToText,
  parseEuroStyleAmount,
  parseFrenchAmount,
  unescapeEmbeddedContent,
} from "../html";
import type {
  CollectorOptions,
  CollectorResult,
  MobileOffer,
} from "../types";
import { validateAndDedupe } from "../validate";

export const BOUYGUES_SOURCE_URL =
  "https://www.bouyguestelecom.fr/forfaits-mobiles/sans-engagement";

function field(segment: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = segment.match(
    new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"),
  );
  if (!match) return null;
  const value = cleanText(match[1]);
  return /^\$?(?:undefined|null)$/i.test(value) ? null : value;
}

function commercialOfferName(value: string): string {
  return value.replace(/\s*\|\s*ID\s*:\s*\d+\s*$/i, "").trim();
}

function parseDataEnvelope(value: string | null): {
  includedDataGB: number | null;
  unlimitedData: boolean;
} {
  if (!value) return { includedDataGB: null, unlimitedData: false };
  const unlimitedData = /illimit[ée]e?/i.test(value);
  const match = value.match(/(\d+(?:[,.]\d+)?)\s*Go/i);
  return {
    includedDataGB: match ? Number(match[1].replace(",", ".")) : null,
    unlimitedData,
  };
}

function parseRoaming(value: string | null): number | null {
  const match = value?.match(/(\d+(?:[,.]\d+)?)\s*Go/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function priceFromName(name: string): number | null {
  const afterDash = name.split(/\s[-–|]\s/).at(-1) ?? name;
  return parseEuroStyleAmount(afterDash);
}

function parsePromotion(value: string | null): {
  price: number | null;
  duration: number | null;
  after: number | null;
} {
  if (!value) return { price: null, duration: null, after: null };
  const match = value.match(
    /(\d+(?:[,.]\d+)?)\s*€\s*\/\s*mois\s+pendant\s+(\d+)\s+(an|ans|mois)\s+puis\s+(\d+(?:[,.]\d+)?)\s*€\s*\/\s*mois/i,
  );
  if (!match) return { price: null, duration: null, after: null };
  const count = Number(match[2]);
  return {
    price: parseFrenchAmount(match[1]),
    duration: /^an/i.test(match[3]) ? count * 12 : count,
    after: parseFrenchAmount(match[4]),
  };
}

function globalFee(pageText: string, label: RegExp): number | null {
  const match = pageText.match(label);
  return match ? parseFrenchAmount(match[1]) : null;
}

export function parseBouyguesOffers(
  html: string,
  retrievedAt: string,
): CollectorResult {
  const content = unescapeEmbeddedContent(html);
  const pageText = htmlToText(html);
  const chunks = content.split(/(?="dataEnvelope"\s*:)/g);
  const simFees = globalFee(pageText, /carte\s+SIM[^€\d]{0,80}(\d+(?:[,.]\d+)?)\s*€/i);
  const activationFees = globalFee(
    pageText,
    /(?:activation|mise en service)[^€\d]{0,80}(\d+(?:[,.]\d+)?)\s*€/i,
  );
  const rawOffers: MobileOffer[] = [];

  for (const chunk of chunks) {
    const segment = chunk.slice(0, 12_000);
    const rawOfferName = field(segment, "nom_offre");
    if (!rawOfferName) continue;
    const offerName = commercialOfferName(rawOfferName);

    const data = parseDataEnvelope(field(segment, "dataEnvelope"));
    const promoText = field(segment, "promo_offer");
    const promotion = parsePromotion(promoText);
    const basePrice = priceFromName(offerName) ?? promotion.after;
    const boxRestricted = /(?:pure\s+fibre|bbox|client\s+box)/i.test(segment);
    const monthlyPrice =
      promotion.price !== null && !boxRestricted
        ? promotion.price
        : basePrice;
    const networkText = field(segment, "networkText");
    const obligation = field(segment, "obligationLabel");
    const conditions: string[] = [];

    if (promoText) conditions.push(promoText);
    const sticker = field(segment, "sticker");
    if (sticker) conditions.push(sticker);
    if (boxRestricted && promotion.price !== null) {
      conditions.push(
        "Tarif promotionnel réservé à une condition Box/Fibre; le prix mensuel principal conserve le tarif hors remise.",
      );
    }

    rawOffers.push({
      provider: "B&You",
      offerName,
      monthlyPrice,
      includedDataGB: data.includedDataGB,
      unlimitedData: data.unlimitedData,
      euDataGB: parseRoaming(field(segment, "roamingEnvelope")),
      network: networkText || "Réseau Bouygues Telecom",
      technology: /5G/i.test(`${offerName} ${networkText ?? ""}`) ? "5G" : "4G",
      commitmentMonths:
        obligation && /sans engagement/i.test(obligation)
          ? 0
          : /sans engagement/i.test(pageText)
            ? 0
            : null,
      promotionPrice: promotion.price,
      promotionDuration: promotion.duration,
      priceAfterPromotion: promotion.after,
      activationFees,
      simFees,
      conditionalPrices:
        boxRestricted && promotion.price !== null
          ? [
              {
                kind: "BOX",
                monthlyPrice: promotion.price,
                durationMonths: promotion.duration,
                priceAfter: promotion.after,
                condition: "Souscription simultanée d'une offre Box/Fibre.",
              },
            ]
          : [],
      pricingTiers: [],
      conditions,
      evidence: [
        `${offerName}; ${field(segment, "dataEnvelope") ?? "data inconnue"}; ${promoText ?? "sans promotion explicite"}`,
      ],
      sourceUrl: BOUYGUES_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: monthlyPrice === null ? "PARTIAL" : "VERIFIED",
    });
  }

  if (rawOffers.length === 0) {
    return {
      provider: "B&You",
      sourceUrl: BOUYGUES_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "STRUCTURE_CHANGED",
          message: "Cartes d'offres B&You introuvables.",
          sourceUrl: BOUYGUES_SOURCE_URL,
        },
      ],
    };
  }

  const validated = validateAndDedupe(rawOffers, BOUYGUES_SOURCE_URL);
  return {
    provider: "B&You",
    sourceUrl: BOUYGUES_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectBouyguesOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    const html = await fetchOfficialHtml(BOUYGUES_SOURCE_URL, options);
    return parseBouyguesOffers(html, retrievedAt);
  } catch (error) {
    return {
      provider: "B&You",
      sourceUrl: BOUYGUES_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [
        {
          code: "FETCH_FAILED",
          message: error instanceof Error ? error.message : "Erreur inconnue",
          sourceUrl: BOUYGUES_SOURCE_URL,
        },
      ],
    };
  }
}
