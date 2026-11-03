import { createHash } from "node:crypto";
import { normalizeOfferKey } from "../mobile-offers/html";
import { assertApprovedSourceUrl } from "./fetch";
import type {
  CommercialCollectionFailure,
  CommercialOffer,
  CommercialSourceDefinition,
  ElectricityOffer,
  GasOffer,
  InsuranceOffer,
  InternetOffer,
  VerificationStatus,
} from "./types";

const STATUS_RANK: Record<VerificationStatus, number> = { FAILED: 0, PARTIAL: 1, VERIFIED: 2 };

function capStatus(requested: VerificationStatus, computed: VerificationStatus) {
  return STATUS_RANK[requested] < STATUS_RANK[computed] ? requested : computed;
}

export function getCommercialOfferId(sector: string, provider: string, offerName: string, sourceUrl: string) {
  const identity = [sector, normalizeOfferKey(provider), normalizeOfferKey(offerName), new URL(sourceUrl).href].join(":");
  return `${sector}-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function hasEvidence(offer: CommercialOffer, field: string) {
  return offer.evidence.some((item) => item.field === field && item.excerpt.trim().length > 0);
}

function invalidNumber(values: Array<number | null>) {
  return values.some((value) => value !== null && (!Number.isFinite(value) || value < 0));
}

function commonStatus(offer: CommercialOffer, source: CommercialSourceDefinition, now: Date) {
  let status: VerificationStatus = "VERIFIED";
  try {
    assertApprovedSourceUrl(offer.sourceUrl, source);
    for (const item of offer.evidence) assertApprovedSourceUrl(item.sourceUrl, source);
  } catch {
    status = "FAILED";
  }
  const invalidValidity =
    (offer.validFrom !== null && !Number.isFinite(Date.parse(offer.validFrom))) ||
    (offer.validUntil !== null && !Number.isFinite(Date.parse(offer.validUntil))) ||
    (offer.validUntil !== null && Date.parse(offer.validUntil) < now.getTime());
  if (
    source.approvalStatus !== "APPROVED" || offer.sector !== source.sector ||
    offer.provider !== source.provider || !offer.offerName.trim() || invalidValidity
  ) status = "FAILED";
  if (status !== "FAILED" && (!hasEvidence(offer, "offerName") || offer.extractionMethod === "ai")) status = "PARTIAL";
  return status;
}

export function validateInternetOffer(
  offer: InternetOffer,
  source: CommercialSourceDefinition,
  now = new Date(offer.retrievedAt),
): InternetOffer {
  let computed = commonStatus(offer, source, now);
  const numbers = [offer.monthlyPrice, offer.promotionPrice, offer.promotionDurationMonths,
    offer.priceAfterPromotion, offer.commitmentMonths, offer.activationFees,
    offer.activationFeeRefund, offer.terminationFees, offer.downloadMbps, offer.uploadMbps];
  const promotionIncomplete = offer.promotionPrice !== null &&
    (offer.promotionDurationMonths === null || offer.priceAfterPromotion === null);
  const promotionContradiction = offer.promotionPrice !== null && offer.priceAfterPromotion !== null &&
    offer.promotionPrice > offer.priceAfterPromotion;
  if (invalidNumber(numbers) || promotionContradiction) computed = "FAILED";
  if (computed !== "FAILED") {
    const required = ["offerName", offer.promotionPrice !== null ? "promotionPrice" : "monthlyPrice",
      "technology", "commitmentMonths", "activationFees", "terminationFees"];
    if (
      offer.monthlyPrice === null || offer.technology === "UNKNOWN" || offer.commitmentMonths === null ||
      offer.activationFees === null || offer.terminationFees === null || offer.downloadMbps === null ||
      offer.eligibilityConditions.length === 0 || promotionIncomplete || required.some((field) => !hasEvidence(offer, field))
    ) computed = "PARTIAL";
  }
  return finalize(offer, computed);
}

function validateElectricityOffer(offer: ElectricityOffer, source: CommercialSourceDefinition, now: Date) {
  let computed = commonStatus(offer, source, now);
  const prices = [offer.basePricePerKwh, offer.peakPricePerKwh, offer.offPeakPricePerKwh,
    ...Object.values(offer.monthlySubscriptionByPower), ...Object.values(offer.tempoPrices)];
  if (invalidNumber(prices)) computed = "FAILED";
  const hasOptionPrices = offer.tariffOption === "BASE" ? offer.basePricePerKwh !== null
    : offer.tariffOption === "HPHC" ? offer.peakPricePerKwh !== null && offer.offPeakPricePerKwh !== null
      : offer.tariffOption === "TEMPO" ? Object.keys(offer.tempoPrices).length === 6 : false;
  if (computed !== "FAILED" && (
    offer.tariffOption === "UNKNOWN" || offer.powerKva.length === 0 || !hasOptionPrices ||
    Object.keys(offer.monthlySubscriptionByPower).length === 0 || offer.taxesIncluded === null ||
    !hasEvidence(offer, "tariffOption") || !hasEvidence(offer, "energyPrice") || !hasEvidence(offer, "subscription")
  )) computed = "PARTIAL";
  return finalize(offer, computed);
}

function validateGasOffer(offer: GasOffer, source: CommercialSourceDefinition, now: Date) {
  let computed = commonStatus(offer, source, now);
  if (invalidNumber([offer.annualSubscription, offer.pricePerKwh])) computed = "FAILED";
  if (computed !== "FAILED" && (
    offer.annualSubscription === null || offer.pricePerKwh === null || offer.taxesIncluded === null ||
    offer.eligibilityConditions.length === 0 || !hasEvidence(offer, "energyPrice") || !hasEvidence(offer, "subscription")
  )) computed = "PARTIAL";
  return finalize(offer, computed);
}

function validateInsuranceOffer(offer: InsuranceOffer, source: CommercialSourceDefinition, now: Date) {
  let computed = commonStatus(offer, source, now);
  if (invalidNumber([offer.indicativeMonthlyPrice])) computed = "FAILED";
  if (computed !== "FAILED" && (
    offer.guarantees.length === 0 || offer.eligibilityConditions.length === 0 ||
    !hasEvidence(offer, "guarantees") || !hasEvidence(offer, "quoteRequired")
  )) computed = "PARTIAL";
  return finalize(offer, computed);
}

function finalize<T extends CommercialOffer>(offer: T, computed: VerificationStatus): T {
  const verificationStatus = capStatus(offer.verificationStatus, computed);
  return {
    ...offer,
    catalogId: getCommercialOfferId(offer.sector, offer.provider, offer.offerName, offer.sourceUrl),
    verifiedAt: verificationStatus === "VERIFIED" ? offer.retrievedAt : null,
    verificationStatus,
  };
}

export function validateCommercialOffer(offer: CommercialOffer, source: CommercialSourceDefinition, now = new Date(offer.retrievedAt)) {
  if (offer.sector === "internet") return validateInternetOffer(offer, source, now);
  if (offer.sector === "electricity") return validateElectricityOffer(offer, source, now);
  if (offer.sector === "gas") return validateGasOffer(offer, source, now);
  return validateInsuranceOffer(offer, source, now);
}

export function validateAndDedupeCommercialOffers(
  offers: CommercialOffer[], source: CommercialSourceDefinition, now?: Date,
): { offers: CommercialOffer[]; failures: CommercialCollectionFailure[] } {
  const seen = new Set<string>();
  const failures: CommercialCollectionFailure[] = [];
  const validated: CommercialOffer[] = [];
  for (const offer of offers) {
    const checked = validateCommercialOffer(offer, source, now);
    const key = `${checked.sector}:${normalizeOfferKey(checked.provider)}:${normalizeOfferKey(checked.offerName)}`;
    if (seen.has(key)) {
      failures.push({ code: "DUPLICATE_OFFER", message: `Offre dupliquee ignoree: ${checked.offerName}`, sourceUrl: source.sourceUrl });
      continue;
    }
    seen.add(key);
    validated.push(checked);
  }
  return { offers: validated, failures };
}

export function validateAndDedupeInternetOffers(offers: InternetOffer[], source: CommercialSourceDefinition, now?: Date) {
  const checked = validateAndDedupeCommercialOffers(offers, source, now);
  return { offers: checked.offers as InternetOffer[], failures: checked.failures };
}
