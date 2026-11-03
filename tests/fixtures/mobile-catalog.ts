import type {
  CollectionSnapshot,
  MobileOffer,
  Provider
} from "../../experiments/mobile-offers/types";

export const MOBILE_CATALOG_FIXTURE_VERIFIED_AT = "2026-11-02T09:00:00.000Z";
export const MOBILE_CATALOG_FIXTURE_NOW = new Date("2026-11-02T10:00:00.000Z");

const providers: Provider[] = [
  "Free Mobile",
  "RED by SFR",
  "B&You",
  "Orange",
  "Sosh",
  "SFR",
  "Prixtel",
  "NRJ Mobile",
  "Cdiscount Mobile"
];

const includedData = [20, 50, 100, 150, 200, 300];

const offers: MobileOffer[] = Array.from({ length: 45 }, (_, index) => {
  const verified = index < 31;
  return {
    provider: "NRJ Mobile",
    offerName: `Fixture mobile ${index + 1}`,
    monthlyPrice: 5 + (index % 12),
    includedDataGB: includedData[index % includedData.length],
    unlimitedData: false,
    euDataGB: 10,
    network: "Reseau test",
    technology: "5G",
    commitmentMonths: 0,
    promotionPrice: null,
    promotionDuration: null,
    priceAfterPromotion: null,
    activationFees: 0,
    simFees: 0,
    conditionalPrices: [],
    pricingTiers: [],
    conditions: [],
    evidence: ["fixture deterministe"],
    sourceUrl: "https://www.nrjmobile.fr/forfait-se",
    retrievedAt: MOBILE_CATALOG_FIXTURE_VERIFIED_AT,
    verifiedAt: verified ? MOBILE_CATALOG_FIXTURE_VERIFIED_AT : null,
    verificationStatus: verified ? "VERIFIED" : "PARTIAL"
  };
});

const emptySummary = {
  detected: 0,
  verified: 0,
  partial: 0,
  failed: 0
};

export const mobileCatalogSnapshotFixture: CollectionSnapshot = {
  schemaVersion: 2,
  retrievedAt: MOBILE_CATALOG_FIXTURE_VERIFIED_AT,
  results: [{
    provider: "NRJ Mobile",
    sourceUrl: "https://www.nrjmobile.fr/forfait-se",
    retrievedAt: MOBILE_CATALOG_FIXTURE_VERIFIED_AT,
    offers,
    failures: []
  }],
  summary: Object.fromEntries(
    providers.map((provider) => [
      provider,
      provider === "NRJ Mobile"
        ? { detected: 45, verified: 31, partial: 14, failed: 0 }
        : { ...emptySummary }
    ])
  ) as CollectionSnapshot["summary"]
};
