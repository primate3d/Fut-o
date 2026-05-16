import { ACCESS_KEY_STORAGE_KEY, getStoredAccessKey } from "@/features/billing/access-keys";
import { MOCK_ANALYSIS_STORAGE_KEY } from "@/features/analysis/storage";
import { UPLOADED_DOCUMENTS_STORAGE_KEY } from "@/features/upload/storage";

/**
 * Supprime uniquement les fichiers sources importés.
 * L'analyse et les courriers restent disponibles.
 */
export async function purgeSourceDocuments() {
  if (typeof window === "undefined") return;

  const activeKey = getStoredAccessKey();
  if (activeKey) {
    try {
      await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activeKey.code, purge: true })
      });
    } catch (error) {
      console.error("Erreur purge serveur:", error);
    }
  }

  window.localStorage.removeItem(UPLOADED_DOCUMENTS_STORAGE_KEY);

  // On nettoie aussi la référence dans l'analyse pour la cohérence
  const storedAnalysis = window.localStorage.getItem(MOCK_ANALYSIS_STORAGE_KEY);
  if (storedAnalysis) {
    try {
      const analysis = JSON.parse(storedAnalysis);
      analysis.documents = [];
      window.localStorage.setItem(MOCK_ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
    } catch (e) {
      console.error("Erreur lors de la purge des documents dans l'analyse", e);
    }
  }
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
      await fetch(`/api/analyse?code=${encodeURIComponent(activeKey.code)}`, {
        method: "DELETE"
      });
    } catch (error) {
      console.error("Erreur suppression analyse serveur:", error);
    }
  }

  window.localStorage.removeItem(UPLOADED_DOCUMENTS_STORAGE_KEY);
  window.localStorage.removeItem(MOCK_ANALYSIS_STORAGE_KEY);
}

/**
 * Supprime tout, y compris la clé d'accès.
 */
export async function purgeAllSessionData() {
  if (typeof window === "undefined") return;
  await purgeFullAudit();
  window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
}