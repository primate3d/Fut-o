import { getCategoryForDocumentType, getDocumentTypeLabel } from "@/features/upload/document-types";
import { RequestError } from "@/lib/server/request-error";
import {
  ExpenseSubcategory,
  type AccessKey,
  type CustomerProfile,
  type DocumentUserCorrections,
  type Expense,
  type MockAnalysis,
  type UploadedDocument,
  type UploadedDocumentType
} from "@/types";

const MANUAL_DOCUMENT_TYPES = new Set<UploadedDocumentType>([
  "electricity_invoice",
  "gas_invoice",
  "internet_invoice",
  "mobile_invoice",
  "two_wheeler_insurance",
  "car_insurance",
  "home_insurance",
  "other"
]);

const MANUAL_FREQUENCIES = new Set<NonNullable<DocumentUserCorrections["frequency"]>>([
  "monthly",
  "bimonthly",
  "quarterly",
  "yearly",
  "one_time",
  "schedule"
]);

export type ManualContractInput = {
  requestId?: unknown;
  provider?: unknown;
  documentType?: unknown;
  amount?: unknown;
  frequency?: unknown;
  mobileDataGB?: unknown;
  mobileDataUnlimited?: unknown;
  mobileAllowLowerDataOffers?: unknown;
  internetTvIncluded?: unknown;
  clientFirstName?: unknown;
  clientLastName?: unknown;
  clientAddress?: unknown;
  customerNumber?: unknown;
  contractNumber?: unknown;
  invoiceNumber?: unknown;
  phone?: unknown;
  email?: unknown;
  providerAddress?: unknown;
};

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(`${field} manquant`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new RequestError(`${field} trop long`, 400);
  }
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new RequestError(`${field} invalide`, 400);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new RequestError(`${field} trop long`, 400);
  return normalized;
}

