import { htmlToText } from "../../mobile-offers/html";
import { discoverApprovedPageLinks } from "../discovery";
import { fetchApprovedCommercialUrl, fetchCommercialResource } from "../fetch";
import { extractPdfText } from "../pdf";
import type {
  CommercialCollectionResult,
  CommercialCollectorOptions,
  CommercialEvidence,
  CommercialSourceDefinition,
  InternetOffer,
  InternetTechnology,
} from "../types";
import { getCommercialOfferId, validateAndDedupeInternetOffers } from "../validate";
import { parseProviderInternetOffers, parseSoshContract } from "./provider-parsers";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function jsonLdNodes(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  const item = record(value);
  if (!item) return [];
  return [item, ...values(item["@graph"]).flatMap(jsonLdNodes)];
}

function extractJsonLdProducts(html: string): JsonRecord[] {
  const products: JsonRecord[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      for (const node of jsonLdNodes(JSON.parse(match[1]))) {
        const types = values(node["@type"]).map(String);
        if (types.includes("Product")) products.push(node);
      }
    } catch {
      // Invalid structured data is handled as a changed source structure.
    }
  }
  return products;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function properties(product: JsonRecord) {
  const result = new Map<string, string>();
  for (const raw of values(product.additionalProperty)) {
    const property = record(raw);
    if (!property) continue;
    const name = typeof property.name === "string" ? normalized(property.name) : "";
    const value = property.value;
    if (name && (typeof value === "string" || typeof value === "number")) {
      result.set(name, String(value));
    }
  }
  return result;
}

function property(map: Map<string, string>, ...names: string[]) {
  for (const [key, value] of map) {
    if (names.some((name) => key.includes(normalized(name)))) return value;
  }
  return null;
}

function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function months(value: string | null): number | null {
  if (!value) return null;
  if (/sans engagement|aucun engagement/i.test(value)) return 0;
  return amount(value);
}

function speedMbps(value: string | null): number | null {
  if (!value) return null;
  const parsed = amount(value);
  if (parsed === null) return null;
  return /gb(?:it)?\/s|gbps/i.test(value) ? parsed * 1000 : parsed;
}

function technology(value: string | null): InternetTechnology {
  const text = normalized(value ?? "");
  if ((text.includes("fibre") || text.includes("fiber")) && text.includes("adsl")) return "MIXED";
  if (text.includes("fibre") || text.includes("fiber") || text.includes("ftth")) return "FIBER";
  if (text.includes("cable")) return "CABLE";
  if (text.includes("vdsl")) return "VDSL";
  if (text.includes("adsl")) return "ADSL";
  return "UNKNOWN";
}

function list(value: string | null) {
  return value
    ? value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function evidence(
  field: string,
  excerpt: string | null,
  source: CommercialSourceDefinition,
  capturedAt: string,
): CommercialEvidence[] {
  return excerpt?.trim()
    ? [{ field, excerpt: excerpt.trim(), sourceUrl: source.sourceUrl, capturedAt }]
    : [];
}

function offerRecord(product: JsonRecord) {
  return values(product.offers).map(record).find(Boolean) ?? null;
}

function parseProduct(
  product: JsonRecord,
  source: CommercialSourceDefinition,
  retrievedAt: string,
): InternetOffer | null {
  const name = typeof product.name === "string" ? product.name.trim() : "";
  if (!name) return null;
  const offer = offerRecord(product);
  const props = properties(product);
  const rawTechnology = property(props, "technologie", "acces");
  const rawCommitment = property(props, "engagement");
  const rawActivation = property(props, "frais de mise en service", "activation");
  const rawTermination = property(props, "frais de resiliation", "resiliation");
  const rawDownload = property(props, "debit descendant", "download");
  const rawUpload = property(props, "debit montant", "upload");
  const rawPromo = property(props, "prix promotionnel", "prix promo");
  const rawPromoDuration = property(props, "duree promotion", "duree promo");
  const rawAfterPromo = property(props, "prix apres promotion", "prix apres promo");
  const rawEligibility = property(props, "eligibilite", "condition d'acces");
  const rawServices = property(props, "services inclus", "services");
  const publicPrice = amount(offer?.price);
  const promotionPrice = amount(rawPromo);
  const afterPromotion = amount(rawAfterPromo);
  const monthlyPrice = promotionPrice !== null ? afterPromotion : publicPrice;
  const sourceUrl = typeof offer?.url === "string"
    ? new URL(offer.url, source.sourceUrl).href
    : source.sourceUrl;
  const proof = [
    ...evidence("offerName", name, source, retrievedAt),
    ...evidence(
      promotionPrice !== null ? "promotionPrice" : "monthlyPrice",
      promotionPrice !== null ? rawPromo : String(offer?.price ?? ""),
      source,
      retrievedAt,
    ),
    ...evidence("technology", rawTechnology, source, retrievedAt),
    ...evidence("commitmentMonths", rawCommitment, source, retrievedAt),
    ...evidence("activationFees", rawActivation, source, retrievedAt),
    ...evidence("terminationFees", rawTermination, source, retrievedAt),
    ...evidence("downloadMbps", rawDownload, source, retrievedAt),
    ...evidence("uploadMbps", rawUpload, source, retrievedAt),
    ...evidence("eligibilityConditions", rawEligibility, source, retrievedAt),
  ];
  return {
    catalogId: getCommercialOfferId("internet", source.provider, name, sourceUrl),
    sector: "internet",
    provider: source.provider,
    offerName: name,
    sourceUrl,
    retrievedAt,
    verifiedAt: null,
    validFrom: property(props, "valide a partir", "debut validite"),
    validUntil:
      typeof offer?.priceValidUntil === "string" ? offer.priceValidUntil : null,
    verificationStatus: "VERIFIED",
    extractionMethod: "deterministic",
    technology: technology(rawTechnology),
    monthlyPrice,
    promotionPrice,
    promotionDurationMonths: months(rawPromoDuration),
    priceAfterPromotion: afterPromotion,
    promotionConditions: [],
    commitmentMonths: months(rawCommitment),
    activationFees: amount(rawActivation),
    activationFeeRefund: null,
    activationFeeRefundConditional: false,
    terminationFees: amount(rawTermination),
    downloadMbps: speedMbps(rawDownload),
    uploadMbps: speedMbps(rawUpload),
    includedServices: list(rawServices),
    eligibilityConditions: list(rawEligibility),
    conditions: list(property(props, "conditions")),
    evidence: proof,
  };
}

export function parseInternetOffers(
  html: string,
  source: CommercialSourceDefinition,
  retrievedAt: string,
): { offers: InternetOffer[]; failures: CommercialCollectionResult["failures"] } {
  const jsonLdCandidates = extractJsonLdProducts(html)
    .map((product) => parseProduct(product, source, retrievedAt))
    .filter((offer): offer is InternetOffer => Boolean(offer));
  const candidates = jsonLdCandidates.length > 0
    ? jsonLdCandidates
    : parseProviderInternetOffers(html, source, retrievedAt);
  const validated = validateAndDedupeInternetOffers(
    candidates,
    source,
    new Date(retrievedAt),
  );
  if (validated.offers.length === 0) {
    return {
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Aucune offre Internet structuree exploitable.",
        sourceUrl: source.sourceUrl,
      }],
    };
  }
  return validated;
}

