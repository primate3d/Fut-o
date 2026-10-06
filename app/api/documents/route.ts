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
import { findKeyByCode, getDocumentsByKey, saveDocuments } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { withKeyLock } from "@/lib/server/key-lock";
import { RequestError } from "@/lib/server/request-error";
import { readLimitedBody, validateUpload } from "@/lib/server/document-validation";
import { MAX_UPLOAD_SIZE_BYTES } from "@/features/upload/document-types";
import type { UploadedDocument } from "@/types";

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

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

  const documents = await getDocumentsByKey(code);
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
    const documentJson = formData.get("document");
    const file = formData.get("file");

    if (!code || typeof documentJson !== "string" || !(file instanceof File)) {
      return NextResponse.json({ error: "Données d'upload manquantes" }, { status: 400 });
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

    const physicalFileName = crypto.randomUUID() + extension;

    await storage.put(physicalFileName, buffer);
    createdFile = physicalFileName;

    const currentDocs = (await getDocumentsByKey(code, tx)) as StoredUploadedDocument[];
    const updatedDocument: StoredUploadedDocument = {
      ...document,
      status: "ready",
      physicalFileName
    };

    const index = currentDocs.findIndex((item) => item.id === document.id);
    const updatedDocs = [...currentDocs];

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
    console.error("Erreur upload API:", error);
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
    };
    const { documentId, purge, clearRecords } = body;
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
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
    console.error("Erreur DELETE document:", error);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
