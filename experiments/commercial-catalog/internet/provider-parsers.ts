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

type CardDefinition = {
  name: string;
  marker: RegExp;
  offerUrl?: string;
  extraConditions?: string[];
};

function cardFor(text: string, marker: RegExp) {
  const flags = marker.flags.includes("g") ? marker.flags : `${marker.flags}g`;
  const matcher = new RegExp(marker.source, flags);
  for (const match of text.matchAll(matcher)) {
    const card = text.slice(match.index, match.index + 1_200);
    if (/\d{1,3}(?:\s*€\s*\d{2}|[,.]\d{2})\s*€?\s*(?:\/\s*mois|par mois)/i.test(card)) {
      return card;
    }
  }
  return null;
}

function normalizeSplitPrices(value: string) {
  return value.replace(/(\d{1,3})\s*€\s*(\d{2})/g, "$1,$2 €");
}

function cardPricing(card: string) {
  const normalized = normalizeSplitPrices(card);
  const explicitPromotion = normalized.match(
    /(\d{1,3}[,.]\d{2})\s+euros?\s+par\s+mois,?\s+au lieu de\s+\d{1,3}[,.]\d{2}\s*€?\s+par\s+mois[^]{0,50}?pendant\s+(\d{1,2})\s*mois\s+puis\s+(\d{1,3}[,.]\d{2})\s*€?\s*\/\s*mois/i,
  );
  const promotion = explicitPromotion ?? normalized.match(
    /(\d{1,3}[,.]\d{2})\s*€?\s*(?:\/\s*mois|par mois)[^]{0,90}?pendant\s+(?:1\s*an|(\d{1,2})\s*mois)[^]{0,90}?puis\s*(\d{1,3}[,.]\d{2})\s*€?\s*(?:\/\s*mois)?/i,
  );
  if (promotion) {
    const promotionPrice = frenchAmount(promotion[1]);
    const priceAfterPromotion = frenchAmount(promotion[3]);
    if (promotionPrice !== null && priceAfterPromotion !== null) {
      return {
        monthlyPrice: priceAfterPromotion,
        promotionPrice,
        promotionDurationMonths: promotion[2] ? Number(promotion[2]) : 12,
        priceAfterPromotion,
        proof: promotion[0],
      };
    }
  }
  const stable = normalized.match(/(\d{1,3}[,.]\d{2})\s*€?\s*(?:\/\s*mois|par mois)/i);
  const monthlyPrice = frenchAmount(stable?.[1]);
  return monthlyPrice === null ? null : {
    monthlyPrice,
    promotionPrice: null,
    promotionDurationMonths: null,
    priceAfterPromotion: null,
    proof: stable?.[0] ?? null,
  };
}

function feeAmount(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  return frenchAmount(match?.[1]);
}

function cardSpeed(card: string, direction: "down" | "up") {
  const arrow = direction === "down" ? "↓" : "↑";
  const label = direction === "down" ? "descendant|téléchargement" : "montant|envoi|[ée]mission";
  const beforeArrow = card.match(new RegExp(
    `(\\d+(?:[,.]\\d+)?)\\s*(G|M)(?:b|bit)\\/s\\s*${arrow}`,
    "i",
  ));
  const match = beforeArrow ?? card.match(new RegExp(
    `(?:${arrow}|${label})[^\\d]{0,30}(\\d+(?:[,.]\\d+)?)\\s*(G|M)(?:b|bit)\\/s`,
    "i",
  ));
  const amount = frenchAmount(match?.[1]);
  if (amount === null) return null;
  return match?.[2]?.toUpperCase() === "G" ? amount * 1_000 : amount;
}

function cardServices(card: string) {
  const services: string[] = [];
  const wifi = card.match(/Wi-?Fi\s*\d(?:E)?/i)?.[0];
  if (wifi) services.push(wifi.replace(/wifi/i, "Wi-Fi"));
  const tv = card.match(/(?:\+\s*de\s*)?\d{2,3}\s*cha[iî]nes(?:\s*TV)?|décodeur\s+TV|TV\s+incluse?/i)?.[0];
  if (tv) services.push(tv);
  if (/appels illimités? vers les fixes/i.test(card)) services.push("Appels fixes inclus");
  return services;
}