export async function collectInternetSource(
  source: CommercialSourceDefinition,
  knownUrls: Iterable<string>,
  options: CommercialCollectorOptions = {},
): Promise<CommercialCollectionResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  try {
    const fetched = await fetchCommercialResource(source, options);
    if (fetched.notModified) {
      return {
        source,
        retrievedAt,
        offers: [],
        failures: [],
        discoveredSources: [],
        cache: fetched.cache,
        notModified: true,
      };
    }
    const html = fetched.body ?? "";
    const parsed = parseInternetOffers(html, source, retrievedAt);
    let offers = parsed.offers;
    const failures = [...parsed.failures];
    if (source.parser === "sosh-contract-pdf-v1") {
      const contractLinks = [...html.matchAll(/href=["']([^"']+\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map((match) => ({ url: new URL(match[1], source.sourceUrl).href, label: match[2].replace(/<[^>]+>/g, " ") }))
        .filter((item) => /Bo[iî]te Sosh Fibre|Sosh Boost Fibre/i.test(item.label));
      const documentOffers: InternetOffer[] = [];
      for (const contract of contractLinks) {
        try {
          const document = await fetchApprovedCommercialUrl(contract.url, source, { fetchImpl: options.fetchImpl });
          if (!document.bytes) continue;
          documentOffers.push(...parseSoshContract(
            await extractPdfText(document.bytes),
            document.finalUrl,
            source,
            retrievedAt,
          ));
        } catch (error) {
          failures.push({
            code: "DOCUMENT_FETCH_FAILED",
            message: error instanceof Error ? error.message : "Document contractuel inaccessible",
            sourceUrl: contract.url,
          });
        }
      }
      const checked = validateAndDedupeInternetOffers(documentOffers, source, new Date(retrievedAt));
      offers = checked.offers;
      failures.push(...checked.failures);
      if (offers.length > 0) {
        const structureFailure = failures.findIndex((failure) => failure.code === "STRUCTURE_CHANGED");
        if (structureFailure >= 0) failures.splice(structureFailure, 1);
      }
    }
    if (
      offers.every((offer) => offer.verificationStatus !== "VERIFIED") &&
      options.interpreter
    ) {
      const interpreted = await options.interpreter.interpretInternetOffers({
        source,
        content: htmlToText(html).slice(0, 40_000),
        retrievedAt,
      });
      const checked = validateAndDedupeInternetOffers(
        interpreted,
        source,
        new Date(retrievedAt),
      );
      offers = [...offers, ...checked.offers];
      failures.push(...checked.failures);
    }
    return {
      source,
      retrievedAt,
      offers,
      failures,
      discoveredSources: discoverApprovedPageLinks(
        html,
        source,
        knownUrls,
        retrievedAt,
      ),
      cache: fetched.cache,
      notModified: false,
    };
  } catch (error) {
    return {
      source,
      retrievedAt,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Erreur inconnue",
        sourceUrl: source.sourceUrl,
      }],
      discoveredSources: [],
      cache: {
        etag: options.previousCache?.etag ?? null,
        lastModified: options.previousCache?.lastModified ?? null,
        contentHash: options.previousCache?.contentHash ?? null,
      },
      notModified: false,
    };
  }
}
