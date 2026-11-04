export type OfferPricing = {
  monthlyPrice: number;
  billingPrice?: number;
  billingPeriodDays?: number;
  promotionPrice?: number;
  promotionDurationMonths?: number;
  priceAfterPromotion?: number;
};

export function formatOfferPrice(
  offer: OfferPricing,
  formatCurrency: (value: number) => string,
) {
  if (
    typeof offer.promotionPrice === "number" &&
    typeof offer.promotionDurationMonths === "number" &&
    typeof offer.priceAfterPromotion === "number"
  ) {
    return `${formatCurrency(offer.promotionPrice)} / mois pendant ${offer.promotionDurationMonths} mois, puis ${formatCurrency(offer.priceAfterPromotion)} / mois`;
  }
  if (offer.billingPeriodDays && typeof offer.billingPrice === "number") {
    return `${formatCurrency(offer.billingPrice)} tous les ${offer.billingPeriodDays} jours (soit ${formatCurrency(offer.monthlyPrice)} / mois civil)`;
  }
  return `${formatCurrency(offer.monthlyPrice)} / mois`;
}
