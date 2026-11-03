import { htmlToText } from "../../mobile-offers/html";
import { discoverApprovedPageLinks } from "../discovery";
import { fetchCommercialResource } from "../fetch";
import { commercialDocumentText, commonOfferFields, evidence, excerptAround } from "../parsing";
import type {
  CommercialCollectionResult,
  CommercialCollectorOptions,
  CommercialSourceDefinition,
  InsuranceOffer,
} from "../types";
import { validateAndDedupeCommercialOffers } from "../validate";

const HOME_GUARANTEES = [
  ["responsabilite civile", /responsabilit[ée] civile/i],
  ["degats des eaux", /d[ée]g[aâ]ts? des eaux/i],
  ["incendie", /incendie/i],
  ["vol", /(?:vol|cambriolage)/i],
  ["bris de glace", /bris de glace/i],
  ["evenements climatiques", /[ée]v[ée]nements? climatiques?|temp[êe]te/i],
] as const;

const CAR_GUARANTEES = [
  ["responsabilite civile", /responsabilit[ée] civile|assurance au tiers/i],
  ["bris de glace", /bris de glace/i],
  ["vol", /vol/i],
  ["incendie", /incendie/i],
  ["dommages tous accidents", /tous risques|dommages tous accidents/i],
  ["assistance", /assistance(?:\s+0\s*km)?/i],
  ["protection du conducteur", /protection du conducteur|garantie conducteur/i],
] as const;

function matchedItems(text: string, definitions: ReadonlyArray<readonly [string, RegExp]>) {
  return definitions.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

export function parseInsuranceProduct(html: string, source: CommercialSourceDefinition, retrievedAt: string) {
  if (source.sector !== "home_insurance" && source.sector !== "car_insurance") return [];
  const text = commercialDocumentText(html, htmlToText(html));
  const guaranteeDefinitions = source.sector === "home_insurance" ? HOME_GUARANTEES : CAR_GUARANTEES;
  const guarantees = matchedItems(text, guaranteeDefinitions);
  const guaranteeProof = excerptAround(text, source.sector === "home_insurance"
    ? /responsabilit[ée] civile|d[ée]g[aâ]ts? des eaux|incendie/i
    : /responsabilit[ée] civile|assurance au tiers|tous risques/i, 260);
  const quoteProof = excerptAround(text, /(?:obtenir|r[ée]aliser|demander|faire) (?:un|votre) devis|devis (?:gratuit|personnalis[ée]|en ligne)/i, 180);
  if (guarantees.length === 0 || !quoteProof) return [];
  const deductibles = matchedItems(text, [["franchise contractuelle", /franchise/i]]);
  const exclusions = matchedItems(text, [["exclusions contractuelles a verifier", /exclusions?|non couvert/i]]);
  const offerName = source.sector === "home_insurance"
    ? `Assurance habitation ${source.provider}`
    : `Assurance auto ${source.provider}`;
  const base = commonOfferFields(source, offerName, retrievedAt);
  const offer: InsuranceOffer = {
    ...base,
    sector: source.sector,
    productType: source.sector === "home_insurance" ? "multirisque habitation" : "assurance automobile",
    indicativeMonthlyPrice: null,
    quoteRequired: true,
    guarantees,
    deductibles,
    limits: [],
    exclusions,
    eligibilityConditions: ["Tarif et acceptation soumis au profil de risque et a un devis personnalise."],
    conditions: ["Aucune economie chiffree ne peut etre certifiee sans devis comparable."],
    evidence: [
      ...base.evidence,
      ...evidence("guarantees", guaranteeProof, source.sourceUrl, retrievedAt),
      ...evidence("quoteRequired", quoteProof, source.sourceUrl, retrievedAt),
    ],
  };
  return [offer];
}

export async function collectInsuranceSource(
  source: CommercialSourceDefinition,
  knownUrls: Iterable<string>,
  options: CommercialCollectorOptions = {},
): Promise<CommercialCollectionResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    const fetched = await fetchCommercialResource(source, options);
    if (fetched.notModified) return { source, retrievedAt, offers: [], failures: [], discoveredSources: [], cache: fetched.cache, notModified: true };
    const html = fetched.body ?? "";
    const checked = validateAndDedupeCommercialOffers(parseInsuranceProduct(html, source, retrievedAt), source, new Date(retrievedAt));
    return {
      source, retrievedAt, offers: checked.offers,
      failures: checked.offers.length > 0 ? checked.failures : [{ code: "STRUCTURE_CHANGED", message: "Aucun produit d'assurance prouvable.", sourceUrl: source.sourceUrl }],
      discoveredSources: discoverApprovedPageLinks(html, source, knownUrls, retrievedAt), cache: fetched.cache, notModified: false,
    };
  } catch (error) {
    return { source, retrievedAt, offers: [], failures: [{ code: "FETCH_FAILED", message: error instanceof Error ? error.message : "Erreur inconnue", sourceUrl: source.sourceUrl }],
      discoveredSources: [], cache: { etag: options.previousCache?.etag ?? null, lastModified: options.previousCache?.lastModified ?? null,
        contentHash: options.previousCache?.contentHash ?? null }, notModified: false };
  }
}
