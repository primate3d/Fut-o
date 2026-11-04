export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
};

export type AccessKey = {
  id: string;
  code: string;
  plan: "decouverte" | "foyer" | "famille" | "simple" | "premium";
  usesRemaining: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  activatedAt?: string;
  hasUsedFreeTrial?: boolean;
  freeTrialUsedAt?: string;
  allowedNames?: string[] | null;
  profilePostalAddress?: string | null;
  profileLockedAt?: string | null;
};

export type Household = {
  id: string;
  userId: string;
  name: string;
  membersCount: number;
  monthlyIncome?: number;
};

export type UploadedDocument = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: UploadedDocumentType;
  detectedCategory: ExpenseCategory;
  status: "ready" | "pending" | "error" | "uploading" | "purged";
  statusDetail?: string;
  uploadedAt: string;
  provider?: string;
  userCorrections?: DocumentUserCorrections;
};

export type DocumentUserCorrections = {
  provider?: string;
  documentType?: UploadedDocumentType;
  amount?: number;
  frequency?: "monthly" | "bimonthly" | "quarterly" | "yearly" | "one_time" | "schedule";
  isMultiContract?: boolean;
  notes?: string;
  mobileDataGB?: number;
  mobileDataUnlimited?: boolean;
  mobileAllowLowerDataOffers?: boolean;
  mobileMinimumDataGB?: number;
};

export type UploadedDocumentType =
  | "bank_statement"
  | "electricity_invoice"
  | "gas_invoice"
  | "internet_invoice"
  | "mobile_invoice"
  | "two_wheeler_insurance"
  | "car_insurance"
  | "home_insurance"
  | "health_insurance"
  | "subscription"
  | "credit"
  | "other";

export enum ExpenseCategory {
  ENERGY = "ENERGY",
  TELECOM = "TELECOM",
  INSURANCE = "INSURANCE",
  SUBSCRIPTIONS = "SUBSCRIPTIONS",
  BANKING = "BANKING",
  HOUSING = "HOUSING",
  TRANSPORT = "TRANSPORT",
  HEALTH = "HEALTH",
  EDUCATION = "EDUCATION",
  LEISURE = "LEISURE",
  OTHER = "OTHER"
}

export enum ExpenseSubcategory {
  ELECTRICITY = "ELECTRICITY",
  GAS = "GAS",
  MOBILE = "MOBILE",
  INTERNET = "INTERNET",
  HOME_INSURANCE = "HOME_INSURANCE",
  CAR_INSURANCE = "CAR_INSURANCE",
  TWO_WHEELER_INSURANCE = "TWO_WHEELER_INSURANCE",
  STREAMING = "STREAMING",
  BANK_FEES = "BANK_FEES",
  RENT = "RENT",
  PUBLIC_TRANSPORT = "PUBLIC_TRANSPORT",
  MUTUAL_HEALTH = "MUTUAL_HEALTH",
  SCHOOL = "SCHOOL",
  SPORT = "SPORT",
  OTHER = "OTHER"
}

export type ContractDetailSource = "document" | "ai" | "manual" | "user_confirmed";

type ContractDetailsBase = {
  version: 1;
  source: ContractDetailSource;
  sourceDocumentId?: string;
  fieldSources?: Record<string, ContractDetailSource>;
};

export type InternetContractDetails = ContractDetailsBase & {
  kind: "internet";
  offerName?: string;
  technology?: "FIBER" | "CABLE" | "ADSL" | "VDSL" | "MIXED" | "UNKNOWN";
  monthlyPrice?: number;
  promotionPrice?: number;
  promotionDurationMonths?: number;
  priceAfterPromotion?: number;
  commitmentMonths?: number;
  activationFees?: number;
  terminationFees?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  includedServices?: string[];
};

export type ElectricityContractDetails = ContractDetailsBase & {
  kind: "electricity";
  documentKind?: "INVOICE" | "PAYMENT_SCHEDULE" | "ESTIMATE" | "UNKNOWN";
  powerKva?: number;
  tariffOption?: "BASE" | "HPHC" | "TEMPO" | "UNKNOWN";
  annualConsumptionKwh?: number;
  peakConsumptionKwh?: number;
  offPeakConsumptionKwh?: number;
  tempoConsumptionKwh?: Partial<Record<"bluePeak" | "blueOffPeak" | "whitePeak" | "whiteOffPeak" | "redPeak" | "redOffPeak", number>>;
  subscriptionAmount?: number;
  basePricePerKwh?: number;
  peakPricePerKwh?: number;
  offPeakPricePerKwh?: number;
  taxes?: number;
  period?: { start: string; end: string };
};

export type GasContractDetails = ContractDetailsBase & {
  kind: "gas";
  documentKind?: "INVOICE" | "PAYMENT_SCHEDULE" | "ESTIMATE" | "UNKNOWN";
  annualConsumptionKwh?: number;
  tariffZone?: string;
  consumptionClass?: string;
  pricePerKwh?: number;
  annualSubscription?: number;
  taxes?: number;
  period?: { start: string; end: string };
};

export type InsuranceContractDetails = ContractDetailsBase & {
  kind: "car_insurance" | "home_insurance";
  annualPremium?: number;
  vehicle?: string;
  formula?: string;
  housingType?: string;
  surfaceM2?: number;
  occupancyStatus?: string;
  contentsCapital?: number;
  guarantees?: string[];
  deductibles?: string[];
  limits?: string[];
  assistance?: string[];
  exclusions?: string[];
};

