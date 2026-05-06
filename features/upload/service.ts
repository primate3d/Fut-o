import type { UploadedDocument } from "@/types";
import { ExpenseCategory } from "@/types";

export async function uploadDocumentStub(file: File): Promise<UploadedDocument> {
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    documentType: "other",
    detectedCategory: ExpenseCategory.OTHER,
    status: "ready",
    uploadedAt: new Date().toISOString()
  };
}

export async function extractTextWithOcrStub(_documentId: string): Promise<string> {
  return "";
}
