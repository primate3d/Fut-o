import { getStoredAccessKey } from "@/features/billing/access-keys";
import { applyDocumentCorrections } from "@/features/upload/storage";
import { ExpenseSubcategory, type Expense, type MockAnalysis, type UploadedDocument } from "@/types";

export const MOCK_ANALYSIS_STORAGE_KEY = "futeo.mockAnalysis";
export const REPORT_PORTFOLIO_STORAGE_KEY = "futeo.reportPortfolio";

export type ReportPortfolioEntry = {
  category: string;
  analysis: MockAnalysis;
  updatedAt: string;
};

export type AnalysisServerErrorDetails = {
  code?: string;
  documentCount: number;
  message: string;
  status: number;
};

export class AnalysisServerError extends Error {
  details: AnalysisServerErrorDetails;

  constructor(details: AnalysisServerErrorDetails) {
    super(details.message);
    this.name = "AnalysisServerError";
    this.details = details;
  }
}

export async function getStoredAnalysisServer(): Promise<MockAnalysis | null> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return null;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`/api/analyse?code=${activeKey.code}`, {
      signal: controller.signal
    });
    if (!response.ok) return null;
    const { analysis } = await response.json();
    return analysis;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getStoredMockAnalysis(): MockAnalysis | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(MOCK_ANALYSIS_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as MockAnalysis;
  } catch {
    return null;
  }
}

