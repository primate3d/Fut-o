import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { DocumentUserCorrections, UploadedDocument } from "@/types";

export const UPLOADED_DOCUMENTS_STORAGE_KEY = "futeo.uploadedDocuments";
export const DOCUMENT_CORRECTIONS_STORAGE_KEY = "futeo.documentCorrections";

export function getStoredUploadedDocuments(): UploadedDocument[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(UPLOADED_DOCUMENTS_STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    return JSON.parse(storedValue) as UploadedDocument[];
  } catch {
    return [];
  }
}

export async function getStoredUploadedDocumentsServer(): Promise<UploadedDocument[]> {
  const localDocuments = getStoredUploadedDocuments();
  const activeKey = getStoredAccessKey();

  if (!activeKey) {
    return localDocuments;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`/api/documents?code=${activeKey.code}`, {
      signal: controller.signal
    });
    if (!response.ok) return localDocuments;

    const { documents } = (await response.json()) as {
      documents?: UploadedDocument[];
    };

    return Array.isArray(documents)
      ? documents
      : localDocuments;
  } catch {
    return localDocuments;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function storeUploadedDocumentServer(
  document: UploadedDocument,
  file: File
): Promise<UploadedDocument | null> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return null;

  try {
    const formData = new FormData();
    formData.append("code", activeKey.code);
    formData.append("document", JSON.stringify(document));
    formData.append("file", file);

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { document?: UploadedDocument };
    return data.document ?? null;
  } catch (error) {
    console.error("Synchronisation serveur du document indisponible:", error);
    return null;
  }
}

export function storeUploadedDocuments(documents: UploadedDocument[]) {
  window.localStorage.setItem(
    UPLOADED_DOCUMENTS_STORAGE_KEY,
    JSON.stringify(documents)
  );
}

export function getStoredDocumentCorrections(): Record<string, DocumentUserCorrections> {
  if (typeof window === "undefined") {
    return {};
  }

  const storedValue = window.localStorage.getItem(DOCUMENT_CORRECTIONS_STORAGE_KEY);
  if (!storedValue) {
    return {};
  }

  try {
    return JSON.parse(storedValue) as Record<string, DocumentUserCorrections>;
  } catch {
    return {};
  }
}

export function storeDocumentCorrections(
  corrections: Record<string, DocumentUserCorrections>
) {
  window.localStorage.setItem(
    DOCUMENT_CORRECTIONS_STORAGE_KEY,
    JSON.stringify(corrections)
  );
}

export function clearStoredDocumentCorrections() {
  window.localStorage.removeItem(DOCUMENT_CORRECTIONS_STORAGE_KEY);
}

export function removeStoredDocumentCorrection(documentId: string) {
  const corrections = getStoredDocumentCorrections();
  delete corrections[documentId];
  storeDocumentCorrections(corrections);
}

export function applyDocumentCorrections(
  documents: UploadedDocument[]
): UploadedDocument[] {
  const corrections = getStoredDocumentCorrections();

  return documents.map((document) => {
    const correction = corrections[document.id];
    if (!correction) {
      return document;
    }

    return {
      ...document,
      provider: correction.provider?.trim() || document.provider,
      documentType: correction.documentType || document.documentType,
      userCorrections: correction
    };
  });
}

export async function deleteDocumentServer(documentId: string) {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return;

  try {
    await fetch("/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: activeKey.code, documentId })
    });
  } catch (error) {
    console.error("Suppression serveur du document indisponible:", error);
  }
}
