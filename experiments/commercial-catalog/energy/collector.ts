import { htmlToText } from "../../mobile-offers/html";
import { discoverApprovedPageLinks } from "../discovery";
import { fetchCommercialResource } from "../fetch";
import { commercialDocumentText, commonOfferFields, evidence, excerptAround } from "../parsing";
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
  const baseSection = excerptAround(text, /L['’]offre Tarif Bleu \(option Base\)[^]{0,650}?3\s+12[,.]13\s+0[,.]2001\s+6\s+15[,.]86/i, 30);
  const hphcSection = excerptAround(text, /L['’]offre Tarif Bleu \(option Heures Creuses\)[^]{0,850}?3\s+12[,.]13\s+0[,.]2142\s+0[,.]1589\s+6\s+15[,.]86/i, 30)
    ?? excerptAround(text, /option Heures Creuses[^]{0,850}?6\s+15[,.]86\s+0[,.]2142\s+0[,.]1589/i, 30);
  const offers: ElectricityOffer[] = [];
  if (baseSection) {
    const offer = electricityBase(source, retrievedAt, "Tarif Bleu - Base");
    offers.push({
      ...offer,
      pricingMode: "REGULATED",
      tariffOption: "BASE",
      powerKva: [3, 6],
      monthlySubscriptionByPower: { "3": 12.13, "6": 15.86 },
      basePricePerKwh: 0.2001,
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
    const offer = electricityBase(source, retrievedAt, "Tarif Bleu - Heures Pleines / Heures Creuses");
    offers.push({
      ...offer,
      pricingMode: "REGULATED",
      tariffOption: "HPHC",
      powerKva: [6, 9, 12, 15, 18, 24, 30, 36],
      monthlySubscriptionByPower: { "6": 15.86, "9": 19.88, "12": 23.76, "15": 27.40, "18": 31.14, "24": 39.14, "30": 46.47, "36": 53.88 },
      peakPricePerKwh: 0.2142,
      offPeakPricePerKwh: 0.1589,
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
  const baseSection = excerptAround(text, /Grille Access [ée]lectricit[ée] - option tarifaire Base[^]{0,700}?6\s*kVa\s+11[,.]94\s+15[,.]86[^]{0,300}?6\s*kVA\s+0[,.]1225\s*HT\s*\/\s*0[,.]1837\s*TTC/i, 20);
  const hphcSection = excerptAround(text, /Grille Access [ée]lectricit[ée] - option tarifaire Heures Pleines \/ Heures Creuses[^]{0,1000}?6\s*kVA\s+0[,.]1331\s*HT\s*\/\s*0[,.]1965\s*TTC\s+0[,.]0916\s*HT\s*\/\s*0[,.]1467\s*TTC/i, 20);
  const offers: ElectricityOffer[] = [];
  if (baseSection) {
    const offer = electricityBase(source, retrievedAt, "Offre Access Electricite - Base");
    offers.push({ ...offer, pricingMode: "INDEXED", tariffOption: "BASE", powerKva: [3, 6, 9],
      monthlySubscriptionByPower: { "3": 12.13, "6": 15.86, "9": 19.88 }, basePricePerKwh: 0.1837,
      taxesIncluded: true, priceRevision: "Prix indexe sur le TRVE.",
      eligibilityConditions: ["Offre reservee aux particuliers selon grille tarifaire en vigueur."],
      evidence: [...offer.evidence, ...evidence("tariffOption", baseSection, source.sourceUrl, retrievedAt),
        ...evidence("subscription", baseSection, source.sourceUrl, retrievedAt), ...evidence("energyPrice", baseSection, source.sourceUrl, retrievedAt)] });
  }
  if (hphcSection) {
    const offer = electricityBase(source, retrievedAt, "Offre Access Electricite - HP/HC");
    offers.push({ ...offer, pricingMode: "INDEXED", tariffOption: "HPHC", powerKva: [6, 9, 12, 15, 18],
      monthlySubscriptionByPower: { "6": 15.86, "9": 19.88, "12": 23.76, "15": 27.40, "18": 31.41 },
      peakPricePerKwh: 0.1965, offPeakPricePerKwh: 0.1467, taxesIncluded: true,
      priceRevision: "Prix indexe sur le TRVE.", eligibilityConditions: ["Option HP/HC et compteur compatible requis."],
      evidence: [...offer.evidence, ...evidence("tariffOption", hphcSection, source.sourceUrl, retrievedAt),
        ...evidence("subscription", hphcSection, source.sourceUrl, retrievedAt), ...evidence("energyPrice", hphcSection, source.sourceUrl, retrievedAt)] });
  }
  return offers;
}

function parseTotalGas(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const section = excerptAround(text, /Offre Access gaz Partie abonnement[^]{0,2200}?T2 \(Zone 6\)[^]{0,80}?0[,.]1562\s*TTC/i, 20);
  if (!section) return [];
  const offers: GasOffer[] = [];
  const pricesT1 = [0.1711, 0.1719, 0.1734, 0.1750, 0.1772, 0.1801];
  const pricesT2 = [0.1397, 0.1413, 0.1435, 0.1469, 0.1508, 0.1562];
  for (const [className, subscription, prices] of [["T1", 12.70 * 12, pricesT1], ["T2", 30.07 * 12, pricesT2]] as const) {
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

function parseCreGas(text: string, source: CommercialSourceDefinition, retrievedAt: string) {
  const section = excerptAround(text, /Grille du prix rep[èe]re de vente du gaz pour [^]{0,1000}?0[,.]15760/i, 20);
  if (!section) return [];
  const definitions = [
    { name: "Prix repere CRE - Cuisson/eau chaude", className: "cuisson-eau-chaude", subscription: 152.46, price: 0.19027 },
    { name: "Prix repere CRE - Chauffage", className: "chauffage", subscription: 360.79, price: 0.15760 },
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
  if (source.sector === "gas" && source.provider === "TotalEnergies") return parseTotalGas(text, source, retrievedAt);
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
    const html = fetched.body ?? "";
    const checked = validateAndDedupeCommercialOffers(parseEnergyOffers(html, source, retrievedAt), source, new Date(retrievedAt));
    return {
      source, retrievedAt, offers: checked.offers,
      failures: checked.offers.length > 0 ? checked.failures : [{ code: "STRUCTURE_CHANGED", message: "Aucune grille energie exploitable.", sourceUrl: source.sourceUrl }],
      discoveredSources: discoverApprovedPageLinks(html, source, knownUrls, retrievedAt), cache: fetched.cache, notModified: false,
    };
  } catch (error) {
    return { source, retrievedAt, offers: [], failures: [{ code: "FETCH_FAILED", message: error instanceof Error ? error.message : "Erreur inconnue", sourceUrl: source.sourceUrl }],
      discoveredSources: [], cache: { etag: options.previousCache?.etag ?? null, lastModified: options.previousCache?.lastModified ?? null,
        contentHash: options.previousCache?.contentHash ?? null }, notModified: false };
  }
}
