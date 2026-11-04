import { fetchOfficialHtml } from "../fetch";
import { htmlToText, parseFrenchAmount } from "../html";
import type { CollectorOptions, CollectorResult, MobileOffer } from "../types";
import { validateAndDedupe } from "../validate";

export const LAPOSTE_SOURCE_URL =
  "https://www.lapostemobile.fr/offres-mobiles/forfaits-sans-engagement";

export function parseLaPosteOffers(
  html: string,
  retrievedAt: string,
): CollectorResult {
  const pageText = htmlToText(html);
  const cardPattern =
    /data-offre=["'](\d+)["']([\s\S]*?)(?=data-offre=["']\d+["']|$)/gi;
  const offers: MobileOffer[] = [];

  for (const match of html.matchAll(cardPattern)) {
    const segment = htmlToText(match[2]);
    const priceMatch = segment.match(
      /(\d+(?:[,.]\d+)?)\s*Go\s+(\d+)\s*€\s*(\d{2})\s*\/mois/i,
    );
    if (!priceMatch || !/Forfait SIM/i.test(segment)) continue;
    const data = parseFrenchAmount(priceMatch[1]);
    const euMatch = segment.match(
      /(\d+(?:[,.]\d+)?)\s*Go[^.]{0,120}(?:Europe|DOM\/COM)/i,
    );
    const specialValidity = data === 200
      ? pageText.match(
          /Offre 200Go[\s\S]{0,300}?Tarifs TTC et offres valables du\s+([^.;]{5,80})/i,
        )?.[1]
      : null;
    const offerUrl = `${LAPOSTE_SOURCE_URL}?ajouterforfait=${match[1]}`;

    offers.push({
      provider: "La Poste Mobile",
      offerName: `Forfait SIM La Poste Mobile ${data} Go`,
      monthlyPrice: Number(`${priceMatch[2]}.${priceMatch[3]}`),
      includedDataGB: data,
      unlimitedData: false,
      euDataGB: parseFrenchAmount(euMatch?.[1]),
      network: /Bouygues Telecom/i.test(pageText)
        ? "Réseau Bouygues Telecom"
        : null,
      technology: /5G/i.test(segment) ? "5G" : "4G",
      commitmentMonths: /sans engagement/i.test(segment) ? 0 : null,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: null,
      simFees: 9.9,
      conditionalPrices: [],
      pricingTiers: [],
      conditions: [
        "Carte SIM facturée 9,90 €, sauf condition promotionnelle explicitement indiquée par La Poste Mobile.",
        ...(/SIM offerte/i.test(segment)
          ? ["Carte SIM offerte uniquement sous les conditions indiquées sur la page officielle."]
          : []),
        ...(specialValidity
          ? [`Période de souscription indiquée par l'opérateur : ${specialValidity.trim()}.`]
          : []),
      ],
      evidence: [segment.slice(0, 420)],
      offerUrl,
      sourceUrl: LAPOSTE_SOURCE_URL,
      billingPeriodDays: null,
      autoRenewal: true,
      retrievedAt,
      verifiedAt: null,
      verificationStatus: "VERIFIED",
    });
  }

  if (offers.length === 0) {
    return {
      provider: "La Poste Mobile",
      sourceUrl: LAPOSTE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Cartes de forfaits La Poste Mobile introuvables.",
        sourceUrl: LAPOSTE_SOURCE_URL,
      }],
    };
  }
  const validated = validateAndDedupe(offers, LAPOSTE_SOURCE_URL);
  return {
    provider: "La Poste Mobile",
    sourceUrl: LAPOSTE_SOURCE_URL,
    retrievedAt,
    offers: validated.offers,
    failures: validated.failures,
  };
}

export async function collectLaPosteOffers(
  options: CollectorOptions = {},
): Promise<CollectorResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    return parseLaPosteOffers(
      await fetchOfficialHtml(LAPOSTE_SOURCE_URL, options),
      retrievedAt,
    );
  } catch (error) {
    return {
      provider: "La Poste Mobile",
      sourceUrl: LAPOSTE_SOURCE_URL,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: LAPOSTE_SOURCE_URL,
      }],
    };
  }
}
