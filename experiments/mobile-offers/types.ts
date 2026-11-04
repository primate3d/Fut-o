export type Provider =
  | "Free Mobile"
  | "RED by SFR"
  | "B&You"
  | "Orange"
  | "Sosh"
  | "SFR"
  | "Prixtel"
  | "NRJ Mobile"
  | "Cdiscount Mobile"
  | "Lyca Mobile"
  | "Lebara"
  | "Syma Mobile"
  | "La Poste Mobile";

export type VerificationStatus = "VERIFIED" | "PARTIAL" | "FAILED";

export interface ConditionalPrice {
  kind: "BOX" | "NEW_CUSTOMER" | "AGE" | "MULTILINE" | "OTHER";
  monthlyPrice: number;
  durationMonths: number | null;
  priceAfter: number | null;
  condition: string;
}

export interface PricingTier {
  fromDataGB: number;
  upToDataGB: number;
  monthlyPrice: number;
}

export interface MobileOffer {
  catalogId?: string;
  provider: Provider;
  offerName: string;
  monthlyPrice: number | null;
  includedDataGB: number | null;
  unlimitedData: boolean | null;
  euDataGB: number | null;
  network: string | null;
  technology: string | null;
  commitmentMonths: number | null;
  promotionPrice: number | null;
  promotionDuration: number | null;
  priceAfterPromotion: number | null;
  activationFees: number | null;
  simFees: number | null;
  terminationFees?: number | null;
  conditionalPrices: ConditionalPrice[];
  pricingTiers: PricingTier[];
  conditions: string[];
  evidence: string[];
  offerUrl?: string | null;
  sourceUrl: string;
  billingPeriodDays?: number | null;
  autoRenewal?: boolean | null;
  retrievedAt: string;
  verifiedAt: string | null;
  verificationStatus: VerificationStatus;
}

export interface CollectionFailure {
  code: string;
  message: string;
  sourceUrl: string;
}

export interface CollectorResult {
  provider: Provider;
  sourceUrl: string;
  retrievedAt: string;
  offers: MobileOffer[];
  failures: CollectionFailure[];
}

export interface CollectionSummary {
  detected: number;
  verified: number;
  partial: number;
  failed: number;
}

export interface CollectionSnapshot {
  schemaVersion: 1 | 2;
  retrievedAt: string;
  results: CollectorResult[];
  summary: Partial<Record<Provider, CollectionSummary>>;
}

export type ChangeType =
  | "NEW"
  | "REMOVED"
  | "PRICE_CHANGED"
  | "DATA_CHANGED"
  | "PROMOTION_CHANGED"
  | "TIERS_CHANGED"
  | "CONDITIONS_CHANGED";

export interface OfferChange {
  type: ChangeType;
  provider: Provider;
  offerName: string;
  before: Partial<MobileOffer> | null;
  after: Partial<MobileOffer> | null;
}

export interface CollectorOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}
