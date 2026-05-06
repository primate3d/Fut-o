import type {
  AccessKey,
  AnalysisReport,
  Expense,
  UploadedDocument,
  User
} from "@/types";
import {
  ExpenseCategory,
  ExpenseSubcategory,
  type LetterTemplate,
  type Recommendation
} from "@/types";

export const mockUser: User = {
  id: "user_001",
  firstName: "Camille",
  lastName: "Martin",
  email: "camille.martin@example.fr",
  createdAt: "2026-01-15"
};

export const mockAccessKeys: AccessKey[] = [
  {
    id: "key_admin_dev",
    code: "ADMIN-DEV",
    plan: "premium",
    usesRemaining: 999,
    expiresAt: "2099-12-31",
    isActive: true,
    createdAt: "2026-01-01"
  },
  {
    id: "key_simple_001",
    code: "FOYER-SIMPLE-2026",
    plan: "simple",
    usesRemaining: 1,
    expiresAt: "2026-12-31",
    isActive: true,
    createdAt: "2026-04-30"
  },
  {
    id: "key_foyer_001",
    code: "FOYER-AUDIT-2026",
    plan: "foyer",
    usesRemaining: 1,
    expiresAt: "2026-12-31",
    isActive: true,
    createdAt: "2026-04-30"
  },
  {
    id: "key_premium_001",
    code: "FOYER-PREMIUM-2026",
    plan: "premium",
    usesRemaining: 1,
    expiresAt: "2026-12-31",
    isActive: true,
    createdAt: "2026-04-30"
  },
  {
    id: "key_expired_001",
    code: "CLE-EXPIREE",
    plan: "simple",
    usesRemaining: 1,
    expiresAt: "2024-01-01",
    isActive: true,
    createdAt: "2023-12-01"
  },
  {
    id: "key_empty_001",
    code: "CLE-VIDE",
    plan: "premium",
    usesRemaining: 0,
    expiresAt: "2026-12-31",
    isActive: true,
    createdAt: "2026-04-30"
  },
  {
    id: "key_test_premium",
    code: "TEST-PREMIUM",
    plan: "premium",
    usesRemaining: 10,
    expiresAt: "2026-12-31",
    isActive: true,
    createdAt: "2026-05-03"
  }
];

export const mockDocuments: UploadedDocument[] = [
  {
    id: "doc_001",
    fileName: "Facture electricite mars.pdf",
    fileSize: 1240000,
    mimeType: "application/pdf",
    documentType: "electricity_invoice",
    detectedCategory: ExpenseCategory.ENERGY,
    status: "ready",
    uploadedAt: "2026-04-21",
    provider: "Energie Locale"
  },
  {
    id: "doc_002",
    fileName: "Contrat box internet.pdf",
    fileSize: 840000,
    mimeType: "application/pdf",
    documentType: "internet_invoice",
    detectedCategory: ExpenseCategory.TELECOM,
    status: "ready",
    uploadedAt: "2026-04-22",
    provider: "Fibre Plus"
  },
  {
    id: "doc_003",
    fileName: "Assurance habitation.pdf",
    fileSize: 980000,
    mimeType: "application/pdf",
    documentType: "home_insurance",
    detectedCategory: ExpenseCategory.INSURANCE,
    status: "pending",
    uploadedAt: "2026-04-24",
    provider: "Mutuelle Habitat"
  }
];

export const mockExpenses: Expense[] = [
  {
    id: "exp_001",
    label: "Electricite et gaz",
    provider: "EDF",
    category: ExpenseCategory.ENERGY,
    subcategory: ExpenseSubcategory.ELECTRICITY,
    isRecurring: true,
    monthlyAmount: 154,
    yearlyAmount: 1848,
    documentType: "electricity_invoice",
    recurrence: "monthly"
  },
  {
    id: "exp_002",
    label: "Box internet",
    provider: "Orange",
    category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.INTERNET,
    isRecurring: true,
    monthlyAmount: 42,
    yearlyAmount: 504,
    documentType: "internet_invoice",
    recurrence: "monthly"
  },
  {
    id: "exp_003",
    label: "Assurance habitation",
    provider: "Mutuelle Habitat",
    category: ExpenseCategory.INSURANCE,
    subcategory: ExpenseSubcategory.HOME_INSURANCE,
    isRecurring: true,
    monthlyAmount: 31,
    yearlyAmount: 372,
    documentType: "home_insurance",
    recurrence: "monthly"
  },
  {
    id: "exp_004",
    label: "Abonnement streaming",
    provider: "Netflix",
    category: ExpenseCategory.SUBSCRIPTIONS,
    subcategory: ExpenseSubcategory.STREAMING,
    isRecurring: true,
    monthlyAmount: 18,
    yearlyAmount: 216,
    documentType: "subscription",
    recurrence: "monthly"
  },
  {
    id: "exp_005",
    label: "Frais bancaires",
    provider: "Banque Populaire",
    category: ExpenseCategory.BANKING,
    subcategory: ExpenseSubcategory.BANK_FEES,
    isRecurring: true,
    monthlyAmount: 12,
    yearlyAmount: 144,
    documentType: "bank_statement",
    recurrence: "monthly"
  },
  {
    id: "exp_006",
    label: "Transport mensuel",
    provider: "Navigo",
    category: ExpenseCategory.TRANSPORT,
    subcategory: ExpenseSubcategory.PUBLIC_TRANSPORT,
    isRecurring: true,
    monthlyAmount: 86,
    yearlyAmount: 1032,
    documentType: "other",
    recurrence: "monthly"
  }
];

export const mockRecommendations: Recommendation[] = [
  {
    id: "rec_001",
    title: "Renegocier le contrat internet",
    description:
      "Votre forfait semble superieur aux offres disponibles pour un debit comparable.",
    category: ExpenseCategory.TELECOM,
    potentialSaving: 180,
    priority: "high"
  },
  {
    id: "rec_002",
    title: "Comparer l'assurance habitation",
    description:
      "Des garanties similaires pourraient reduire la cotisation annuelle.",
    category: ExpenseCategory.INSURANCE,
    potentialSaving: 96,
    priority: "medium"
  },
  {
    id: "rec_003",
    title: "Regrouper certains abonnements",
    description:
      "Plusieurs services mensuels sont peu utilises et peuvent etre ajustes.",
    category: ExpenseCategory.SUBSCRIPTIONS,
    potentialSaving: 240,
    priority: "medium"
  }
];

export const mockLetters: LetterTemplate[] = [
  {
    id: "letter_001",
    title: "Negociation box internet",
    description: "Demander un geste commercial ou un alignement tarifaire.",
    type: "negotiation",
    providerCategory: ExpenseCategory.TELECOM
  },
  {
    id: "letter_002",
    title: "Resiliation assurance habitation",
    description: "Preparer une demande de resiliation conforme.",
    type: "cancellation",
    providerCategory: ExpenseCategory.INSURANCE
  },
  {
    id: "letter_003",
    title: "Demande d'informations energie",
    description: "Obtenir le detail du contrat et des options facturees.",
    type: "information_request",
    providerCategory: ExpenseCategory.ENERGY
  }
];

export const mockReport: AnalysisReport = {
  id: "report_001",
  householdId: "home_001",
  generatedAt: "2026-04-25",
  monthlyExpenses: mockExpenses.reduce((total, expense) => total + expense.monthlyAmount, 0),
  yearlyPotentialSavings: 516,
  recommendationsCount: mockRecommendations.length
};
