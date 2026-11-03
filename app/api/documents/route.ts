import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  hasValidAccessExpiration,
  hasLockedHouseholdProfile,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  requiresHouseholdProfile
} from "@/features/billing/access-keys";
import {
  deleteAnalysisByKey,
  findKeyByCode,
  getDocumentsByKey,
  saveDocuments
} from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { withKeyLock } from "@/lib/server/key-lock";
import { RequestError } from "@/lib/server/request-error";
import { readLimitedBody, validateUpload } from "@/lib/server/document-validation";
import { MAX_UPLOAD_SIZE_BYTES } from "@/features/upload/document-types";
import type { UploadedDocument } from "@/types";
import { readAccessKeyHeader } from "@/lib/access-key-transport";

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
};

const replacementStatusPrefix = "replacement:";
const replacementBatchIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function replacementStatus(batchId: string) {
  return `${replacementStatusPrefix}${batchId}`;
}

function isReplacementDocument(document: StoredUploadedDocument) {
  return String(document.status).startsWith(replacementStatusPrefix);
}

function physicalFileNameFor(document: StoredUploadedDocument) {
  return document.physicalFileName || `${document.id}.pdf`;
}

async function deleteFilesAfterCommit(documents: StoredUploadedDocument[]) {
  await Promise.all(
    documents.map((document) =>
      storage.delete(physicalFileNameFor(document)).catch(() => {
        console.error("Nettoyage de fichier document a reprendre");
      })
    )
  );
}