export type ContractDetails =
  | InternetContractDetails
  | ElectricityContractDetails
  | GasContractDetails
  | InsuranceContractDetails;

export type Expense = {
  id: string;
  label: string;
  provider: string;
  category: ExpenseCategory;
  subcategory?: ExpenseSubcategory;
  isRecurring: boolean;
  monthlyAmount: number;
  yearlyAmount: number;
  documentType?: UploadedDocumentType;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  customerNumber?: string;
  contractNumber?: string;
  invoiceNumber?: string;
  phone?: string;
  recurrence: "monthly" | "yearly" | "one_time";
  billingAmount?: number;
  billingFrequency?: DocumentUserCorrections["frequency"];
  contractDetails?: ContractDetails;
  mobileDataGB?: number;
  internetTvIncluded?: boolean;
  internetAccessTechnology?: "fiber" | "adsl" | "unknown";
  internetPromoDetected?: boolean;
  internetCommitmentDetected?: boolean;
  internetBundledMobile?: boolean;
  mobileIncludedDataGB?: number;
  mobileConsumedDataGB?: number;
  mobileRoamingIncludedDataGB?: number;
  mobileDataUnlimited?: boolean;
  mobileAllowLowerDataOffers?: boolean;
  mobileMinimumDataGB?: number;
  mobileInvoiceTotalTTC?: number;
  mobileInvoiceTotalHT?: number;
  mobileSubscriptionBeforeDiscount?: number;
  mobileDiscountAmount?: number;
  mobileRecurringAmountNeedsConfirmation?: boolean;
  mobileHasOneOffCharges?: boolean;
  mobileHasOutOfPlanCharges?: boolean;
  mobileCommitment?: "none" | "unknown";
};

export type Recommendation = {
  id: string;
  title: string;
  description: string;
  category: ExpenseCategory;
  potentialSaving: number;
  priority: "low" | "medium" | "high";
};

export type CustomerProfile = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  customerNumber?: string;
  contractNumber?: string;
  invoiceNumber?: string;
  confidence?: number;
};

export type ProviderProfile = {
  name: string;
  service?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  email?: string;
  phone?: string;
  customerServiceUrl?: string;
  confidence?: number;
};

export type DetectedParties = {
  customer?: CustomerProfile;
  providers?: Record<string, ProviderProfile>;
  documents?: Record<string, DocumentPartyProfile>;
};

export type DocumentPartyProfile = {
  documentId: string;
  fileName?: string;
  documentType?: UploadedDocumentType;
  providerName?: string;
  subscriptionType?: string;
  invoiceAmount?: number;
  contractDetails?: ContractDetails;
  customer?: CustomerProfile;
  provider?: ProviderProfile;
};

export type AnalysisAnomaly = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  category: ExpenseCategory;
};

export type LetterTemplate = {
  id: string;
  title: string;
  description: string;
  type: "negotiation" | "cancellation" | "information_request";
  providerCategory: ExpenseCategory;
};

export type GeneratedLetterType =
  | "subscription_cancellation"
  | "price_negotiation"
  | "provider_followup"
  | "offer_change"
  | "comparison_report";

export type LetterPersonalization = {
  firstName: string;
  lastName: string;
  address: string;
  customerNumber: string;
  email: string;
  contractNumber?: string;
  invoiceNumber?: string;
  phone?: string;
};

export type GeneratedLetter = {
  id: string;
  sourceExpenseId?: string;
  type: GeneratedLetterType;
  provider: string;
  providerAddress?: string;
  customerProfile?: CustomerProfile;
  offerName?: string;
  offerProvider?: string;
  offerMonthlyPrice?: number;
  offerPromotionPrice?: number;
  offerPromotionDurationMonths?: number;
  offerPriceAfterPromotion?: number;
  offerDurableYearlySaving?: number;
  offerEntryFeesKnown?: boolean;
  offerEstimatedYearlySaving?: number;
  offerSavingKind?: "certified" | "temporary" | "recurring_only";
  offerBillingPrice?: number;
  offerBillingPeriodDays?: number;
  offerUrl?: string;
  offerVerifiedAt?: string;
  category: ExpenseCategory;
  potentialSaving: number;
  monthlyAmount: number;
  yearlyAmount: number;
  subject: string;
  title: string;
  bodyTemplate: string;
};

export type AnalysisReport = {
  id: string;
  householdId: string;
  generatedAt: string;
  monthlyExpenses: number;
  yearlyPotentialSavings: number;
  recommendationsCount: number;
};

export type ContractComparisonStatus =
  | "disabled"
  | "missing_information"
  | "unavailable"
  | "no_better_offer"
  | "alternative_found";

export type ContractComparisonState = {
  expenseId: string;
  status: ContractComparisonStatus;
  message: string;
  missingFields?: string[];
};

export type MockAnalysis = {
  id: string;
  generatedAt: string;
  documents: UploadedDocument[];
  detectedParties?: DetectedParties;
  expenses: Expense[];
  recommendations: Recommendation[];
  anomalies: AnalysisAnomaly[];
  totalMonthlyAmount: number;
  totalYearlyAmount: number;
  yearlyPotentialSavings: number;
};
