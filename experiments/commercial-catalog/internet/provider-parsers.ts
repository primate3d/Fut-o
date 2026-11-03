import { htmlToText } from "../../mobile-offers/html";
import { commercialDocumentText, commonOfferFields, evidence, excerptAround, frenchAmount } from "../parsing";
import type { CommercialSourceDefinition, InternetOffer } from "../types";

function baseInternetOffer(
  source: CommercialSourceDefinition,
  retrievedAt: string,
  offerName: string,
): InternetOffer {
  return {
    ...commonOfferFields(source, offerName, retrievedAt),
    sector: "internet",
    technology: "UNKNOWN",
    monthlyPrice: null,
    promotionPrice: null,
    promotionDurationMonths: null,
    priceAfterPromotion: null,
    promotionConditions: [],
    commitmentMonths: null,
    activationFees: null,
    activationFeeRefund: null,
    activationFeeRefundConditional: false,
    terminationFees: null,
    downloadMbps: null,
    uploadMbps: null,
    includedServices: [],
    eligibilityConditions: [],
  };
}

function sourceText(html: string) {
  return commercialDocumentText(html, htmlToText(html));
}

export function parseRedInternet(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const text = sourceText(html);
  const priceProof = excerptAround(text, /Configurer mon offre Fibre Sans engagement\s+\d+[,.]\d+\s*€\s*\/mois/i);
  const basePrice = frenchAmount(priceProof?.match(/\d+[,.]\d+/)?.[0]);
  if (basePrice === null) return [];
  const activationProof = excerptAround(text, /39\s*€\s+de frais de mise en service[^.]*rembours[ée]s? sur demande/i);
  const terminationProof = excerptAround(text, /frais (?:de fermeture|de r[ée]siliation)[^\d]{0,30}59\s*€/i);
  const eligibilityProof = excerptAround(text, /sous r[ée]serve d['’]?[ée]ligibilit[ée][^.]{0,160}/i);
  const common = {
    technology: "FIBER" as const,
    monthlyPrice: basePrice,
    promotionPrice: null,
    promotionDurationMonths: null,
    priceAfterPromotion: null,
    promotionConditions: [],
    commitmentMonths: 0,
    activationFees: activationProof ? 39 : null,
    activationFeeRefund: activationProof ? 39 : null,
    activationFeeRefundConditional: Boolean(activationProof),
    terminationFees: terminationProof ? 59 : null,
    eligibilityConditions: eligibilityProof ? [eligibilityProof] : [],
    conditions: activationProof ? ["Frais de mise en service rembourses uniquement sur demande."] : [],
  };
  const proofs = [
    ...evidence("monthlyPrice", priceProof, source.sourceUrl, retrievedAt),
    ...evidence("technology", excerptAround(text, /Configurer mon offre Fibre/i), source.sourceUrl, retrievedAt),
    ...evidence("commitmentMonths", excerptAround(text, /Sans engagement/i), source.sourceUrl, retrievedAt),
    ...evidence("activationFees", activationProof, source.sourceUrl, retrievedAt),
    ...evidence("terminationFees", terminationProof, source.sourceUrl, retrievedAt),
  ];
  const box7Proof = excerptAround(text, /D[ée]bit jusqu['’][aà]\s*↓\s*1\s*Gb\/s\s*↑\s*1\s*Gb\/s[^.]{0,80}WiFi\s*5/i);
  const box8Proof = excerptAround(text, /D[ée]bit jusqu['’][aà]\s*↓\s*2\s*Gb\/s partag[ée]s\s*↑\s*1\s*Gb\/s[^.]{0,80}WiFi\s*6\s*\+1\s*€\/mois/i);
  return [
    {
      ...baseInternetOffer(source, retrievedAt, "RED Box Fibre - Box 7"),
      ...common,
      downloadMbps: 1000,
      uploadMbps: 1000,
      includedServices: ["Wi-Fi 5"],
      evidence: [...baseInternetOffer(source, retrievedAt, "RED Box Fibre - Box 7").evidence,
        ...proofs, ...evidence("downloadMbps", box7Proof, source.sourceUrl, retrievedAt)],
    },
    ...(box8Proof ? [{
      ...baseInternetOffer(source, retrievedAt, "RED Box Fibre - Box 8"),
      ...common,
      monthlyPrice: basePrice + 1,
      downloadMbps: 2000,
      uploadMbps: 1000,
      includedServices: ["Wi-Fi 6"],
      conditions: [...common.conditions, "Option Box 8 a 1 euro par mois."],
      evidence: [...baseInternetOffer(source, retrievedAt, "RED Box Fibre - Box 8").evidence,
        ...proofs, ...evidence("monthlyPrice", box8Proof, source.sourceUrl, retrievedAt),
        ...evidence("downloadMbps", box8Proof, source.sourceUrl, retrievedAt)],
    } satisfies InternetOffer] : []),
  ];
}

export function parseBouyguesInternet(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const text = sourceText(html);
  const definitions = [
    { name: "B&YOU Pure fibre", price: 24.99, down: 2000, up: 900 },
    { name: "B&YOU Pure fibre Plus", price: 27.99, down: 8000, up: 1000 },
  ];
  return definitions.flatMap((definition): InternetOffer[] => {
    const escapedName = definition.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const legal = excerptAround(text, new RegExp(`${escapedName}\\s*:\\s*offre valable[^]{0,900}?${String(definition.price).replace(".", "[,.]")}\\s*€\\s*\\/mois`, "i"), 40)
      ?? excerptAround(text, new RegExp(`${escapedName}[^]{0,900}?${String(definition.price).replace(".", "[,.]")}\\s*€\\s*\\/mois`, "i"), 40);
    if (!legal) return [];
    const activationProof = excerptAround(legal, /Frais de mise en service\s*:\s*48\s*€/i, 80);
    const terminationProof = excerptAround(legal, /frais de r[ée]siliation\s*:\s*69\s*€/i, 80);
    const eligibilityProof = excerptAround(legal, /sous r[ée]serve d['’][ée]ligibilit[ée][^.]+/i, 80);
    const offer = baseInternetOffer(source, retrievedAt, definition.name);
    return [{
      ...offer,
      technology: "FIBER",
      monthlyPrice: definition.price,
      commitmentMonths: 0,
      activationFees: activationProof ? 48 : null,
      terminationFees: terminationProof ? 69 : null,
      downloadMbps: definition.down,
      uploadMbps: definition.up,
      includedServices: definition.down === 2000 ? ["Wi-Fi 7 bi-bande"] : ["Wi-Fi 7", "Option Debit+ sur demande"],
      eligibilityConditions: eligibilityProof ? [eligibilityProof] : [],
      evidence: [
        ...offer.evidence,
        ...evidence("monthlyPrice", legal, source.sourceUrl, retrievedAt),
        ...evidence("technology", legal, source.sourceUrl, retrievedAt),
        ...evidence("commitmentMonths", excerptAround(legal, /Sans engagement/i), source.sourceUrl, retrievedAt),
        ...evidence("activationFees", activationProof, source.sourceUrl, retrievedAt),
        ...evidence("terminationFees", terminationProof, source.sourceUrl, retrievedAt),
        ...evidence("downloadMbps", legal, source.sourceUrl, retrievedAt),
      ],
    }];
  });
}

export function parseFreeInternet(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const text = sourceText(html);
  const feeProof = excerptAround(text, /Frais de mise en service\s*:\s*49\s*€[^]{0,100}?Frais de r[ée]siliation\s*:\s*69\s*€/i);
  const eligibilityProof = excerptAround(text, /Offres soumises [aà] conditions,?\s+sous r[ée]serve d['’][ée]ligibilit[ée][^.]+/i);
  const definitions = [
    { name: "Freebox Pop", promo: 29.99, after: 39.99, down: 5000, up: 900, services: ["Wi-Fi 7", "+300 chaines TV"] },
    { name: "Freebox Ultra Essentiel", promo: 39.99, after: 49.99, down: 8000, up: 8000, services: ["Wi-Fi 7", "+340 chaines TV"] },
    { name: "Freebox Ultra", promo: 49.99, after: 59.99, down: 8000, up: 8000, services: ["Wi-Fi 7", "+340 chaines TV", "Services de streaming inclus"] },
  ];
  return definitions.flatMap((definition): InternetOffer[] => {
    const escapedName = definition.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pricePattern = String(definition.promo).replace(".", "\\s*€?\\s*");
    const card = excerptAround(text, new RegExp(`${escapedName}[^]{0,240}?${pricePattern}\\s*\\/mois[^]{0,80}?puis\\s*${String(definition.after).replace(".", "[,.]")}\\s*€\\s*\\/mois`, "i"), 40);
    if (!card) return [];
    const offer = baseInternetOffer(source, retrievedAt, definition.name);
    return [{
      ...offer,
      technology: "FIBER",
      monthlyPrice: definition.after,
      promotionPrice: definition.promo,
      promotionDurationMonths: 12,
      priceAfterPromotion: definition.after,
      promotionConditions: ["Nouvelle souscription; remise perdue en cas de changement d'offre ou demenagement."],
      commitmentMonths: 0,
      activationFees: feeProof ? 49 : null,
      terminationFees: feeProof ? 69 : null,
      downloadMbps: definition.down,
      uploadMbps: definition.up,
      includedServices: definition.services,
      eligibilityConditions: eligibilityProof ? [eligibilityProof] : [],
      evidence: [
        ...offer.evidence,
        ...evidence("promotionPrice", card, source.sourceUrl, retrievedAt),
        ...evidence("technology", card, source.sourceUrl, retrievedAt),
        ...evidence("commitmentMonths", excerptAround(card, /Sans engagement/i), source.sourceUrl, retrievedAt),
        ...evidence("activationFees", feeProof, source.sourceUrl, retrievedAt),
        ...evidence("terminationFees", feeProof, source.sourceUrl, retrievedAt),
        ...evidence("downloadMbps", card, source.sourceUrl, retrievedAt),
      ],
    }];
  });
}

export function parseSoshContract(
  text: string,
  sourceUrl: string,
  source: CommercialSourceDefinition,
  retrievedAt: string,
): InternetOffer[] {
  const isBoost = /Sosh Boost Fibre/i.test(text);
  const isBox = /Bo[iî]te Sosh Fibre/i.test(text);
  if (!isBoost && !isBox) return [];
  const name = isBoost ? "Sosh Boost Fibre" : "La Boite Sosh Fibre";
  const offer = { ...baseInternetOffer(source, retrievedAt, name), sourceUrl };
  const speedProof = excerptAround(text, /D[ée]bit descendant\s+(?:8|2)\s*Gbit\/s[^]{0,80}?D[ée]bit montant\s+(?:2\s*Gbit\/s|800\s*Mbit\/s)/i);
  const terminationProof = excerptAround(text, /frais de r[ée]siliation[^\d]{0,40}69/i);
  const commitmentProof = excerptAround(text, /sans engagement de dur[ée]e/i);
  const eligibilityProof = excerptAround(text, /r[ée]serv[ée]e?[^.]*France M[ée]tropolitaine|sous r[ée]serve de compatibilit[ée] technique et g[ée]ographique/i);
  return [{
    ...offer,
    technology: "FIBER",
    commitmentMonths: commitmentProof ? 0 : null,
    terminationFees: terminationProof ? 69 : null,
    downloadMbps: isBoost ? 8000 : 2000,
    uploadMbps: isBoost ? 2000 : 800,
    includedServices: isBoost ? ["Livebox 7 SE"] : ["Livebox 6", "Appels fixes inclus"],
    eligibilityConditions: eligibilityProof ? [eligibilityProof] : [],
    conditions: ["Prix et frais de mise en service non lisibles avec une precision suffisante dans le PDF; confirmation requise."],
    evidence: [
      ...evidence("offerName", name, sourceUrl, retrievedAt),
      ...evidence("technology", speedProof, sourceUrl, retrievedAt),
      ...evidence("commitmentMonths", commitmentProof, sourceUrl, retrievedAt),
      ...evidence("terminationFees", terminationProof, sourceUrl, retrievedAt),
      ...evidence("downloadMbps", speedProof, sourceUrl, retrievedAt),
    ],
  }];
}

export function parseProviderInternetOffers(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  if (source.provider === "RED by SFR") return parseRedInternet(html, source, retrievedAt);
  if (source.provider === "B&You") return parseBouyguesInternet(html, source, retrievedAt);
  if (source.provider === "Free") return parseFreeInternet(html, source, retrievedAt);
  return [];
}
