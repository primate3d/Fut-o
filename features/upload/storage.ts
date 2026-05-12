import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { UploadedDocument } from "@/types";

export const UPLOADED_DOCUMENTS_STORAGE_KEY = "futeo.uploadedDocuments";
const UPLOADED_DOCUMENTS_OWNER_KEY = "futeo.uploadedDocumentsOwner";
const DEBUG_FLOW = process.env.NODE_ENV !== "production";

function debugFlow(message: string, metadata?: Record<string, unknown>) {
  if (DEBUG_FLOW) {
    console.debug(`[Futéo flow] ${message}`, metadata ?? {});
  }
}

function getActiveKeyCode() {
  return getStoredAccessKey()?.code ?? "";
}

function hasLocalDocumentSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(UPLOADED_DOCUMENTS_STORAGE_KEY) !== null;
}

function hasSameDocumentIds(left: UploadedDocument[], right: UploadedDocument[]) {
  const leftIds = left.map((document) => document.id).sort();
  const rightIds = right.map((document) => document.id).sort();

  return (
    leftIds.length === rightIds.length &&
    leftIds.every((documentId, index) => documentId === rightIds[index])
  );
}

export function getStoredUploadedDocuments(): UploadedDocument[] {
  if (typeof window === "undefined") {
    return [];
  }

  const activeKeyCode = getActiveKeyCode();
  const ownerKey = window.localStorage.getItem(UPLOADED_DOCUMENTS_OWNER_KEY);
  const storedValue = window.localStorage.getItem(UPLOADED_DOCUMENTS_STORAGE_KEY);

  if (activeKeyCode && storedValue !== null && !ownerKey) {
    window.localStorage.setItem(UPLOADED_DOCUMENTS_STORAGE_KEY, "[]");
    window.localStorage.setItem(UPLOADED_DOCUMENTS_OWNER_KEY, activeKeyCode);
    debugFlow("Documents locaux hérités ignorés: aucun propriétaire de clé", {
      activeKeyCode
    });
    return [];
  }

  if (ownerKey && activeKeyCode && ownerKey !== activeKeyCode) {
    debugFlow("Documents locaux ignorés: clé active différente", {
      ownerKey,
      activeKeyCode
    });
    return [];
  }

  if (!storedValue) {
    return [];
  }

  try {
    const documents = JSON.parse(storedValue) as UploadedDocument[];
    debugFlow("Documents locaux chargés", {
      activeKeyCode,
      count: documents.length,
      documentIds: documents.map((document) => document.id)
    });
    return documents;
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

  if (!hasLocalDocumentSnapshot()) {
    debugFlow("Session locale vide: hydratation serveur ignorée", {
      keyCode: activeKey.code
    });
    return [];
  }

  if (localDocuments.length === 0) {
    debugFlow("Aucun document local actif: hydratation serveur ignorée", {
      keyCode: activeKey.code
    });
    return [];
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

    if (Array.isArray(documents) && documents.length > 0 && hasSameDocumentIds(documents, localDocuments)) {
      debugFlow("Documents serveur chargés", {
        keyCode: activeKey.code,
        count: documents.length,
        documentIds: documents.map((document) => document.id)
      });
      storeUploadedDocuments(documents);
      return documents;
    }

    debugFlow("Documents serveur ignorés: mismatch avec le local", {
      keyCode: activeKey.code,
      localIds: localDocuments.map((document) => document.id),
      serverIds: Array.isArray(documents) ? documents.map((document) => document.id) : []
    });
    return localDocuments;
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
  const activeKeyCode = getActiveKeyCode();
  if (activeKeyCode) {
    window.localStorage.setItem(UPLOADED_DOCUMENTS_OWNER_KEY, activeKeyCode);
  }

  window.localStorage.setItem(
    UPLOADED_DOCUMENTS_STORAGE_KEY,
    JSON.stringify(documents)
  );
  debugFlow("Documents locaux sauvegardés", {
    keyCode: activeKeyCode,
    count: documents.length,
    documentIds: documents.map((document) => document.id)
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
