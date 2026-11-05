import type { AlternativeOffer } from "./service";

export const SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY = "futeo.selectedAlternativeOffer";

export type SelectedAlternativeOffer = Pick<
  AlternativeOffer,
  | "id"
  | "category"
  | "provider"
  | "name"
  | "url"
  | "sourceUrl"
  | "monthlyPrice"
  | "yearlyPrice"
  | "estimatedYearlySaving"
  | "recurringYearlySaving"
  | "durableYearlySaving"
  | "pricingMode"
  | "estimateReason"
  | "savingKind"
  | "comparisonKind"
  | "entryFeesKnown"
  | "knownEntryFees"
  | "promotionPrice"
  | "promotionDurationMonths"
  | "priceAfterPromotion"
  | "commitmentMonths"
  | "downloadMbps"
  | "conditions"
  | "verifiedAt"
  | "billingPrice"
  | "billingPeriodDays"
> & {
  sourceExpenseId?: string;
};

function getSourceExpenseId(offer: AlternativeOffer) {
  if (offer.sourceExpenseId) return offer.sourceExpenseId;
  const match = offer.id.match(/^alternative_(.+)_\d+$/);
  return match?.[1];
}

export function toSelectedAlternativeOffer(offer: AlternativeOffer): SelectedAlternativeOffer {
  return {
    id: offer.id,
    category: offer.category,
    provider: offer.provider,
    name: offer.name,
    url: offer.url,
    sourceUrl: offer.sourceUrl,
    monthlyPrice: offer.monthlyPrice,
    yearlyPrice: offer.yearlyPrice,
    estimatedYearlySaving: offer.estimatedYearlySaving,
    recurringYearlySaving: offer.recurringYearlySaving,
    durableYearlySaving: offer.durableYearlySaving,
    pricingMode: offer.pricingMode,
    estimateReason: offer.estimateReason,
    savingKind: offer.savingKind,
    comparisonKind: offer.comparisonKind,
    entryFeesKnown: offer.entryFeesKnown,
    knownEntryFees: offer.knownEntryFees,
    promotionPrice: offer.promotionPrice,
    promotionDurationMonths: offer.promotionDurationMonths,
    priceAfterPromotion: offer.priceAfterPromotion,
    commitmentMonths: offer.commitmentMonths,
    downloadMbps: offer.downloadMbps,
    conditions: offer.conditions,
    verifiedAt: offer.verifiedAt,
    billingPrice: offer.billingPrice,
    billingPeriodDays: offer.billingPeriodDays,
    sourceExpenseId: getSourceExpenseId(offer)
  };
}

export function findSelectedAlternativeOffer(
  selectedOffer: SelectedAlternativeOffer | null,
  alternatives: AlternativeOffer[]
) {
  if (!selectedOffer) return undefined;

  return alternatives.find((offer) => {
    const sourceExpenseId = getSourceExpenseId(offer);
    return (
      offer.id === selectedOffer.id ||
      (offer.category === selectedOffer.category &&
        offer.provider === selectedOffer.provider &&
        offer.name === selectedOffer.name &&
        (!selectedOffer.sourceExpenseId ||
          sourceExpenseId === selectedOffer.sourceExpenseId))
    );
  });
}

export function getSelectedAlternativeOffer(): SelectedAlternativeOffer | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY);
  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as SelectedAlternativeOffer;
  } catch {
    return null;
  }
}

export function storeSelectedAlternativeOffer(offer: AlternativeOffer) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY,
    JSON.stringify(toSelectedAlternativeOffer(offer))
  );
}

export function refreshSelectedAlternativeOffer(
  selectedOffer: SelectedAlternativeOffer | null,
  alternatives: AlternativeOffer[]
): SelectedAlternativeOffer | null {
  if (!selectedOffer) {
    return null;
  }

  const currentOffer = findSelectedAlternativeOffer(selectedOffer, alternatives);

  if (!currentOffer) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY);
    }
    return null;
  }

  const refreshedOffer = toSelectedAlternativeOffer(currentOffer);
  if (JSON.stringify(refreshedOffer) !== JSON.stringify(selectedOffer)) {
    storeSelectedAlternativeOffer(currentOffer);
  }

  return refreshedOffer;
}
