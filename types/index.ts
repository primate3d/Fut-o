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
  status: "ready" | "pending" | "error" | "uploading";
  uploadedAt: string;
  provider?: string;
};

export type UploadedDocumentType =
  | "bank_statement"
  | "electricity_invoice"
  | "gas_invoice"
  | "internet_invoice"
  | "mobile_invoice"
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
  STREAMING = "STREAMING",
  BANK_FEES = "BANK_FEES",
  RENT = "RENT",
  PUBLIC_TRANSPORT = "PUBLIC_TRANSPORT",
  MUTUAL_HEALTH = "MUTUAL_HEALTH",
  SCHOOL = "SCHOOL",
  SPORT = "SPORT",
  OTHER = "OTHER"
}

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
  type: GeneratedLetterType;
  provider: string;
  providerAddress?: string;
  customerProfile?: CustomerProfile;
  offerName?: string;
  offerUrl?: string;
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
