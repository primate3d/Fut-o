import type { CommercialOffer, CommercialOfferChange } from "./types";

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function priceFingerprint(offer: CommercialOffer) {
  if (offer.sector === "internet") return [offer.monthlyPrice, offer.activationFees, offer.activationFeeRefund];
  if (offer.sector === "electricity") return [offer.monthlySubscriptionByPower, offer.basePricePerKwh,
    offer.peakPricePerKwh, offer.offPeakPricePerKwh, offer.tempoPrices];
  if (offer.sector === "gas") return [offer.annualSubscription, offer.pricePerKwh];
  return [offer.indicativeMonthlyPrice];
}

function promotionFingerprint(offer: CommercialOffer) {
  return offer.sector === "internet"
    ? [offer.promotionPrice, offer.promotionDurationMonths, offer.priceAfterPromotion, offer.promotionConditions]
    : [];
}

function termsFingerprint(offer: CommercialOffer) {
  if (offer.sector === "internet") return [offer.technology, offer.commitmentMonths, offer.terminationFees,
    offer.downloadMbps, offer.uploadMbps, offer.includedServices, offer.eligibilityConditions, offer.conditions];
  if (offer.sector === "electricity") return [offer.pricingMode, offer.tariffOption, offer.powerKva,
    offer.taxesIncluded, offer.priceRevision, offer.eligibilityConditions, offer.conditions];
  if (offer.sector === "gas") return [offer.pricingMode, offer.consumptionClass, offer.tariffZone,
    offer.taxesIncluded, offer.priceRevision, offer.eligibilityConditions, offer.referenceOnly, offer.conditions];
  return [offer.productType, offer.quoteRequired, offer.guarantees, offer.deductibles,
    offer.limits, offer.exclusions, offer.eligibilityConditions, offer.conditions];
}

export function compareCommercialOffers(previous: CommercialOffer[], current: CommercialOffer[]): CommercialOfferChange[] {
  const beforeById = new Map(previous.map((offer) => [offer.catalogId, offer]));
  const afterById = new Map(current.map((offer) => [offer.catalogId, offer]));
  const changes: CommercialOfferChange[] = [];
  for (const offer of current) {
    const before = beforeById.get(offer.catalogId);
    if (!before) {
      changes.push({ type: "NEW", catalogId: offer.catalogId, provider: offer.provider, offerName: offer.offerName, before: null, after: offer });
      continue;
    }
    if (!sameValue(priceFingerprint(before), priceFingerprint(offer))) {
      changes.push({ type: "PRICE_CHANGED", catalogId: offer.catalogId, provider: offer.provider, offerName: offer.offerName, before, after: offer });
    }
    if (!sameValue(promotionFingerprint(before), promotionFingerprint(offer))) {
      changes.push({ type: "PROMOTION_CHANGED", catalogId: offer.catalogId, provider: offer.provider, offerName: offer.offerName, before, after: offer });
    }
    if (!sameValue(termsFingerprint(before), termsFingerprint(offer))) {
      changes.push({ type: "TERMS_CHANGED", catalogId: offer.catalogId, provider: offer.provider, offerName: offer.offerName, before, after: offer });
    }
  }
  for (const offer of previous) {
    if (!afterById.has(offer.catalogId)) {
      changes.push({ type: "REMOVED", catalogId: offer.catalogId, provider: offer.provider, offerName: offer.offerName, before: offer, after: null });
    }
  }
  return changes;
}