export function storeMockAnalysis(analysis: MockAnalysis) {
  window.localStorage.setItem(MOCK_ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
}

function getReportPortfolioStorageKey() {
  const activeKey = getStoredAccessKey();
  return activeKey
    ? `${REPORT_PORTFOLIO_STORAGE_KEY}.${activeKey.code}`
    : `${REPORT_PORTFOLIO_STORAGE_KEY}.anonymous`;
}

function getExpensePortfolioCategory(expense: Expense) {
  if (expense.subcategory && expense.subcategory !== ExpenseSubcategory.OTHER) {
    return expense.subcategory;
  }

  return expense.documentType ?? expense.category;
}

function deduplicateById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function selectAnalysisCategory(analysis: MockAnalysis, category: string): MockAnalysis {
  const expenses = analysis.expenses.filter(
    (expense) => getExpensePortfolioCategory(expense) === category
  );
  const sourceDocumentIds = new Set(
    expenses.map((expense) => expense.sourceDocumentId).filter((id): id is string => Boolean(id))
  );
  const documents =
    sourceDocumentIds.size > 0
      ? analysis.documents.filter((document) => sourceDocumentIds.has(document.id))
      : analysis.documents;
  const documentParties = analysis.detectedParties?.documents
    ? Object.fromEntries(
        Object.entries(analysis.detectedParties.documents).filter(([documentId]) =>
          sourceDocumentIds.size === 0 || sourceDocumentIds.has(documentId)
        )
      )
    : undefined;
  const expenseCategories = new Set(expenses.map((expense) => expense.category));

  return {
    ...analysis,
    id: `${analysis.id}_${category}`,
    documents,
    detectedParties: analysis.detectedParties
      ? {
          ...analysis.detectedParties,
          documents: documentParties
        }
      : undefined,
    expenses,
    recommendations: analysis.recommendations.filter((recommendation) =>
      expenseCategories.has(recommendation.category)
    ),
    anomalies: analysis.anomalies.filter((anomaly) => expenseCategories.has(anomaly.category)),
    totalMonthlyAmount: expenses.reduce((total, expense) => total + expense.monthlyAmount, 0),
    totalYearlyAmount: expenses.reduce((total, expense) => total + expense.yearlyAmount, 0),
    yearlyPotentialSavings:
      expenses.length === analysis.expenses.length ? analysis.yearlyPotentialSavings : 0
  };
}

export function getStoredReportPortfolio(): ReportPortfolioEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(getReportPortfolioStorageKey());
  if (!storedValue) {
    return [];
  }

  try {
    const entries = JSON.parse(storedValue) as ReportPortfolioEntry[];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function addOrUpdateToPortfolio(category: string, data: MockAnalysis) {
  if (typeof window === "undefined") {
    return;
  }

  const currentEntries = getStoredReportPortfolio();
  const nextEntry: ReportPortfolioEntry = {
    category,
    analysis: data,
    updatedAt: new Date().toISOString()
  };
  const nextEntries = currentEntries.some((entry) => entry.category === category)
    ? currentEntries.map((entry) => (entry.category === category ? nextEntry : entry))
    : [...currentEntries, nextEntry];

  window.localStorage.setItem(getReportPortfolioStorageKey(), JSON.stringify(nextEntries));
}

export function addAnalysisToReportPortfolio(analysis: MockAnalysis) {
  const categories = Array.from(
    new Set(analysis.expenses.map((expense) => getExpensePortfolioCategory(expense)))
  );

  categories.forEach((category) => {
    addOrUpdateToPortfolio(category, selectAnalysisCategory(analysis, category));
  });
}

export function getStoredReportPortfolioAnalysis(): MockAnalysis | null {
  const entries = getStoredReportPortfolio();
  if (entries.length === 0) {
    return null;
  }

  const analyses = entries.map((entry) => entry.analysis);
  const documents = deduplicateById(analyses.flatMap((analysis) => analysis.documents));
  const expenses = deduplicateById(analyses.flatMap((analysis) => analysis.expenses));
  const recommendations = deduplicateById(
    analyses.flatMap((analysis) => analysis.recommendations)
  );
  const anomalies = deduplicateById(analyses.flatMap((analysis) => analysis.anomalies));
  const documentParties = Object.assign(
    {},
    ...analyses.map((analysis) => analysis.detectedParties?.documents ?? {})
  );
  const providers = Object.assign(
    {},
    ...analyses.map((analysis) => analysis.detectedParties?.providers ?? {})
  );
  const latestAnalysis = analyses.reduce((latest, analysis) =>
    analysis.generatedAt > latest.generatedAt ? analysis : latest
  );

  return {
    id: `report_portfolio_${latestAnalysis.id}`,
    generatedAt: latestAnalysis.generatedAt,
    documents,
    detectedParties: {
      customer: latestAnalysis.detectedParties?.customer,
      providers,
      documents: documentParties
    },
    expenses,
    recommendations,
    anomalies,
    totalMonthlyAmount: expenses.reduce((total, expense) => total + expense.monthlyAmount, 0),
    totalYearlyAmount: expenses.reduce((total, expense) => total + expense.yearlyAmount, 0),
    yearlyPotentialSavings: analyses.reduce(
      (total, analysis) => total + analysis.yearlyPotentialSavings,
      0
    )
  };
}

export function hasDocumentProfiles(analysis: MockAnalysis | null) {
  return Boolean(
    analysis?.detectedParties?.documents &&
      Object.keys(analysis.detectedParties.documents).length > 0
  );
}

export function isAnalysisForDocuments(
  analysis: MockAnalysis | null,
  documents: UploadedDocument[]
) {
  if (!analysis) {
    return false;
  }

  const currentDocumentIds = documents
    .filter((document) => document.status !== "error")
    .map((document) => document.id)
    .sort();
  const analysisDocumentIds = analysis.documents
    .map((document) => document.id)
    .sort();

  return (
    currentDocumentIds.length > 0 &&
    currentDocumentIds.length === analysisDocumentIds.length &&
    currentDocumentIds.every((documentId, index) => documentId === analysisDocumentIds[index])
  );
}

export function isEnrichedAnalysisForDocuments(
  analysis: MockAnalysis | null,
  documents: UploadedDocument[]
) {
  return isAnalysisForDocuments(analysis, documents) && hasDocumentProfiles(analysis);
}

export async function refreshStoredAnalysisServer(
  documents: UploadedDocument[],
  options?: { force?: boolean; throwOnError?: boolean }
): Promise<MockAnalysis | null> {
  const activeKey = getStoredAccessKey();
  if (!activeKey || documents.length === 0) return null;
  const documentsWithCorrections = applyDocumentCorrections(documents);

  console.info("[FUTEO_ANALYSIS_POST]", {
    code: activeKey.code,
    documentCount: documentsWithCorrections.length,
    force: options?.force ?? false
  });

  let response: Response;
  try {
    response = await fetch("/api/analyse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        documents: documentsWithCorrections,
        code: activeKey.code,
        force: options?.force ?? false
      })
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur reseau pendant POST /api/analyse";
    const details = {
      code: activeKey.code,
      documentCount: documentsWithCorrections.length,
      message,
      status: 0
    };
    console.warn("[FUTEO_ANALYSIS_POST_ERROR]", details);
    if (options?.throwOnError) {
      throw new AnalysisServerError(details);
    }
    return null;
  }

  if (!response.ok) {
    let message = `POST /api/analyse a echoue (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string; details?: string };
      message = payload.details || payload.error || message;
    } catch {
      // Keep the HTTP status message when the body is not JSON.
    }
    const details = {
      code: activeKey.code,
      documentCount: documentsWithCorrections.length,
      message,
      status: response.status
    };
    console.warn("[FUTEO_ANALYSIS_POST_ERROR]", details);
    if (options?.throwOnError) {
      throw new AnalysisServerError(details);
    }
    return null;
  }

  const { analysis } = (await response.json()) as { analysis?: MockAnalysis };
  console.info("[FUTEO_ANALYSIS_POST_OK]", {
    code: activeKey.code,
    documentCount: documentsWithCorrections.length,
    expensesCount: analysis?.expenses.length ?? 0,
    status: response.status
  });
  return analysis ?? null;
}

export async function deleteStoredAnalysisServer(): Promise<boolean> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return false;

  try {
    const response = await fetch(`/api/analyse?code=${activeKey.code}`, {
      method: "DELETE"
    });
    return response.ok;
  } catch {
    return false;
  }
}