export async function GET(request: Request) {
  const code = readAccessKeyHeader(request);

  if (!code) {
    return NextResponse.json({ error: "Code clé manquant" }, { status: 400 });
  }

  if (isBlockedProductionAdminCode(code)) {
    return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
  }

  const key = (await findKeyByCode(code)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
  if (!key) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
  }

  if (!key.isActive) {
    return NextResponse.json({ error: "Cle non active" }, { status: 403 });
  }

  if (!hasValidAccessExpiration(key)) {
    return NextResponse.json({ error: "Clé expirée", expired: true }, { status: 403 });
  }

  const documents = (await getDocumentsByKey(code) as StoredUploadedDocument[])
    .filter((document) => !isReplacementDocument(document));
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  let createdFile: string | undefined;
  let replacedFile: string | undefined;
  let committed = false;
  try {
    const bytes = await readLimitedBody(request, MAX_UPLOAD_SIZE_BYTES + 64 * 1024);
    const formData = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const rawCode = formData.get("code");
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    const rawReplacementBatchId = formData.get("replacementBatchId");
    const replacementBatchId = typeof rawReplacementBatchId === "string"
      ? rawReplacementBatchId.trim()
      : "";
    const documentJson = formData.get("document");
    const file = formData.get("file");

    if (!code || typeof documentJson !== "string" || !(file instanceof File)) {
      return NextResponse.json({ error: "Données d'upload manquantes" }, { status: 400 });
    }

    if (replacementBatchId && !replacementBatchIdPattern.test(replacementBatchId)) {
      return NextResponse.json({ error: "Lot de remplacement invalide" }, { status: 400 });
    }

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    const { document, buffer, extension } = await validateUpload(file, JSON.parse(documentJson));

    const response = await withKeyLock(`key:${code}`, async (tx) => {
    const key = (await findKeyByCode(code, tx)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
    }

    if (!key.isActive) {
      return NextResponse.json({ error: "Clé non active" }, { status: 403 });
    }

    if (!hasValidAccessExpiration(key)) {
      return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
    }

    if (requiresHouseholdProfile(key.plan) && !hasLockedHouseholdProfile(key)) {
      return NextResponse.json(
        { error: "Configurez le profil de votre foyer avant d'ajouter un document." },
        { status: 403 }
      );
    }

    const currentDocs = (await getDocumentsByKey(code, tx)) as StoredUploadedDocument[];
    const duplicateCandidates = currentDocs.filter((item) => {
      if (item.id === document.id || item.fileSize !== buffer.length) return false;
      return replacementBatchId
        ? String(item.status) === replacementStatus(replacementBatchId)
        : item.status === "ready";
    });
    for (const candidate of duplicateCandidates) {
      const existingBuffer = await storage.get(physicalFileNameFor(candidate));
      if (existingBuffer?.equals(buffer)) {
        throw new RequestError("Ce document est deja present dans cet audit", 409);
      }
    }

    const physicalFileName = crypto.randomUUID() + extension;
    await storage.put(physicalFileName, buffer);
    createdFile = physicalFileName;

    const updatedDocument: StoredUploadedDocument = {
      ...document,
      status: (replacementBatchId
        ? replacementStatus(replacementBatchId)
        : "ready") as UploadedDocument["status"],
      physicalFileName
    };

    const index = currentDocs.findIndex((item) => item.id === document.id);
    const updatedDocs = [...currentDocs];

    if (
      replacementBatchId &&
      index >= 0 &&
      String(currentDocs[index].status) !== replacementStatus(replacementBatchId)
    ) {
      throw new RequestError("Identifiant de document deja utilise", 409);
    }

    if (index >= 0) {
      const oldDoc = currentDocs[index];
      if (oldDoc.physicalFileName && oldDoc.physicalFileName !== physicalFileName) {
        replacedFile = oldDoc.physicalFileName;
      }
      updatedDocs[index] = updatedDocument;
    } else {
      updatedDocs.push(updatedDocument);
    }

    await saveDocuments(code, updatedDocs, tx);

    return NextResponse.json({ success: true, document: updatedDocument });
    });
    committed = true;
    if (replacedFile) {
      await storage.delete(replacedFile).catch(() => console.error("Nettoyage ancien fichier a reprendre"));
    }
    return response;
  } catch (error) {
    if (createdFile && !committed) await storage.delete(createdFile).catch(() => console.error("Nettoyage upload a reprendre"));
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError || error instanceof TypeError) return NextResponse.json({ error: "Requete upload invalide" }, { status: 400 });
    console.error("Erreur upload API");
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      documentId?: string;
      purge?: boolean;
      clearRecords?: boolean;
      replacementAction?: "commit" | "rollback";
      replacementBatchId?: string;
      replacementDocumentIds?: string[];
    };
    const {
      documentId,
      purge,
      clearRecords,
      replacementAction,
      replacementBatchId,
      replacementDocumentIds
    } = body;
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    if (
      replacementAction !== undefined &&
      replacementAction !== "commit" &&
      replacementAction !== "rollback"
    ) {
      return NextResponse.json({ error: "Action de remplacement invalide" }, { status: 400 });
    }

    if (replacementAction) {
      if (!replacementBatchId || !replacementBatchIdPattern.test(replacementBatchId)) {
        return NextResponse.json({ error: "Lot de remplacement invalide" }, { status: 400 });
      }

      let filesToDelete: StoredUploadedDocument[] = [];
      const response = await withKeyLock(`key:${code}`, async (tx) => {
        const key = (await findKeyByCode(code, tx)) ??
          (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
        if (!key) {
          return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
        }
        if (!key.isActive) {
          return NextResponse.json({ error: "Clé non active" }, { status: 403 });
        }
        if (!hasValidAccessExpiration(key)) {
          return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
        }

        const currentDocs = (await getDocumentsByKey(code, tx)) as StoredUploadedDocument[];
        const expectedStatus = replacementStatus(replacementBatchId);
        const replacementDocs = currentDocs.filter(
          (document) => String(document.status) === expectedStatus
        );

        if (replacementAction === "rollback") {
          if (replacementDocs.length === 0) {
            return NextResponse.json(
              { error: "Lot de remplacement introuvable" },
              { status: 409 }
            );
          }
          await saveDocuments(
            code,
            currentDocs.filter((document) => String(document.status) !== expectedStatus),
            tx
          );
          filesToDelete = replacementDocs;
          return NextResponse.json({ success: true, rolledBack: true });
        }

        const requestedIds = Array.isArray(replacementDocumentIds)
          ? replacementDocumentIds
          : [];
        const uniqueRequestedIds = new Set(requestedIds);
        const actualIds = new Set(replacementDocs.map((document) => document.id));
        const isExactReplacement =
          requestedIds.length > 0 &&
          uniqueRequestedIds.size === requestedIds.length &&
          actualIds.size === uniqueRequestedIds.size &&
          [...actualIds].every((id) => uniqueRequestedIds.has(id));

        if (!isExactReplacement) {
          return NextResponse.json(
            { error: "Lot de remplacement incomplet" },
            { status: 409 }
          );
        }
        for (const document of replacementDocs) {
          if (!(await storage.get(physicalFileNameFor(document)))) {
            return NextResponse.json(
              { error: "Fichier prepare indisponible" },
              { status: 409 }
            );
          }
        }

        const committedDocuments = replacementDocs.map((document) => ({
          ...document,
          status: "ready" as const
        }));
        filesToDelete = currentDocs.filter(
          (document) => String(document.status) !== expectedStatus
        );
        await saveDocuments(code, committedDocuments, tx);
        await deleteAnalysisByKey(code, tx);

        return NextResponse.json({ success: true, documents: committedDocuments });
      });

      if (response.ok) {
        await deleteFilesAfterCommit(filesToDelete);
      }
      return response;
    }

    return await withKeyLock(`key:${code}`, async (tx) => {
    const key = (await findKeyByCode(code, tx)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
    }

    if (!hasValidAccessExpiration(key) && !purge) {
      return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
    }

    if (purge) {
      const docs = (await getDocumentsByKey(code, tx)) as StoredUploadedDocument[];
      for (const doc of docs) {
        const physicalFileName = doc.physicalFileName || `${code}_${doc.id}_${doc.fileName}`;
        await storage.delete(physicalFileName);
      }
      await saveDocuments(
        code,
        clearRecords ? [] : docs.map((document) => ({ ...document, status: "purged" })), tx
      );
      return NextResponse.json({ success: true, purged: true });
    }

    if (!documentId) {
      return NextResponse.json({ error: "ID document manquant" }, { status: 400 });
    }

    const currentDocs = (await getDocumentsByKey(code, tx)) as StoredUploadedDocument[];
    const docToDelete = currentDocs.find((item) => item.id === documentId);

    if (docToDelete) {
      const updatedDocs = currentDocs.filter((item) => item.id !== documentId);
      await saveDocuments(code, updatedDocs, tx);
      const physicalFileName =
        docToDelete.physicalFileName || `${code}_${docToDelete.id}_${docToDelete.fileName}`;
      await storage.delete(physicalFileName);
    }

    return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erreur DELETE document");
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
