import type { UploadedDocument } from "@/types";

export function partitionDocumentsForAnalysis(documents: UploadedDocument[]) {
  return {
    usableDocuments: documents.filter((document) => document.status === "ready"),
    skippedDocuments: documents.filter((document) => document.status !== "ready")
  };
}

export function getAnalysisStartMessage(usableCount: number, skippedCount: number) {
  if (usableCount === 0) {
    return "Aucun document utilisable. Consultez la raison indiquée sous chaque document à revoir.";
  }

  if (skippedCount > 0) {
    return `Analyse en cours avec ${usableCount} document(s) utilisable(s). ${skippedCount} document(s) à revoir ne seront pas pris en compte pour le moment.`;
  }

  return `Analyse en cours avec ${usableCount} document(s).`;
}
