import { getStoredAccessKey } from "@/features/billing/access-keys";
import { applyDocumentCorrections } from "@/features/upload/storage";
import type { MockAnalysis, UploadedDocument } from "@/types";

export const MOCK_ANALYSIS_STORAGE_KEY = "futeo.mockAnalysis";

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