function normalizeHouseholdName(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getManualSubcategory(documentType: UploadedDocumentType) {
  if (documentType === "electricity_invoice") return ExpenseSubcategory.ELECTRICITY;
  if (documentType === "gas_invoice") return ExpenseSubcategory.GAS;
  if (documentType === "internet_invoice") return ExpenseSubcategory.INTERNET;
  if (documentType === "mobile_invoice") return ExpenseSubcategory.MOBILE;
  if (documentType === "two_wheeler_insurance") {
    return ExpenseSubcategory.TWO_WHEELER_INSURANCE;
  }
  if (documentType === "home_insurance") return ExpenseSubcategory.HOME_INSURANCE;
  return ExpenseSubcategory.OTHER;
}

function getManualAmounts(
  amount: number,
  frequency: NonNullable<DocumentUserCorrections["frequency"]>
) {
  if (frequency === "bimonthly") {
    return { monthlyAmount: amount / 2, yearlyAmount: amount * 6 };
  }
  if (frequency === "quarterly") {
    return { monthlyAmount: amount / 3, yearlyAmount: amount * 4 };
  }
  if (frequency === "yearly" || frequency === "one_time") {
    return { monthlyAmount: amount / 12, yearlyAmount: amount };
  }
  return { monthlyAmount: amount, yearlyAmount: amount * 12 };
}

function getManualRecurrence(
  frequency: NonNullable<DocumentUserCorrections["frequency"]>
): "monthly" | "yearly" | "one_time" {
  if (frequency === "yearly") return "yearly";
  if (frequency === "one_time") return "one_time";
  return "monthly";
}

function mergeCustomer(
  current: CustomerProfile | undefined,
  addition: CustomerProfile | undefined
) {
  if (!current) return addition;
  if (!addition) return current;
  const merged = { ...addition };
  for (const [field, value] of Object.entries(current)) {
    if (value !== undefined && value !== "") {
      merged[field as keyof CustomerProfile] = value as never;
    }
  }
  return merged;
}

function deduplicateById<T extends { id: string }>(current: T[], addition: T[]) {
  return Array.from(new Map([...current, ...addition].map((item) => [item.id, item])).values());
}

export function isManualDocument(document: UploadedDocument) {
  return document.mimeType === "manual/input";
}

export function buildManualAnalysis(input: ManualContractInput, key: AccessKey): MockAnalysis {
  const requestId = requiredString(input.requestId, "Identifiant de saisie", 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new RequestError("Identifiant de saisie invalide", 400);
  }

  const provider = requiredString(input.provider, "Fournisseur", 160);
  if (typeof input.documentType !== "string" || !MANUAL_DOCUMENT_TYPES.has(input.documentType as UploadedDocumentType)) {
    throw new RequestError("Type de contrat invalide", 400);
  }
  const documentType = input.documentType as UploadedDocumentType;
  if (typeof input.frequency !== "string" || !MANUAL_FREQUENCIES.has(input.frequency as NonNullable<DocumentUserCorrections["frequency"]>)) {
    throw new RequestError("Frequence invalide", 400);
  }
  const frequency = input.frequency as NonNullable<DocumentUserCorrections["frequency"]>;
  const amount = typeof input.amount === "number" ? input.amount : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw new RequestError("Montant invalide", 400);
  }

  const clientFirstName = optionalString(input.clientFirstName, "Prenom", 120);
  const clientLastName = optionalString(input.clientLastName, "Nom", 120);
  const submittedFullName = [clientFirstName, clientLastName].filter(Boolean).join(" ");
  const allowedNames = (key.allowedNames ?? []).map(normalizeHouseholdName).filter(Boolean);
  if (clientLastName && allowedNames.length > 0) {
    const normalizedName = normalizeHouseholdName(clientLastName);
    const matches = allowedNames.some((allowedName) =>
      ` ${allowedName} `.includes(` ${normalizedName} `) ||
      ` ${normalizedName} `.includes(` ${allowedName} `)
    );
    if (!matches) {
      throw new RequestError("Contrat non conforme au foyer configure", 403);
    }
  }

  const email = optionalString(input.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError("Email invalide", 400);
  }
  const mobileDataGB = input.mobileDataGB === undefined || input.mobileDataGB === null || input.mobileDataGB === ""
    ? undefined
    : Number(input.mobileDataGB);
  if (mobileDataGB !== undefined && (!Number.isFinite(mobileDataGB) || mobileDataGB < 0 || mobileDataGB > 100_000)) {
    throw new RequestError("Volume de donnees invalide", 400);
  }
  if (input.mobileDataUnlimited !== undefined && typeof input.mobileDataUnlimited !== "boolean") {
    throw new RequestError("Type de volume mobile invalide", 400);
  }
  if (
    input.mobileAllowLowerDataOffers !== undefined &&
    typeof input.mobileAllowLowerDataOffers !== "boolean"
  ) {
    throw new RequestError("Preference de comparaison mobile invalide", 400);
  }
  const mobileDataUnlimited = input.mobileDataUnlimited === true;
  const mobileAllowLowerDataOffers = input.mobileAllowLowerDataOffers === true;
  if (documentType === "mobile_invoice") {
    if (mobileDataUnlimited && mobileDataGB !== undefined) {
      throw new RequestError("Choisissez un volume mobile ou un forfait illimite", 400);
    }
    if (!mobileDataUnlimited && mobileDataGB === undefined) {
      throw new RequestError("Volume de donnees inclus manquant", 400);
    }
  }

  const documentId = `manual_${requestId.toLowerCase()}`;
  const now = new Date().toISOString();
  const category = getCategoryForDocumentType(documentType);
  const label = getDocumentTypeLabel(documentType);
  const documentName = `Saisie manuelle - ${label}`;
  const { monthlyAmount, yearlyAmount } = getManualAmounts(amount, frequency);
  const fallbackName = key.allowedNames?.find((name) => name.trim())?.trim();
  const customerFullName = submittedFullName || fallbackName
    ? [clientFirstName, clientLastName || fallbackName].filter(Boolean).join(" ")
    : undefined;
  const customerProfile: CustomerProfile | undefined = submittedFullName || fallbackName || key.profilePostalAddress
    ? {
        firstName: clientFirstName,
        lastName: clientLastName,
        fullName: customerFullName,
        address: optionalString(input.clientAddress, "Adresse client", 500) || key.profilePostalAddress || undefined,
        customerNumber: optionalString(input.customerNumber, "Numero client", 120),
        contractNumber: optionalString(input.contractNumber, "Numero de contrat", 120),
        invoiceNumber: optionalString(input.invoiceNumber, "Numero de facture", 120),
        phone: optionalString(input.phone, "Telephone", 80),
        email
      }
    : undefined;
  const providerProfile = {
    name: provider,
    address: optionalString(input.providerAddress, "Adresse fournisseur", 500)
  };
  const manualDocument: UploadedDocument = {
    id: documentId,
    fileName: documentName,
    fileSize: 0,
    mimeType: "manual/input",
    documentType,
    detectedCategory: category,
    status: "ready",
    uploadedAt: now,
    provider,
    userCorrections: {
      provider,
      documentType,
      amount,
      frequency,
      isMultiContract: true
    }
  };

  return {
    id: `analysis_${documentId}`,
    generatedAt: now,
    documents: [manualDocument],
    detectedParties: {
      customer: customerProfile,
      providers: { [provider]: providerProfile },
      documents: {
        [documentId]: {
          documentId,
          fileName: documentName,
          documentType,
          providerName: provider,
          invoiceAmount: amount,
          customer: customerProfile,
          provider: providerProfile
        }
      }
    },
    expenses: [{
      id: `expense_${documentId}`,
      label,
      provider,
      category,
      subcategory: getManualSubcategory(documentType),
      isRecurring: frequency !== "one_time",
      monthlyAmount,
      yearlyAmount,
      documentType,
      sourceDocumentId: documentId,
      sourceDocumentName: documentName,
      customerNumber: customerProfile?.customerNumber,
      contractNumber: customerProfile?.contractNumber,
      invoiceNumber: customerProfile?.invoiceNumber,
      phone: customerProfile?.phone,
      recurrence: getManualRecurrence(frequency),
      billingAmount: amount,
      billingFrequency: frequency,
      ...(documentType === "mobile_invoice"
        ? {
            mobileDataGB,
            mobileIncludedDataGB: mobileDataGB,
            mobileDataUnlimited,
            mobileAllowLowerDataOffers
          }
        : {}),
      ...(documentType === "internet_invoice" ? { internetTvIncluded: input.internetTvIncluded === true } : {})
    }],
    recommendations: [],
    anomalies: [],
    totalMonthlyAmount: monthlyAmount,
    totalYearlyAmount: yearlyAmount,
    yearlyPotentialSavings: 0
  };
}

