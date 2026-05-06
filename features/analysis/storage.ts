import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { MockAnalysis, UploadedDocument } from "@/types";

export const MOCK_ANALYSIS_STORAGE_KEY = "futeo.mockAnalysis";

export async function getStoredAnalysisServer(): Promise<MockAnalysis | null> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return null;

  try {
    const response = await fetch(`/api/analyse?code=${activeKey.code}`);
    if (!response.ok) return null;
    const { analysis } = await response.json();
    return analysis;
  } catch {
    return null;
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
