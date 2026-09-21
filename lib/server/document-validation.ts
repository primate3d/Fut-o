import path from "node:path";
import { z } from "zod";
import { documentTypeOptions, getCategoryForDocumentType, MAX_UPLOAD_SIZE_BYTES } from "@/features/upload/document-types";
import type { UploadedDocument, UploadedDocumentType } from "@/types";
import { RequestError } from "./request-error";
import { validatePhysicalFileName } from "./storage";

const documentType = z.custom<UploadedDocumentType>((value) => documentTypeOptions.some((option) => option.value === value));
const corrections = z.object({
  provider: z.string().trim().max(200).optional(),
  documentType: documentType.optional(),
  amount: z.number().finite().nonnegative().max(1e9).optional(),
  frequency: z.enum(["monthly", "bimonthly", "quarterly", "yearly", "one_time", "schedule"]).optional(),
  isMultiContract: z.boolean().optional(),
  notes: z.string().max(2000).optional()
});
const metadata = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  documentType,
  provider: z.string().trim().max(200).optional()
});

export async function readLimitedBody(request: Request, maxBytes: number) {
  const declaredSize = Number(request.headers.get("content-length"));
  if (declaredSize > maxBytes) throw new RequestError("Requete trop volumineuse", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Corps de requete manquant");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError("Requete trop volumineuse", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function validateUpload(file: File, rawMetadata: unknown): Promise<{
  document: UploadedDocument; buffer: Buffer; extension: string;
}> {
  const parsed = metadata.safeParse(rawMetadata);
  if (!parsed.success) throw new RequestError("Metadonnees du document invalides");
  validatePhysicalFileName(file.name);
  if (!file.size || file.size > MAX_UPLOAD_SIZE_BYTES) throw new RequestError("Fichier vide ou superieur a 10 Mio", 413);
  const extension = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeByExtension: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".csv": "text/csv" };
  const mimeType = mimeByExtension[extension];
  const validSignature = extension === ".pdf" ? buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))
    : extension === ".png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : extension === ".jpg" || extension === ".jpeg" ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
    : extension === ".csv" && !buffer.includes(0) && !buffer.toString("utf8").includes("\ufffd");
  const declaredMime = file.type.toLowerCase();
  if (!mimeType || !validSignature || (declaredMime && declaredMime !== "application/octet-stream" && declaredMime !== mimeType && !(extension === ".csv" && declaredMime === "application/vnd.ms-excel"))) {
    throw new RequestError("Type ou contenu de fichier non autorise", 415);
  }
  return {
    buffer, extension,
    document: { ...parsed.data, fileName: file.name, mimeType, fileSize: buffer.length,
      detectedCategory: getCategoryForDocumentType(parsed.data.documentType), status: "ready", uploadedAt: new Date().toISOString() }
  };
}

export function selectOwnedDocuments(requested: unknown, stored: UploadedDocument[]) {
  if (!Array.isArray(requested) || !requested.length) throw new RequestError("Aucun document a analyser");
  const seen = new Set<string>();
  return requested.map((input) => {
    if (!input || typeof input.id !== "string" || seen.has(input.id)) throw new RequestError("Liste de documents invalide");
    seen.add(input.id);
    const document = stored.find((item) => item.id === input.id);
    const physicalFileName = (document as (UploadedDocument & { physicalFileName?: string }) | undefined)?.physicalFileName;
    if (!document || document.status !== "ready" || !physicalFileName) throw new RequestError("Document non autorise ou indisponible", 403);
    validatePhysicalFileName(physicalFileName);
    if (input.physicalFileName !== undefined && input.physicalFileName !== physicalFileName) throw new RequestError("Reference de fichier non autorisee", 403);
    const parsed = corrections.safeParse(input.userCorrections ?? {});
    if (!parsed.success) throw new RequestError("Corrections du document invalides");
    return { ...document, physicalFileName, userCorrections: parsed.data,
      provider: parsed.data.provider || document.provider,
      documentType: parsed.data.documentType || document.documentType };
  });
}