export type MobileContractPreferencesInput = {
  expenseId?: unknown;
  mobileDataGB?: unknown;
  mobileDataUnlimited?: unknown;
  mobileAllowLowerDataOffers?: unknown;
};

export function applyMobileContractPreferences(
  analysis: MockAnalysis,
  input: MobileContractPreferencesInput
): MockAnalysis {
  const expenseId = requiredString(input.expenseId, "Contrat mobile", 180);
  const expense = analysis.expenses.find((candidate) => candidate.id === expenseId);
  if (
    !expense ||
    (expense.documentType !== "mobile_invoice" && expense.subcategory !== ExpenseSubcategory.MOBILE)
  ) {
    throw new RequestError("Contrat mobile introuvable", 404);
  }
  if (typeof input.mobileDataUnlimited !== "boolean") {
    throw new RequestError("Type de volume mobile invalide", 400);
  }
  if (typeof input.mobileAllowLowerDataOffers !== "boolean") {
    throw new RequestError("Preference de comparaison mobile invalide", 400);
  }

  const mobileDataUnlimited = input.mobileDataUnlimited;
  const mobileDataGB = input.mobileDataGB === undefined || input.mobileDataGB === null || input.mobileDataGB === ""
    ? undefined
    : Number(input.mobileDataGB);
  if (
    mobileDataGB !== undefined &&
    (!Number.isFinite(mobileDataGB) || mobileDataGB < 0 || mobileDataGB > 100_000)
  ) {
    throw new RequestError("Volume de donnees invalide", 400);
  }
  if (mobileDataUnlimited && mobileDataGB !== undefined) {
    throw new RequestError("Choisissez un volume mobile ou un forfait illimite", 400);
  }
  if (!mobileDataUnlimited && mobileDataGB === undefined) {
    throw new RequestError("Volume de donnees inclus manquant", 400);
  }

  const updateExpense = (candidate: Expense): Expense =>
    candidate.id === expenseId
      ? {
          ...candidate,
          mobileDataGB,
          mobileIncludedDataGB: mobileDataGB,
          mobileDataUnlimited,
          mobileAllowLowerDataOffers: input.mobileAllowLowerDataOffers as boolean
        }
      : candidate;

  return {
    ...analysis,
    expenses: analysis.expenses.map(updateExpense)
  };
}

