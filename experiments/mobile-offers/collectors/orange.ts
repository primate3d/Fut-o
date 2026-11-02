import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type {
  ConditionalPrice,
  CollectorOptions,
  CollectorResult,
  MobileOffer,
} from "../types";
import { validateAndDedupe } from "../validate";

export const ORANGE_SOURCE_URL = "https://boutique.orange.fr/mobile/offres";

const OFFER_NAMES = [
  "Série Spéciale SaferPhone 5Go",
  "Série Spéciale 130Go 5G+",
  "Forfait Voyage 250Go 5G+",
  "Forfait 2h 100Mo",
  "Série Spéciale 20Go",
  "Série Spéciale 200Go 5G Cheat_Code_18_26",
  "Série Spéciale 80Go 5G",
  "Forfait 200Go 5G+",
  "Forfait 300Go 5G+",
] as const;

interface OrangeCard {
  name: string;
  internetCustomer: boolean;
  segment: string;
  currentPrice: number | null;
  durationMonths: number | null;
  priceAfter: number | null;
  referencePrice: number | null;
  commitmentMonths: number | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCard(name: string, internetCustomer: boolean, segment: string): OrangeCard {
  const progressive = segment.match(
    /(\d+(?:[,.]\d+)?)€\s+par mois pendant\s+(\d+)\s+mois\s+puis\s+(\d+(?:[,.]\d+)?)€\s+par mois/i,
  );
  const reduced = segment.match(
    /(\d+(?:[,.]\d+)?)€\s+par mois\s+au lieu de\s+(\d+(?:[,.]\d+)?)€\s+par mois/i,
  );
  const simple = segment.match(/(\d+(?:[,.]\d+)?)€\s+par mois/i);
  const commitment = segment.match(/Engagement\s+(\d+)\s+mois/i);

  return {
    name,
    internetCustomer,
    segment,
    currentPrice: parseFrenchAmount(progressive?.[1] ?? reduced?.[1] ?? simple?.[1]),
    durationMonths: progressive ? Number(progressive[2]) : null,
    priceAfter: parseFrenchAmount(progressive?.[3]),
    referencePrice: parseFrenchAmount(reduced?.[2]),
    commitmentMonths: commitment
      ? Number(commitment[1])
      : /sans engagement/i.test(segment)
        ? 0
        : null,
  };
}

function extractCards(pageText: string): OrangeCard[] {
  const names = OFFER_NAMES.map(escapeRegex).join("|");
  const matcher = new RegExp(
    `(${names})\\s+(false|true)\\s+([\\s\\S]*?)(?=(?:${names})\\s+(?:false|true)|Kit mains libres recommandé|Mentions)`,
    "gi",
  );
  const cards: OrangeCard[] = [];
  const seen = new Set<string>();
  for (const match of pageText.matchAll(matcher)) {
    const name = match[1];
    const internetCustomer = match[2].toLowerCase() === "true";
    const key = `${name}:${internetCustomer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(parseCard(name, internetCustomer, match[3]));
  }
  return cards;
}

function dataFromName(name: string): number | null {
  const match = name.match(/(\d+)\s*(Go|Mo)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2].toLowerCase() === "mo" ? value / 1000 : value;
}

function technologyFromName(name: string): string | null {
  if (/5G\+(?!o)/i.test(name)) return "5G+";
  if (/5G(?!o)/i.test(name)) return "5G";
  return null;
}

function conditionalKind(name: string): ConditionalPrice["kind"] {
  return /SaferPhone|18_26/i.test(name) ? "AGE" : "NEW_CUSTOMER";
}

export function parseOrangeOffers(
  html: string,
  retrievedAt: string,
): CollectorResult {
  const pageText = htmlToText(html);
  const cards = extractCards(pageText);
  const publicCards = cards.filter((card) => !card.internetCustomer);

  if (publicCards.length === 0) {
    return {
      provider: "Orange",
      sourceUrl: ORANGE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Cartes d'offres Orange introuvables.",
        sourceUrl: ORANGE_SOURCE_URL,
      }],
    };
  }

  const activationFees = /10€ de frais d[’']activation de la carte sim/i.test(pageText)
    ? 10
    : null;
  const offers = publicCards.map((card): MobileOffer => {
    const boxCard = cards.find(
      (candidate) => candidate.internetCustomer && candidate.name === card.name,
    );
    const conditionalPrices: ConditionalPrice[] = [];
    const conditions: string[] = [];
    let monthlyPrice = card.priceAfter ?? card.referencePrice ?? card.currentPrice;
    let promotionPrice = card.durationMonths ? card.currentPrice : null;
    let promotionDuration = card.durationMonths;
    let priceAfterPromotion = card.priceAfter;

    if (card.referencePrice !== null && card.currentPrice !== null) {
      const kind = conditionalKind(card.name);
      conditionalPrices.push({
        kind,
        monthlyPrice: card.currentPrice,
        durationMonths: null,
        priceAfter: card.referencePrice,
        condition:
          kind === "AGE"
            ? "Tarif soumis à la condition d'âge indiquée dans le nom de l'offre; durée non publiée dans la carte."
            : "Tarif réservé aux nouvelles souscriptions; durée non publiée dans la carte.",
      });
      promotionPrice = null;
      promotionDuration = null;
      priceAfterPromotion = null;
    }

    const newCustomerLegal =
      card.name === "Série Spéciale 130Go 5G+" &&
      /130Go 5G\+ à 20,99€\/mois\s*:\s*Tarif incluant une remise de 4€[^.]*24,99€/i.test(pageText);
    if (newCustomerLegal) {
      monthlyPrice = 24.99;
      conditionalPrices.push({
        kind: "NEW_CUSTOMER",
        monthlyPrice: 20.99,
        durationMonths: null,
        priceAfter: 24.99,
        condition: "Nouvelle souscription; durée de la remise non indiquée.",
      });
    }

    if (boxCard?.currentPrice !== null && boxCard?.currentPrice !== undefined) {
      conditionalPrices.push({
        kind: "BOX",
        monthlyPrice: boxCard.currentPrice,
        durationMonths: boxCard.durationMonths,
        priceAfter: boxCard.priceAfter ?? boxCard.referencePrice,
        condition: "Tarif réservé aux clients Internet Orange.",
      });
      conditions.push("Une tarification distincte est publiée pour les clients Internet Orange.");
    }
    if (/18_26/i.test(card.name)) {
      conditions.push("Offre réservée aux 18-26 ans après validation.");
    }
    if (/SaferPhone/i.test(card.name)) {
      conditions.push("Tarif réduit soumis à la condition d'âge SaferPhone.");
    }

    return {
      provider: "Orange",
      offerName: card.name,
      monthlyPrice,
      includedDataGB: dataFromName(card.name),
      unlimitedData: false,
      euDataGB: null,
      network: "Réseau Orange",
      technology: technologyFromName(card.name),
      commitmentMonths: card.commitmentMonths,
      promotionPrice,
      promotionDuration,
      priceAfterPromotion,
      activationFees,
      simFees: null,
      conditionalPrices,
      pricingTiers: [],
      conditions,
      evidence: [
        `${card.name} false ${card.segment.slice(0, 260)}`,
        ...(boxCard ? [`${boxCard.name} true ${boxCard.segment.slice(0, 180)}`] : []),
      ],
      sourceUrl: ORANGE_SOURCE_URL,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    };
  });

  const validated = validateAndDedupe(offers, ORANGE_SOURCE_URL);
  return {
    provider: "Orange",
    sourceUrl: ORANGE_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectOrangeOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseOrangeOffers(
      await fetchOfficialHtml(ORANGE_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "Orange",
      sourceUrl: ORANGE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: ORANGE_SOURCE_URL,
      }],
    };
  }
}
