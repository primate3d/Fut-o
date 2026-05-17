import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { MockAnalysis, UploadedDocument } from "@/types";

export const MOCK_ANALYSIS_STORAGE_KEY = "futeo.mockAnalysis";

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
  documents: UploadedDocument[]
): Promise<MockAnalysis | null> {
  const activeKey = getStoredAccessKey();
  if (!activeKey || documents.length === 0) return null;

  const response = await fetch("/api/analyse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documents,
      code: activeKey.code
    })
  });

  if (!response.ok) return null;

  const { analysis } = (await response.json()) as { analysis?: MockAnalysis };
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