export function mergeAnalyses(current: MockAnalysis | null, addition: MockAnalysis) {
  if (!current) return addition;
  const documents = deduplicateById(current.documents, addition.documents);
  const expenses = deduplicateById(current.expenses, addition.expenses);
  const recommendations = deduplicateById(current.recommendations, addition.recommendations);
  const anomalies = deduplicateById(current.anomalies, addition.anomalies);

  return {
    ...current,
    generatedAt: addition.generatedAt,
    documents,
    detectedParties: {
      customer: mergeCustomer(current.detectedParties?.customer, addition.detectedParties?.customer),
      providers: {
        ...(current.detectedParties?.providers ?? {}),
        ...(addition.detectedParties?.providers ?? {})
      },
      documents: {
        ...(current.detectedParties?.documents ?? {}),
        ...(addition.detectedParties?.documents ?? {})
      }
    },
    expenses,
    recommendations,
    anomalies,
    totalMonthlyAmount: expenses.reduce((total, expense) => total + expense.monthlyAmount, 0),
    totalYearlyAmount: expenses.reduce((total, expense) => total + expense.yearlyAmount, 0),
    yearlyPotentialSavings: current.yearlyPotentialSavings + addition.yearlyPotentialSavings
  } satisfies MockAnalysis;
}

export function preserveManualEntries(generated: MockAnalysis, existing: MockAnalysis | null) {
  if (!existing) return generated;
  const manualDocumentIds = new Set(
    existing.documents.filter(isManualDocument).map((document) => document.id)
  );
  if (manualDocumentIds.size === 0) return generated;

  const manualAnalysis: MockAnalysis = {
    ...existing,
    documents: existing.documents.filter((document) => manualDocumentIds.has(document.id)),
    detectedParties: existing.detectedParties
      ? {
          customer: existing.detectedParties.customer,
          providers: existing.detectedParties.providers,
          documents: Object.fromEntries(
            Object.entries(existing.detectedParties.documents ?? {}).filter(([documentId]) =>
              manualDocumentIds.has(documentId)
            )
          )
        }
      : undefined,
    expenses: existing.expenses.filter((expense) =>
      Boolean(expense.sourceDocumentId && manualDocumentIds.has(expense.sourceDocumentId))
    ),
    recommendations: [],
    anomalies: [],
    totalMonthlyAmount: 0,
    totalYearlyAmount: 0,
    yearlyPotentialSavings: 0
  };
  return mergeAnalyses(generated, manualAnalysis);
}
