export const COMMERCIAL_SECTORS = [
  "internet", "electricity", "gas", "home_insurance", "car_insurance", "health_insurance",
] as const;

export type CommercialSector = (typeof COMMERCIAL_SECTORS)[number];
export type VerificationStatus = "VERIFIED" | "PARTIAL" | "FAILED";
export type SourceApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ExtractionMethod = "deterministic" | "ai";
export type PricingMode = "FIXED" | "INDEXED" | "REGULATED" | "UNKNOWN";

export interface CommercialEvidence {
  field: string;
  excerpt: string;
  sourceUrl: string;
  capturedAt: string;
}

export interface CommercialOfferBase {
  catalogId: string;
  sector: CommercialSector;
  provider: string;
  offerName: string;
  sourceUrl: string;
  offerUrl?: string | null;
  retrievedAt: string;
  verifiedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  verificationStatus: VerificationStatus;
  extractionMethod: ExtractionMethod;
  conditions: string[];
  evidence: CommercialEvidence[];
}

export type InternetTechnology = "FIBER" | "CABLE" | "ADSL" | "VDSL" | "MIXED" | "UNKNOWN";

export interface InternetOffer extends CommercialOfferBase {
  sector: "internet";
  technology: InternetTechnology;
  monthlyPrice: number | null;
  promotionPrice: number | null;
  promotionDurationMonths: number | null;
  priceAfterPromotion: number | null;
  promotionConditions: string[];
  commitmentMonths: number | null;
  activationFees: number | null;
  activationFeeRefund: number | null;
  activationFeeRefundConditional: boolean;
  terminationFees: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  includedServices: string[];
  eligibilityConditions: string[];
}

export type ElectricityTariffOption = "BASE" | "HPHC" | "TEMPO" | "UNKNOWN";

export interface ElectricityOffer extends CommercialOfferBase {
  sector: "electricity";
  pricingMode: PricingMode;
  tariffOption: ElectricityTariffOption;
  powerKva: number[];
  monthlySubscriptionByPower: Record<string, number>;
  basePricePerKwh: number | null;
  peakPricePerKwh: number | null;
  offPeakPricePerKwh: number | null;
  tempoPrices: Partial<Record<"bluePeak" | "blueOffPeak" | "whitePeak" | "whiteOffPeak" | "redPeak" | "redOffPeak", number>>;
  taxesIncluded: boolean | null;
  priceRevision: string | null;
  eligibilityConditions: string[];
}

export interface GasOffer extends CommercialOfferBase {
  sector: "gas";
  pricingMode: PricingMode;
  consumptionClass: string | null;
  tariffZone: string | null;
  annualSubscription: number | null;
  pricePerKwh: number | null;
  taxesIncluded: boolean | null;
  priceRevision: string | null;
  eligibilityConditions: string[];
  referenceOnly: boolean;
}

export type InsuranceSector = "home_insurance" | "car_insurance";

export interface InsuranceOffer extends CommercialOfferBase {
  sector: InsuranceSector;
  productType: string;
  indicativeMonthlyPrice: number | null;
  quoteRequired: true;
  guarantees: string[];
  deductibles: string[];
  limits: string[];
  exclusions: string[];
  eligibilityConditions: string[];
}

export type CommercialOffer = InternetOffer | ElectricityOffer | GasOffer | InsuranceOffer;

export interface CommercialSourceDefinition {
  id: string;
  sector: CommercialSector;
  provider: string;
  sourceUrl: string;
  allowedHosts: string[];
  approvalStatus: SourceApprovalStatus;
  parser: string;
  discoveryEnabled: boolean;
}

export interface FetchCacheMetadata {
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
}

export interface CommercialCollectionFailure {
  code: string;
  message: string;
  sourceUrl: string;
}

export interface DiscoveredSourceCandidate {
  id: string;
  sector: CommercialSector;
  provider: string;
  sourceUrl: string;
  discoveredFrom: string;
  discoveryMethod: "approved_page_link" | "search_candidate";
  approvalStatus: "PENDING";
  discoveredAt: string;
}

export interface CommercialCollectionResult {
  source: CommercialSourceDefinition;
  retrievedAt: string;
  offers: CommercialOffer[];
  failures: CommercialCollectionFailure[];
  discoveredSources: DiscoveredSourceCandidate[];
  cache: FetchCacheMetadata;
  notModified: boolean;
}

export interface CommercialCollectorOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  previousCache?: Partial<FetchCacheMetadata>;
  interpreter?: CommercialOfferInterpreter;
}

export interface CommercialOfferInterpreter {
  interpretInternetOffers(input: { source: CommercialSourceDefinition; content: string; retrievedAt: string }): Promise<InternetOffer[]>;
}

export interface SearchCandidate { title: string; url: string; publisherName?: string; }

export type CommercialChangeType = "NEW" | "REMOVED" | "PRICE_CHANGED" | "PROMOTION_CHANGED" | "TERMS_CHANGED";

export interface CommercialOfferChange {
  type: CommercialChangeType;
  catalogId: string;
  provider: string;
  offerName: string;
  before: Partial<CommercialOffer> | null;
  after: Partial<CommercialOffer> | null;
}

export type ComparisonConfidence = "CERTIFIED" | "ESTIMATED" | "INSUFFICIENT" | "QUOTE_REQUIRED";
export type ComparisonKind = "EQUIVALENT" | "COMPROMISE" | "MORE_INFO_REQUIRED" | "QUOTE_REQUIRED" | "NOT_COMPARABLE";

export interface CommercialComparisonResult<TOffer extends CommercialOffer = CommercialOffer> {
  offer: TOffer;
  comparisonKind: ComparisonKind;
  confidence: ComparisonConfidence;
  currentAnnualCost: number | null;
  alternativeAnnualCost: number | null;
  estimatedAnnualSaving: number | null;
  reasons: string[];
}

export interface InternetContractInput {
  monthlyPrice: number;
  technology: InternetTechnology;
  minimumDownloadMbps: number | null;
  requiresTv: boolean;
  commitmentMonths?: number | null;
}

export interface ElectricityContractInput {
  powerKva: number;
  tariffOption: ElectricityTariffOption;
  annualConsumptionKwh: number;
  peakConsumptionKwh?: number;
  offPeakConsumptionKwh?: number;
  tempoConsumptionKwh?: Partial<Record<keyof ElectricityOffer["tempoPrices"], number>>;
  currentAnnualCost: number | null;
  isEstimatedSchedule: boolean;
}

export interface GasContractInput {
  annualConsumptionKwh: number;
  tariffZone: string | null;
  consumptionClass: string | null;
  currentAnnualCost: number | null;
  isEstimatedSchedule?: boolean;
}

export interface InsuranceContractInput {
  sector: InsuranceSector;
  currentAnnualPremium: number;
  requiredGuarantees: string[];
  knownDeductibles: string[];
}
