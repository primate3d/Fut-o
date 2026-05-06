import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { UploadedDocument } from "@/types";

export const UPLOADED_DOCUMENTS_STORAGE_KEY = "futeo.uploadedDocuments";

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

  try {
    const response = await fetch(`/api/documents?code=${activeKey.code}`);
    if (!response.ok) return localDocuments;

    const { documents } = (await response.json()) as {
      documents?: UploadedDocument[];
    };

    return Array.isArray(documents) && documents.length > 0
      ? documents
      : localDocuments;
  } catch {
    return localDocuments;
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