function parseOfficialCards(
  html: string,
  source: CommercialSourceDefinition,
  retrievedAt: string,
  definitions: CardDefinition[],
) {
  const text = sourceText(html);
  const activationProof = excerptAround(text, /frais (?:de mise en service|d['’]ouverture de service)[^.]{0,80}?(?:\d+[,.]?\d*\s*€|offerts?)/i);
  const terminationProof = excerptAround(text, /frais de r[ée]siliation[^.]{0,60}?\d+[,.]?\d*\s*€/i);
  const eligibilityProof = excerptAround(text, /sous r[ée]serve d['’]?éligibilit[ée][^.]{0,180}/i);
  return definitions.flatMap((definition): InternetOffer[] => {
    const card = cardFor(text, definition.marker);
    if (!card) return [];
    const pricing = cardPricing(card);
    const downloadMbps = cardSpeed(card, "down");
    if (!pricing || downloadMbps === null) return [];
    const offer = baseInternetOffer(source, retrievedAt, definition.name);
    const commitmentMatch = card.match(/sans engagement|engagement\s*(?:12\s*mois|1\s*an)/i);
    const commitmentProof = commitmentMatch?.[0] ?? null;
    const commitmentMonths = commitmentMatch
      ? /sans engagement/i.test(commitmentMatch[0]) ? 0 : 12
      : null;
    const activationFees = feeAmount(text, /frais (?:de mise en service|d['’]ouverture de service)(?:\s*:\s*|\s+de\s+)(\d+[,.]?\d*)\s*€/i);
    const activationFeeRefundConditional = activationFees !== null && /frais (?:de mise en service|d['’]ouverture de service)[^.]{0,80}?offerts?\s*\*/i.test(activationProof ?? "");
    const terminationFees = feeAmount(text, /frais de r[ée]siliation(?:\s*:\s*|\s+de\s+)(\d+[,.]?\d*)\s*€/i);
    return [{
      ...offer,
      offerUrl: definition.offerUrl ?? null,
      technology: /fibre|fiber|ftth/i.test(card) ? "FIBER" : "UNKNOWN",
      ...pricing,
      promotionConditions: pricing.promotionPrice === null ? [] : ["Tarif promotionnel limite a la duree indiquee."],
      commitmentMonths,
      activationFees,
      activationFeeRefund: activationFeeRefundConditional ? activationFees : null,
      activationFeeRefundConditional,
      terminationFees,
      downloadMbps,
      uploadMbps: cardSpeed(card, "up"),
      includedServices: cardServices(card),
      eligibilityConditions: eligibilityProof ? [eligibilityProof] : [],
      conditions: definition.extraConditions ?? [],
      evidence: [
        ...offer.evidence,
        ...evidence(pricing.promotionPrice === null ? "monthlyPrice" : "promotionPrice", pricing.proof, source.sourceUrl, retrievedAt),
        ...evidence("technology", excerptAround(card, /fibre|fiber|ftth/i), source.sourceUrl, retrievedAt),
        ...evidence("commitmentMonths", commitmentProof, source.sourceUrl, retrievedAt),
        ...evidence("activationFees", activationProof, source.sourceUrl, retrievedAt),
        ...evidence("terminationFees", terminationProof, source.sourceUrl, retrievedAt),
        ...evidence("downloadMbps", excerptAround(card, /↓|descendant|téléchargement/i), source.sourceUrl, retrievedAt),
      ],
    }];
  });
}

export function parseOrangeInternet(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  return parseOfficialCards(html, source, retrievedAt, [
    { name: "Livebox Lite Fibre", marker: /(?:Série Spéciale )?Livebox\s+Lite/i },
    { name: "Livebox Classic Fibre", marker: /Livebox\s+Classic/i },
    { name: "Livebox Up Fibre", marker: /Livebox\s+Up/i },
    { name: "Livebox Max Fibre", marker: /Livebox\s+Max/i },
  ]);
}

export function parseSfrInternet(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  return parseOfficialCards(html, source, retrievedAt, [
    { name: "SFR Fibre Starter", marker: /SFR Fibre Starter/i },
    { name: "SFR Fibre Power S", marker: /SFR Fibre Power S\s+WiFi/i },
    { name: "SFR Fibre Power", marker: /SFR Fibre Power\s+Le tr[èe]s haut d[ée]bit/i },
    { name: "SFR Fibre Premium", marker: /SFR Fibre Premium\s+D[ée]bit exceptionnel/i },
  ]);
}

export function parseBouyguesBboxInternet(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  return parseOfficialCards(html, source, retrievedAt, [
    { name: "Bbox fit", marker: /Bbox fit/i, offerUrl: "https://www.bouyguestelecom.fr/offres-internet/bbox-fit" },
    { name: "Bbox must", marker: /Bbox must/i, offerUrl: "https://www.bouyguestelecom.fr/offres-internet/bbox-must" },
    { name: "Bbox ultym", marker: /Bbox ultym\s+La puissance/i, offerUrl: "https://www.bouyguestelecom.fr/offres-internet/bbox-ultym" },
  ]).map((offer) => ({
    ...offer,
    conditions: [
      ...offer.conditions,
      "Le tarif public hors remise Box + forfait mobile est utilise; toute remise groupee reste conditionnelle.",
    ],
  }));
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
      offerUrl: source.sourceUrl,
      ...common,
      downloadMbps: 1000,
      uploadMbps: 1000,
      includedServices: ["Wi-Fi 5"],
      evidence: [...baseInternetOffer(source, retrievedAt, "RED Box Fibre - Box 7").evidence,
        ...proofs, ...evidence("downloadMbps", box7Proof, source.sourceUrl, retrievedAt)],
    },
    ...(box8Proof ? [{
      ...baseInternetOffer(source, retrievedAt, "RED Box Fibre - Box 8"),
      offerUrl: source.sourceUrl,
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
      offerUrl: source.sourceUrl,
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
  const feeRefundProof = excerptAround(text, /Frais de mise en service\s*49\s*€\s*offerts? sur demande/i);
  const eligibilityProof = excerptAround(
    text,
    /Offres soumises [aà] conditions,?\s+sous r[ée]serve d['’][ée]ligibilit[ée][^.]+|Testez votre [ée]ligibilit[ée]|si votre adresse n['’]est pas encore [ée]ligible [aà] la Fibre/i,
  );
  const definitions = [
    { name: "Freebox Pop S", promo: null, after: 24.99, down: 5000, up: 900, services: ["Wi-Fi 7"], url: "https://www.free.fr/freebox/freebox-pop-s" },
    { name: "Freebox Révolution Light", promo: 24.99, after: 29.99, down: 1000, up: 900, services: ["Wi-Fi 5", "+300 chaines TV"], url: "https://www.free.fr/freebox/freebox-revolution-light" },
    { name: "Freebox Pop", promo: 29.99, after: 39.99, down: 5000, up: 900, services: ["Wi-Fi 7", "+300 chaines TV"], url: "https://www.free.fr/freebox/freebox-pop" },
    { name: "Freebox Ultra Essentiel", promo: 39.99, after: 49.99, down: 8000, up: 8000, services: ["Wi-Fi 7", "+340 chaines TV"], url: "https://www.free.fr/freebox/freebox-ultra" },
    { name: "Freebox Ultra", promo: 49.99, after: 59.99, down: 8000, up: 8000, services: ["Wi-Fi 7", "+340 chaines TV", "Services de streaming inclus"], url: "https://www.free.fr/freebox/freebox-ultra" },
  ];
  const selectedDefinitions = source.parser === "free-pop-s-html-v1"
    ? definitions.filter((definition) => definition.name === "Freebox Pop S")
    : source.parser === "free-revolution-light-html-v1"
      ? definitions.filter((definition) => definition.name === "Freebox Révolution Light")
      : definitions.filter((definition) => !["Freebox Pop S", "Freebox Révolution Light"].includes(definition.name));
  return selectedDefinitions.flatMap((definition): InternetOffer[] => {
    const escapedName = definition.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const promoPattern = definition.promo === null
      ? String(definition.after).replace(".", "\\s*€?\\s*") + "\\s*\\/mois"
      : `${String(definition.promo).replace(".", "\\s*€?\\s*")}\\s*\\/mois[^]{0,80}?puis\\s*${String(definition.after).replace(".", "[,.]")}\\s*€\\s*\\/mois`;
    const card = excerptAround(text, new RegExp(`${escapedName}[^]{0,320}?${promoPattern}`, "i"), 40);
    if (!card) return [];
    const offer = baseInternetOffer(source, retrievedAt, definition.name);
    return [{
      ...offer,
      offerUrl: definition.url,
      technology: "FIBER",
      monthlyPrice: definition.after,
      promotionPrice: definition.promo,
      promotionDurationMonths: definition.promo === null ? null : 12,
      priceAfterPromotion: definition.promo === null ? null : definition.after,
      promotionConditions: definition.promo === null ? [] : ["Nouvelle souscription; remise perdue en cas de changement d'offre ou demenagement."],
      commitmentMonths: 0,
      activationFees: feeProof ? 49 : null,
      activationFeeRefund: feeRefundProof ? 49 : null,
      activationFeeRefundConditional: Boolean(feeRefundProof),
      terminationFees: feeProof ? 69 : null,
      downloadMbps: definition.down,
      uploadMbps: definition.up,
      includedServices: definition.services,
      eligibilityConditions: eligibilityProof ? [eligibilityProof] : [],
      conditions: feeRefundProof ? ["Frais de mise en service rembourses uniquement sur demande."] : [],
      evidence: [
        ...offer.evidence,
        ...evidence(definition.promo === null ? "monthlyPrice" : "promotionPrice", card, source.sourceUrl, retrievedAt),
        ...evidence("technology", card, source.sourceUrl, retrievedAt),
        ...evidence("commitmentMonths", excerptAround(card, /Sans engagement/i) ?? excerptAround(text, /Sans engagement/i), source.sourceUrl, retrievedAt),
        ...evidence("activationFees", feeProof, source.sourceUrl, retrievedAt),
        ...evidence("activationFeeRefund", feeRefundProof, source.sourceUrl, retrievedAt),
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
  const offer = { ...baseInternetOffer(source, retrievedAt, name), sourceUrl, offerUrl: "https://shop.sosh.fr/box-internet" };
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
  if (source.provider === "Orange") return parseOrangeInternet(html, source, retrievedAt);
  if (source.provider === "SFR") return parseSfrInternet(html, source, retrievedAt);
  if (source.provider === "Bouygues Telecom") return parseBouyguesBboxInternet(html, source, retrievedAt);
  if (source.provider === "RED by SFR") return parseRedInternet(html, source, retrievedAt);
  if (source.provider === "B&You") return parseBouyguesInternet(html, source, retrievedAt);
  if (source.provider === "Free") return parseFreeInternet(html, source, retrievedAt);
  return [];
}
