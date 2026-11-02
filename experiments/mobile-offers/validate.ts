import { assertOfficialUrl } from "./fetch";
import { normalizeOfferKey } from "./html";
import type {
  CollectionFailure,
  MobileOffer,
  VerificationStatus,
} from "./types";

const STATUS_RANK: Record<VerificationStatus, number> = {
  FAILED: 0,
  PARTIAL: 1,
  VERIFIED: 2,
};

function capStatus(
  requested: VerificationStatus,
  computed: VerificationStatus,
): VerificationStatus {
  return STATUS_RANK[requested] < STATUS_RANK[computed] ? requested : computed;
}

export function validateOffer(offer: MobileOffer): MobileOffer {
  let computed: VerificationStatus = "VERIFIED";

  try {
    assertOfficialUrl(offer.sourceUrl);
  } catch {
    computed = "FAILED";
  }

  const invalidNumber = [
    offer.monthlyPrice,
    offer.includedDataGB,
    offer.euDataGB,
    offer.promotionPrice,
    offer.promotionDuration,
    offer.priceAfterPromotion,
    offer.activationFees,
    offer.simFees,
    ...offer.conditionalPrices.flatMap((price) => [
      price.monthlyPrice,
      price.durationMonths,
      price.priceAfter,
    ]),
    ...offer.pricingTiers.flatMap((tier) => [
      tier.fromDataGB,
      tier.upToDataGB,
      tier.monthlyPrice,
    ]),
  ].some((value) => value !== null && (!Number.isFinite(value) || value < 0));

  const contradictoryData =
    offer.unlimitedData === true && offer.includedDataGB !== null;
  const invalidPrice = offer.monthlyPrice !== null && offer.monthlyPrice <= 0;
  const incompletePromotion =
    offer.promotionPrice !== null &&
    (offer.promotionDuration === null || offer.priceAfterPromotion === null);
  const contradictoryPromotion =
    offer.promotionPrice !== null &&
    offer.priceAfterPromotion !== null &&
    offer.promotionPrice > offer.priceAfterPromotion;
  const invalidTiers = offer.pricingTiers.some(
    (tier) =>
      tier.monthlyPrice <= 0 ||
      tier.fromDataGB < 0 ||
      tier.upToDataGB <= tier.fromDataGB,
  );
  const hasUsablePrice =
    offer.monthlyPrice !== null || offer.pricingTiers.length > 0;

  if (
    invalidNumber ||
    contradictoryData ||
    invalidPrice ||
    contradictoryPromotion ||
    invalidTiers ||
    !offer.offerName.trim()
  ) {
    computed = "FAILED";
  } else if (
    !hasUsablePrice ||
    (offer.unlimitedData !== true && offer.includedDataGB === null) ||
    offer.unlimitedData === null ||
    offer.network === null ||
    offer.commitmentMonths === null ||
    incompletePromotion
  ) {
    computed = "PARTIAL";
  }

  const verificationStatus = capStatus(offer.verificationStatus, computed);
  return {
    ...offer,
    verifiedAt:
      verificationStatus === "VERIFIED" ? offer.retrievedAt : null,
    verificationStatus,
  };
}

export function validateAndDedupe(
  offers: MobileOffer[],
  sourceUrl: string,
): { offers: MobileOffer[]; failures: CollectionFailure[] } {
  const seen = new Set<string>();
  const failures: CollectionFailure[] = [];
  const validated: MobileOffer[] = [];

  for (const offer of offers) {
    const key = `${offer.provider}:${normalizeOfferKey(offer.offerName)}`;
    if (seen.has(key)) {
      failures.push({
        code: "DUPLICATE_OFFER",
        message: `Offre dupliquée ignorée: ${offer.offerName}`,
        sourceUrl,
      });
      continue;
    }
    seen.add(key);
    validated.push(validateOffer(offer));
  }

  return { offers: validated, failures };
}
