import { ACCESS_KEY_STORAGE_KEY, getStoredAccessKey } from "@/features/billing/access-keys";
import { MOCK_ANALYSIS_STORAGE_KEY, REPORT_PORTFOLIO_STORAGE_KEY } from "@/features/analysis/storage";
import {
  DOCUMENT_CORRECTIONS_STORAGE_KEY,
  UPLOADED_DOCUMENTS_STORAGE_KEY,
  getStoredUploadedDocuments,
  storeUploadedDocuments
} from "@/features/upload/storage";
import { SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY } from "@/features/recommendations/selected-offer";

function removeAuditLocalStorageResidues(activeKeyCode?: string) {
  const prefixesToRemove = ["futeo_savings_"];
  const exactKeysToRemove = [
    UPLOADED_DOCUMENTS_STORAGE_KEY,
    MOCK_ANALYSIS_STORAGE_KEY,
    SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY,
    DOCUMENT_CORRECTIONS_STORAGE_KEY,
    "futeo.uploadedDocumentsOwner",
    activeKeyCode
      ? `${REPORT_PORTFOLIO_STORAGE_KEY}.${activeKeyCode}`
      : `${REPORT_PORTFOLIO_STORAGE_KEY}.anonymous`
  ];

  exactKeysToRemove.forEach((key) => window.localStorage.removeItem(key));

  Object.keys(window.localStorage).forEach((key) => {
    if (prefixesToRemove.some((prefix) => key.startsWith(prefix))) {
      window.localStorage.removeItem(key);
    }
  });
}

/**
 * Supprime uniquement les fichiers sources importés.
 * L'analyse et les courriers restent disponibles.
 */
export async function purgeSourceDocuments() {
  if (typeof window === "undefined") return false;

  let serverPurged = true;

  const activeKey = getStoredAccessKey();
  if (activeKey) {
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activeKey.code, purge: true })
      });
      serverPurged = response.ok;
    } catch (error) {
      console.error("Erreur purge serveur:", error);
      serverPurged = false;
    }
  }

  storeUploadedDocuments(
    getStoredUploadedDocuments().map((document) => ({ ...document, status: "purged" }))
  );

  return serverPurged;
}

/**
 * Supprime l'intégralité des données du dossier (documents, analyse, courriers)
 * côté localStorage ET côté serveur (DB).
 */
export async function purgeFullAudit() {
  if (typeof window === "undefined") return;

  const activeKey = getStoredAccessKey();
  if (activeKey) {
    try {
      // 1. Suppression de l'analyse en DB
      await fetch(`/api/analyse?code=${encodeURIComponent(activeKey.code)}`, {
        method: "DELETE"
      });

      // 2. Suppression des documents en DB et des fichiers physiques
      await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activeKey.code, purge: true, clearRecords: true })
      });
    } catch (error) {
      console.error("Erreur suppression complète serveur:", error);
    }
  }

  removeAuditLocalStorageResidues(activeKey?.code);
}

/**
 * Recommence un audit avec la clé active conservée.
 * Le profil du foyer est lié à la clé côté serveur et n'est pas supprimé ici.
 */
export async function resetAuditDataForActiveKey() {
  if (typeof window === "undefined") return;
  await purgeFullAudit();
  window.sessionStorage.clear();
}

/**
 * Supprime tout, y compris la clé d'accès.
 */
export async function purgeAllSessionData() {
  if (typeof window === "undefined") return;
  await resetAuditDataForActiveKey();
  window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
}
