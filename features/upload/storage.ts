import { getStoredAccessKey } from "@/features/billing/access-keys";
import { createAccessKeyHeaders } from "@/lib/access-key-transport";
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

export async function getStoredUploadedDocumentsServerStrict(): Promise<UploadedDocument[]> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) throw new Error("Aucune clé d'accès active.");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch("/api/documents", {
      headers: createAccessKeyHeaders(activeKey.code),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error("La lecture serveur des documents a échoué.");
    }

    const { documents } = (await response.json()) as {
      documents?: UploadedDocument[];
    };
    if (!Array.isArray(documents)) {
      throw new Error("La réponse serveur des documents est incomplète.");
    }
    return documents;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function getStoredUploadedDocumentsServer(): Promise<UploadedDocument[]> {
  const localDocuments = getStoredUploadedDocuments();
  try {
    return await getStoredUploadedDocumentsServerStrict();
  } catch {
    return localDocuments;
  }
}

export async function storeUploadedDocumentServer(
  document: UploadedDocument,
  file: File,
  replacementBatchId?: string
): Promise<UploadedDocument> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) throw new Error("Aucune clé d'accès active.");

  try {
    const formData = new FormData();
    formData.append("code", activeKey.code);
    formData.append("document", JSON.stringify(document));
    formData.append("file", file);
    if (replacementBatchId) {
      formData.append("replacementBatchId", replacementBatchId);
    }

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("L'enregistrement serveur du document a échoué.");
    }

    const data = (await response.json()) as { document?: UploadedDocument };
    if (!data.document) {
      throw new Error("La réponse serveur du document est incomplète.");
    }
    return data.document;
  } catch (error) {
    console.error("Synchronisation serveur du document indisponible");
    throw error;
  }
}

async function updateDocumentReplacementServer(
  replacementAction: "commit" | "rollback",
  replacementBatchId: string,
  replacementDocumentIds?: string[]
) {
  const activeKey = getStoredAccessKey();
  if (!activeKey) throw new Error("Aucune clé d'accès active.");

  const response = await fetch("/api/documents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: activeKey.code,
      replacementAction,
      replacementBatchId,
      replacementDocumentIds
    })
  });

  if (!response.ok) {
    throw new Error(
      replacementAction === "commit"
        ? "Le remplacement de l'audit a échoué."
        : "L'annulation du remplacement a échoué."
    );
  }

  return response;
}

export async function commitDocumentReplacementServer(
  replacementBatchId: string,
  replacementDocumentIds: string[]
): Promise<UploadedDocument[]> {
  const response = await updateDocumentReplacementServer(
    "commit",
    replacementBatchId,
    replacementDocumentIds
  );
  const data = (await response.json()) as { documents?: UploadedDocument[] };
  if (!Array.isArray(data.documents)) {
    throw new Error("La réponse de remplacement est incomplète.");
  }
  return data.documents;
}

export async function rollbackDocumentReplacementServer(
  replacementBatchId: string
): Promise<void> {
  await updateDocumentReplacementServer("rollback", replacementBatchId);
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

export async function deleteDocumentServer(documentId: string): Promise<boolean> {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return false;

  try {
    const response = await fetch("/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: activeKey.code, documentId })
    });
    return response.ok;
  } catch {
    console.error("Suppression serveur du document indisponible");
    return false;
  }
}
