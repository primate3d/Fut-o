import { htmlToText } from "../../mobile-offers/html";
import { discoverApprovedPageLinks } from "../discovery";
import { fetchCommercialResource } from "../fetch";
import { frenchAmount, commercialDocumentText, commonOfferFields, evidence, excerptAround } from "../parsing";
import { extractPdfText } from "../pdf";
import type {
  CommercialCollectionResult,
  CommercialCollectorOptions,
  CommercialSourceDefinition,
  ElectricityOffer,
  GasOffer,
} from "../types";
import { validateAndDedupeCommercialOffers } from "../validate";

function textFromHtml(html: string) {
  return commercialDocumentText(html, htmlToText(html));
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function parseFrenchDate(value: string | undefined) {
  const match = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z` : null;
}

function parseFrenchExclusiveEndDate(value: string | undefined) {
  const start = parseFrenchDate(value);
  return start ? new Date(Date.parse(start) - 1).toISOString() : null;
}

function parseFrenchMonthValidity(text: string) {
  const match = text.match(/Grille tarifaire\s*-\s*([a-zéû]+)\s+(\d{4})/i);
  if (!match) return null;
  const monthName = match[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  const month = months.indexOf(monthName);
  if (month < 0) return null;
  const year = Number(match[2]);
  return {
    validFrom: new Date(Date.UTC(year, month, 1)).toISOString(),
    validUntil: new Date(Date.UTC(year, month + 1, 1) - 1).toISOString(),
  };
}

function number(value: string | undefined) {
  return frenchAmount(value) ?? 0;
}

function electricityOffer(
  source: CommercialSourceDefinition,
  retrievedAt: string,
  input: {
    name: string;
    pricingMode: ElectricityOffer["pricingMode"];
    tariffOption: ElectricityOffer["tariffOption"];
    subscriptions: Record<string, number>;
    base?: number;
    peak?: number;
    offPeak?: number;
    priceRevision: string;
    evidenceText: string;
    conditions?: string[];
    validFrom?: string | null;
    validUntil?: string | null;
  },
) {
  const offer = electricityBase(source, retrievedAt, input.name);
  return {
    ...offer,
    pricingMode: input.pricingMode,
    tariffOption: input.tariffOption,
    powerKva: Object.keys(input.subscriptions).map(Number),
    monthlySubscriptionByPower: input.subscriptions,
    basePricePerKwh: input.base ?? null,
    peakPricePerKwh: input.peak ?? null,
    offPeakPricePerKwh: input.offPeak ?? null,
    taxesIncluded: true,
    priceRevision: input.priceRevision,
    eligibilityConditions: input.conditions ?? ["Offre réservée aux clients particuliers éligibles."],
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    evidence: [
      ...offer.evidence,
      ...evidence("tariffOption", input.evidenceText, source.sourceUrl, retrievedAt),
      ...evidence("subscription", input.evidenceText, source.sourceUrl, retrievedAt),
      ...evidence("energyPrice", input.evidenceText, source.sourceUrl, retrievedAt),
    ],
  } satisfies ElectricityOffer;
}

function electricityBase(source: CommercialSourceDefinition, retrievedAt: string, name: string): ElectricityOffer {
  return {
    ...commonOfferFields(source, name, retrievedAt),
    sector: "electricity",
    pricingMode: "UNKNOWN",
    tariffOption: "UNKNOWN",
    powerKva: [],
    monthlySubscriptionByPower: {},
    basePricePerKwh: null,
    peakPricePerKwh: null,
    offPeakPricePerKwh: null,
    tempoPrices: {},
    taxesIncluded: null,
    priceRevision: null,
    eligibilityConditions: [],
  };
}

function gasBase(source: CommercialSourceDefinition, retrievedAt: string, name: string): GasOffer {
  return {
    ...commonOfferFields(source, name, retrievedAt),
    sector: "gas",
    pricingMode: "UNKNOWN",
    consumptionClass: null,
    tariffZone: null,
    annualSubscription: null,
    pricePerKwh: null,
    taxesIncluded: null,
    priceRevision: null,
    eligibilityConditions: [],
    referenceOnly: false,
  };
}

function parseEdf(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const baseSection = excerptAround(text, /L['’]offre Tarif Bleu \(option Base\)/i, 1_100);
  const hphcSection = excerptAround(text, /L['’]offre Tarif Bleu \(option Heures Creuses\)/i, 1_500)
    ?? excerptAround(text, /option Heures Creuses/i, 1_500);
  const offers: ElectricityOffer[] = [];
  if (baseSection) {
    const rows = [...baseSection.matchAll(/(?:^|\s)(3|6|9|12|15|18|24|30|36)\s+(\d+[,.]\d+)\s+(0[,.]\d+)/g)];
    const subscriptions = Object.fromEntries(rows.map((row) => [row[1], number(row[2])]));
    const basePrice = rows[0] ? number(rows[0][3]) : 0;
    if (!subscriptions["3"] || !subscriptions["6"] || !basePrice) return [];
    const offer = electricityBase(source, retrievedAt, "Tarif Bleu - Base");
    offers.push({
      ...offer,
      pricingMode: "REGULATED",
      tariffOption: "BASE",
      powerKva: [3, 6],
      monthlySubscriptionByPower: { "3": subscriptions["3"], "6": subscriptions["6"] },
      basePricePerKwh: basePrice,
      taxesIncluded: true,
      priceRevision: "Tarif reglemente, susceptible d'evoluer jusqu'a deux fois par an.",
      eligibilityConditions: ["Depuis le 1er fevrier 2026, les puissances Base de 9 a 36 kVA ne sont plus disponibles a la souscription."],
      evidence: [...offer.evidence,
        ...evidence("tariffOption", baseSection, source.sourceUrl, retrievedAt),
        ...evidence("subscription", baseSection, source.sourceUrl, retrievedAt),
        ...evidence("energyPrice", baseSection, source.sourceUrl, retrievedAt)],
    });
  }
  if (hphcSection) {
    const rows = [...hphcSection.matchAll(/(?:^|\s)(3|6|9|12|15|18|24|30|36)\s+(\d+[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)/g)];
    const subscriptions = Object.fromEntries(rows.map((row) => [row[1], number(row[2])]));
    const referenceRow = rows.find((row) => row[1] === "6") ?? rows[0];
    const peakPrice = referenceRow ? number(referenceRow[3]) : 0;
    const offPeakPrice = referenceRow ? number(referenceRow[4]) : 0;
    if (!subscriptions["6"] || !peakPrice || !offPeakPrice) return offers;
    const offer = electricityBase(source, retrievedAt, "Tarif Bleu - Heures Pleines / Heures Creuses");
    offers.push({
      ...offer,
      pricingMode: "REGULATED",
      tariffOption: "HPHC",
      powerKva: Object.keys(subscriptions).map(Number).filter((power) => power >= 6),
      monthlySubscriptionByPower: subscriptions,
      peakPricePerKwh: peakPrice,
      offPeakPricePerKwh: offPeakPrice,
      taxesIncluded: true,
      priceRevision: "Tarif reglemente, susceptible d'evoluer jusqu'a deux fois par an.",
      eligibilityConditions: ["Huit heures creuses quotidiennes fixees localement par Enedis."],
      evidence: [...offer.evidence,
        ...evidence("tariffOption", hphcSection, source.sourceUrl, retrievedAt),
        ...evidence("subscription", hphcSection, source.sourceUrl, retrievedAt),
        ...evidence("energyPrice", hphcSection, source.sourceUrl, retrievedAt)],
    });
  }
  return offers;
}

function parseTotalElectricity(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const baseSection = excerptAround(text, /Grille Access [ée]lectricit[ée] - option tarifaire Base[^]{0,1200}?6\s*kVA\s+0[,.]\d+\s*HT\s*\/\s*0[,.]\d+\s*TTC/i, 50);
  const hphcSection = excerptAround(text, /Grille Access [ée]lectricit[ée] - option tarifaire Heures Pleines \/ Heures Creuses[^]{0,1600}?6\s*kVA\s+0[,.]\d+\s*HT\s*\/\s*0[,.]\d+\s*TTC\s+0[,.]\d+\s*HT\s*\/\s*0[,.]\d+\s*TTC/i, 50);
  const offers: ElectricityOffer[] = [];
  if (baseSection) {
    const offer = electricityBase(source, retrievedAt, "Offre Access Electricite - Base");
    const subscriptions = Object.fromEntries([...baseSection.matchAll(/(\d+)\s*kVa\s+\d+[,.]\d+\s+(\d+[,.]\d+)/gi)]
      .map((match) => [match[1], number(match[2])]));
    const price = number(baseSection.match(/6\s*kVA\s+0[,.]\d+\s*HT\s*\/\s*(0[,.]\d+)\s*TTC/i)?.[1]);
    offers.push({ ...offer, pricingMode: "INDEXED", tariffOption: "BASE", powerKva: [3, 6, 9],
      monthlySubscriptionByPower: subscriptions, basePricePerKwh: price || null,
      taxesIncluded: true, priceRevision: "Prix indexe sur le TRVE.",
      eligibilityConditions: ["Offre reservee aux particuliers selon grille tarifaire en vigueur."],
      evidence: [...offer.evidence, ...evidence("tariffOption", baseSection, source.sourceUrl, retrievedAt),
        ...evidence("subscription", baseSection, source.sourceUrl, retrievedAt), ...evidence("energyPrice", baseSection, source.sourceUrl, retrievedAt)] });
  }
  if (hphcSection) {
    const offer = electricityBase(source, retrievedAt, "Offre Access Electricite - HP/HC");
    const subscriptions = Object.fromEntries([...hphcSection.matchAll(/(\d+)\s*kVA\s+\d+[,.]\d+\s+(\d+[,.]\d+)/gi)]
      .map((match) => [match[1], number(match[2])]));
    const prices = hphcSection.match(/6\s*kVA\s+0[,.]\d+\s*HT\s*\/\s*(0[,.]\d+)\s*TTC\s+0[,.]\d+\s*HT\s*\/\s*(0[,.]\d+)\s*TTC/i);
    offers.push({ ...offer, pricingMode: "INDEXED", tariffOption: "HPHC", powerKva: [6, 9, 12, 15, 18],
      monthlySubscriptionByPower: subscriptions,
      peakPricePerKwh: prices ? number(prices[1]) : null, offPeakPricePerKwh: prices ? number(prices[2]) : null, taxesIncluded: true,
      priceRevision: "Prix indexe sur le TRVE.", eligibilityConditions: ["Option HP/HC et compteur compatible requis."],
      evidence: [...offer.evidence, ...evidence("tariffOption", hphcSection, source.sourceUrl, retrievedAt),
        ...evidence("subscription", hphcSection, source.sourceUrl, retrievedAt), ...evidence("energyPrice", hphcSection, source.sourceUrl, retrievedAt)] });
  }
  return offers;
}

function parseTotalGas(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const section = excerptAround(text, /Offre Access gaz Partie abonnement[^]{0,3000}?T2 \(Zone 6\)[^]{0,120}?0[,.]\d+\s*TTC/i, 30);
  if (!section) return [];
  const offers: GasOffer[] = [];
  const pricesFor = (className: string) => Array.from({ length: 6 }, (_, index) =>
    number(section.match(new RegExp(`${className}\\s+(?:\\(Zone\\s+${index + 1}\\)|Zone\\s+${index + 1})[^0]{0,40}(?:0[,.]\\d+\\s*HT\\s*\\/\\s*)?(0[,.]\\d+)`, "i"))?.[1]));
  const pricesT1 = pricesFor("T1");
  const pricesT2 = pricesFor("T2");
  const subscriptionT1 = number(section.match(/T1\s+\(Zone\s+1\)[^]{0,80}?(\d+[,.]\d+)/i)?.[1]);
  const subscriptionT2 = number(section.match(/T2\s+\(Zone\s+1\)[^]{0,80}?(\d+[,.]\d+)/i)?.[1]);
  if (!subscriptionT1 || !subscriptionT2 || pricesT1.some((price) => price === 0) || pricesT2.some((price) => price === 0)) return [];
  for (const [className, subscription, prices] of [["T1", subscriptionT1 * 12, pricesT1], ["T2", subscriptionT2 * 12, pricesT2]] as const) {
    prices.forEach((price, index) => {
      const zone = String(index + 1);
      const offer = gasBase(source, retrievedAt, `Offre Access Gaz ${className} - Zone ${zone}`);
      offers.push({ ...offer, pricingMode: "INDEXED", consumptionClass: className, tariffZone: zone,
        annualSubscription: Math.round(subscription * 100) / 100, pricePerKwh: price, taxesIncluded: true,
        priceRevision: "Grille mensuelle; verifier la date de mise a jour avant comparaison.",
        eligibilityConditions: [className === "T1" ? "Consommation annuelle inferieure a 4 MWh." : "Consommation annuelle superieure ou egale a 4 MWh."],
        evidence: [...offer.evidence, ...evidence("subscription", section, source.sourceUrl, retrievedAt),
          ...evidence("energyPrice", section, source.sourceUrl, retrievedAt)] });
    });
  }
  return offers;
}

function parseMintElectricity(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const baseSection = text.match(/Option tarifaire BASE([\s\S]+?)Puissance Abonnement mensuel Prix du kWh HP HC/i)?.[1];
  const hphcMatch = text.match(/Puissance Abonnement mensuel Prix du kWh HP HC([\s\S]+?)Le tarif applicable depend|Puissance Abonnement mensuel Prix du kWh HP HC([\s\S]+?)Le tarif applicable dépend/i)
    ?? text.match(/Puissance Abonnement mensuel Prix du kWh HP HC([\s\S]+?)Conditions particulieres|Puissance Abonnement mensuel Prix du kWh HP HC([\s\S]+?)Conditions particulières/i);
  const hphcSection = hphcMatch?.[1] ?? hphcMatch?.[2];
  if (!baseSection || !hphcSection) return [];
  const subscriptions = [...baseSection.matchAll(/(\d+)\s*kVA\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)/gi)]
    .map((match) => ({ power: Number(match[1]), monthly: number(match[3]) }));
  const baseRates = [...baseSection.matchAll(/0[,.]\d+/g)].map((match) => number(match[0]));
  const hphcRows = [...hphcSection.matchAll(/(\d+)\s*kVA\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)/gi)];
  const hphcRates = [...hphcSection.matchAll(/0[,.]\d+/g)].map((match) => number(match[0]));
  if (subscriptions.length < 2 || baseRates.length < 4 || hphcRows.length === 0 || hphcRates.length < 4) return [];
  const group = (predicate: (power: number) => boolean) => Object.fromEntries(
    subscriptions.filter((row) => predicate(row.power)).map((row) => [String(row.power), row.monthly]),
  );
  const hphcSubscriptions = Object.fromEntries(hphcRows.map((match) => [match[1], number(match[3])]));
  const revision = "Prix du kWh indexé sur le TRVE avec remise garantie un an; conditions révisées ensuite.";
  return [
    electricityOffer(source, retrievedAt, { name: "Online & Green - Base jusqu'à 6 kVA", pricingMode: "INDEXED", tariffOption: "BASE",
      subscriptions: group((power) => power <= 6), base: baseRates[1], priceRevision: revision, evidenceText: baseSection }),
    electricityOffer(source, retrievedAt, { name: "Online & Green - Base supérieure à 6 kVA", pricingMode: "INDEXED", tariffOption: "BASE",
      subscriptions: group((power) => power > 6), base: baseRates[3], priceRevision: revision, evidenceText: baseSection }),
    electricityOffer(source, retrievedAt, { name: "Online & Green - Heures Pleines / Heures Creuses", pricingMode: "INDEXED", tariffOption: "HPHC",
      subscriptions: hphcSubscriptions, peak: hphcRates[1], offPeak: hphcRates[3], priceRevision: revision, evidenceText: hphcSection,
      conditions: ["Option HP/HC et compteur compatible requis."] }),
  ];
}

function parsePlenitudeElectricity(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const sectionMatch = text.match(/Grille tarifaire de reference([\s\S]+?)Precisions sur votre offre|Grille tarifaire de référence([\s\S]+?)Précisions sur votre offre/i);
  const section = sectionMatch?.[1] ?? sectionMatch?.[2];
  if (!section) return [];
  const rows = [...section.matchAll(/(\d+)\s*kVA\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)/gi)]
    .map((match) => ({ power: Number(match[1]), baseSubscription: money(number(match[3]) / 12), basePrice: number(match[5]),
      hphcSubscription: money(number(match[7]) / 12), peakPrice: number(match[9]), offPeakPrice: number(match[11]) }));
  if (rows.length === 0) return [];
  const dates = text.match(/souscription du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})\s+non inclus/i);
  if (!dates) return [];
  const validity = { validFrom: parseFrenchDate(dates[1]), validUntil: parseFrenchExclusiveEndDate(dates[2]) };
  const revision = "Prix HT du kWh et de l'abonnement fixes pendant douze mois, hors évolution de la fiscalité.";
  const baseGroups = new Map<number, typeof rows>();
  for (const row of rows) baseGroups.set(row.basePrice, [...(baseGroups.get(row.basePrice) ?? []), row]);
  const baseOffers = [...baseGroups.entries()].map(([price, group], index) => electricityOffer(source, retrievedAt, {
    name: `Pleniweb 1 an - Base${baseGroups.size > 1 ? index === 0 ? " jusqu'à 6 kVA" : " supérieure à 6 kVA" : ""}`,
    pricingMode: "FIXED", tariffOption: "BASE", subscriptions: Object.fromEntries(group.map((row) => [String(row.power), row.baseSubscription])),
    base: price, priceRevision: revision, evidenceText: section, ...validity,
  }));
  return [...baseOffers, electricityOffer(source, retrievedAt, {
    name: "Pleniweb 1 an - Heures Pleines / Heures Creuses", pricingMode: "FIXED", tariffOption: "HPHC",
    subscriptions: Object.fromEntries(rows.map((row) => [String(row.power), row.hphcSubscription])), peak: rows[0].peakPrice,
    offPeak: rows[0].offPeakPrice, priceRevision: revision, evidenceText: section, conditions: ["Option HP/HC et compteur compatible requis."], ...validity,
  })];
}

function gasOffer(
  source: CommercialSourceDefinition,
  retrievedAt: string,
  input: { name: string; pricingMode: GasOffer["pricingMode"]; consumptionClass: string; tariffZone: string | null;
    subscription: number; price: number; evidenceText: string; revision: string; validFrom?: string | null; validUntil?: string | null },
) {
  const offer = gasBase(source, retrievedAt, input.name);
  return { ...offer, pricingMode: input.pricingMode, consumptionClass: input.consumptionClass, tariffZone: input.tariffZone,
    annualSubscription: input.subscription, pricePerKwh: input.price, taxesIncluded: true, priceRevision: input.revision,
    eligibilityConditions: [input.consumptionClass === "T1" ? "Consommation annuelle inférieure à 4 MWh." : "Consommation annuelle supérieure ou égale à 4 MWh."],
    validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null,
    evidence: [...offer.evidence, ...evidence("subscription", input.evidenceText, source.sourceUrl, retrievedAt),
      ...evidence("energyPrice", input.evidenceText, source.sourceUrl, retrievedAt)] } satisfies GasOffer;
}

function parseEngieGas(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const sectionMatch = text.match(/Grille tarifaire\s*-\s*[^]{0,300}?Plage de consommation previsionnelle([\s\S]+?)Gaz Adapt 1 an|Grille tarifaire\s*-\s*[^]{0,300}?Plage de consommation prévisionnelle([\s\S]+?)Gaz Adapt 1 an/i);
  const section = sectionMatch?.[1] ?? sectionMatch?.[2];
  if (!section) return [];
  const subscriptions = section.match(/Abonnement en EUR\s*\/\s*an\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)/i);
  const prices = section.match(/Niveau 1\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)/i);
  const validity = parseFrenchMonthValidity(text);
  if (!subscriptions || !prices || !validity) return [];
  const t1 = gasOffer(source, retrievedAt, { name: "Gaz Adapt 1 an - moins de 4 MWh", pricingMode: "INDEXED", consumptionClass: "T1",
    tariffZone: null, subscription: number(subscriptions[2]), price: number(prices[2]), evidenceText: section,
    revision: "Abonnement et prix du kWh indexés mensuellement sur le prix repère de vente du gaz.", ...validity });
  const t2Prices = [number(prices[4]), ...[...section.matchAll(/Niveau\s+[2-6]\s+(0[,.]\d+)\s+(0[,.]\d+)/gi)].map((match) => number(match[1]))];
  return [t1, ...t2Prices.map((price, index) => gasOffer(source, retrievedAt, { name: `Gaz Adapt 1 an - T2 niveau ${index + 1}`,
    pricingMode: "INDEXED", consumptionClass: "T2", tariffZone: String(index + 1), subscription: number(subscriptions[4]), price,
    evidenceText: section, revision: "Abonnement et prix du kWh indexés mensuellement sur le prix repère de vente du gaz.", ...validity }))];
}

function parsePlenitudeGas(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const section = text.match(/Option tarifaire Abonnement[^]{0,900}?<\s*4\s*MWh\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)\s+[≥>]\s*4\s*MWh\s+(\d+[,.]\d+)\s+(\d+[,.]\d+)\s+(0[,.]\d+)\s+(0[,.]\d+)/i);
  if (!section) return [];
  const dates = text.match(/souscription du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})\s+non inclus/i);
  if (!dates) return [];
  const validity = { validFrom: parseFrenchDate(dates[1]), validUntil: parseFrenchExclusiveEndDate(dates[2]) };
  const evidenceText = section[0];
  const revision = "Prix HT du kWh et de l'abonnement fixes pendant douze mois, hors évolution de la fiscalité.";
  return [
    gasOffer(source, retrievedAt, { name: "Pleniweb 1 an Gaz - moins de 4 MWh", pricingMode: "FIXED", consumptionClass: "T1",
      tariffZone: null, subscription: number(section[2]), price: number(section[4]), evidenceText, revision, ...validity }),
    gasOffer(source, retrievedAt, { name: "Pleniweb 1 an Gaz - 4 MWh et plus", pricingMode: "FIXED", consumptionClass: "T2",
      tariffZone: null, subscription: number(section[6]), price: number(section[8]), evidenceText, revision, ...validity }),
  ];
}

function parseCreGas(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const section = excerptAround(text, /Grille du prix rep[èe]re de vente du gaz/i, 1_200);
  if (!section) return [];
  const subscriptions = section.match(/Abonnement[^]{0,120}?(\d+[,.]\d+)\s+(\d+[,.]\d+)/i);
  const prices = section.match(/Prix[^]{0,120}?(0[,.]\d+)\s+(0[,.]\d+)/i);
  if (!subscriptions || !prices) return [];
  const definitions = [
    { name: "Prix repere CRE - Cuisson/eau chaude", className: "cuisson-eau-chaude", subscription: number(subscriptions[1]), price: number(prices[1]) },
    { name: "Prix repere CRE - Chauffage", className: "chauffage", subscription: number(subscriptions[2]), price: number(prices[2]) },
  ];
  return definitions.map((definition): GasOffer => {
    const offer = gasBase(source, retrievedAt, definition.name);
    return { ...offer, pricingMode: "INDEXED", consumptionClass: definition.className, tariffZone: "GRDF",
      annualSubscription: definition.subscription, pricePerKwh: definition.price, taxesIncluded: true,
      priceRevision: "Reference indicative mise a jour mensuellement par la CRE.",
      eligibilityConditions: ["Reference moyenne pour clients residentiels raccordes au reseau GRDF."],
      referenceOnly: true, conditions: ["Reference de comparaison, pas une offre souscriptible."],
      evidence: [...offer.evidence, ...evidence("subscription", section, source.sourceUrl, retrievedAt),
        ...evidence("energyPrice", section, source.sourceUrl, retrievedAt)] };
  });
}

export function parseEnergyOffers(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const text = textFromHtml(html);
  if (source.sector === "electricity" && source.provider === "EDF") return parseEdf(text, source, retrievedAt);
  if (source.sector === "electricity" && source.provider === "TotalEnergies") return parseTotalElectricity(text, source, retrievedAt);
  if (source.sector === "electricity" && source.provider === "Mint Energie") return parseMintElectricity(text, source, retrievedAt);
  if (source.sector === "electricity" && source.provider === "Plenitude") return parsePlenitudeElectricity(text, source, retrievedAt);
  if (source.sector === "gas" && source.provider === "TotalEnergies") return parseTotalGas(text, source, retrievedAt);
  if (source.sector === "gas" && source.provider === "Engie") return parseEngieGas(text, source, retrievedAt);
  if (source.sector === "gas" && source.provider === "Plenitude") return parsePlenitudeGas(text, source, retrievedAt);
  if (source.sector === "gas" && source.provider === "CRE") return parseCreGas(text, source, retrievedAt);
  return [];
}

export async function collectEnergySource(
  source: CommercialSourceDefinition,
  knownUrls: Iterable<string>,
  options: CommercialCollectorOptions = {},
): Promise<CommercialCollectionResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    const fetched = await fetchCommercialResource(source, options);
    if (fetched.notModified) return { source, retrievedAt, offers: [], failures: [], discoveredSources: [], cache: fetched.cache, notModified: true };
    const content = fetched.body ?? (fetched.bytes ? await extractPdfText(fetched.bytes) : "");
    const checked = validateAndDedupeCommercialOffers(parseEnergyOffers(content, source, retrievedAt), source, new Date(retrievedAt));
    return {
      source, retrievedAt, offers: checked.offers,
      failures: checked.offers.length > 0 ? checked.failures : [{ code: "STRUCTURE_CHANGED", message: "Aucune grille energie exploitable.", sourceUrl: source.sourceUrl }],
      discoveredSources: fetched.body
        ? discoverApprovedPageLinks(fetched.body, source, knownUrls, retrievedAt)
        : [],
      cache: fetched.cache, notModified: false,
    };
  } catch (error) {
    return { source, retrievedAt, offers: [], failures: [{ code: "FETCH_FAILED", message: error instanceof Error ? error.message : "Erreur inconnue", sourceUrl: source.sourceUrl }],
      discoveredSources: [], cache: { etag: options.previousCache?.etag ?? null, lastModified: options.previousCache?.lastModified ?? null,
        contentHash: options.previousCache?.contentHash ?? null }, notModified: false };
  }
}
