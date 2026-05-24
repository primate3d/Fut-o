import crypto from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  hasLockedHouseholdProfile,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  requiresHouseholdProfile
} from "@/features/billing/access-keys";
import { findKeyByCode, getDocumentsByKey, saveDocuments } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
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

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Clé expirée", expired: true }, { status: 403 });
  }

  const documents = await getDocumentsByKey(code);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const code = formData.get("code");
    const documentJson = formData.get("document");
    const file = formData.get("file");

    if (typeof code !== "string" || typeof documentJson !== "string" || !(file instanceof File)) {
      return NextResponse.json({ error: "Données d'upload manquantes" }, { status: 400 });
    }

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    const document = JSON.parse(documentJson) as UploadedDocument;

    const key = (await findKeyByCode(code)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
    }

    if (!key.isActive) {
      return NextResponse.json({ error: "Clé non active" }, { status: 403 });
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
    }

    if (requiresHouseholdProfile(key.plan) && !hasLockedHouseholdProfile(key)) {
      return NextResponse.json(
        { error: "Configurez le profil de votre foyer avant d'ajouter un document." },
        { status: 403 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = path.extname(file.name) || ".pdf";
    const physicalFileName = crypto.randomUUID() + extension;

    await storage.put(physicalFileName, buffer);

    const currentDocs = (await getDocumentsByKey(code)) as StoredUploadedDocument[];
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
        await storage.delete(oldDoc.physicalFileName);
      }
      updatedDocs[index] = updatedDocument;
    } else {
      updatedDocs.push(updatedDocument);
    }

    await saveDocuments(code, updatedDocs);

    return NextResponse.json({ success: true, document: updatedDocument });
  } catch (error) {
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
    const { code, documentId, purge, clearRecords } = body;

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    const key = (await findKeyByCode(code)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date() && !purge) {
      return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
    }

    if (purge) {
      const docs = (await getDocumentsByKey(code)) as StoredUploadedDocument[];
      for (const doc of docs) {
        const physicalFileName = doc.physicalFileName || `${code}_${doc.id}_${doc.fileName}`;
        await storage.delete(physicalFileName);
      }
      await saveDocuments(
        code,
        clearRecords ? [] : docs.map((document) => ({ ...document, status: "purged" }))
      );
      return NextResponse.json({ success: true, purged: true });
    }

    if (!documentId) {
      return NextResponse.json({ error: "ID document manquant" }, { status: 400 });
    }

    const currentDocs = (await getDocumentsByKey(code)) as StoredUploadedDocument[];
    const docToDelete = currentDocs.find((item) => item.id === documentId);

    if (docToDelete) {
      const updatedDocs = currentDocs.filter((item) => item.id !== documentId);
      await saveDocuments(code, updatedDocs);
      const physicalFileName =
        docToDelete.physicalFileName || `${code}_${docToDelete.id}_${docToDelete.fileName}`;
      await storage.delete(physicalFileName);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE document:", error);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
