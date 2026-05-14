import { NextResponse } from "next/server";
import { getPlanLabel } from "@/features/billing/access-keys";
import { findKeyByCode } from "@/lib/server/db";
import type { AccessKey, UploadedDocument } from "@/types";

export const ADMIN_ACCESS_CODE = "ADMIN-DEV";

export class AccessControlError extends Error {
  constructor(
    message: string,
    public status = 403
  ) {
    super(message);
  }
}

export function isAdminAccessKey(key?: Pick<AccessKey, "code" | "isActive"> | null) {
  return key?.code.toUpperCase() === ADMIN_ACCESS_CODE && key.isActive;
}

export function getDocumentQuotaForPlan(plan?: AccessKey["plan"] | null) {
  switch (plan) {
    case "decouverte":
    case "simple":
      return 5;
    case "foyer":
      return 12;
    case "famille":
    case "premium":
      return 20;
    default:
      return null;
  }
}

export function countQuotaDocuments(documents: UploadedDocument[]) {
  return documents.filter((document) => document.status !== "error").length;
}

export function validateDocumentQuotaOrThrow(
  key: AccessKey,
  documents: UploadedDocument[],
  options?: { isAdmin?: boolean }
) {
  if (options?.isAdmin || isAdminAccessKey(key)) {
    return;
  }

  const quota = getDocumentQuotaForPlan(key.plan);
  if (!quota) {
    throw new AccessControlError("Formule inconnue : l'import est bloqué par sécurité.", 403);
  }

  const documentCount = countQuotaDocuments(documents);
  if (documentCount > quota) {
    throw new AccessControlError(
      `Votre formule ${getPlanLabel(key.plan)} permet d'analyser jusqu'à ${quota} documents. Supprimez un document ou choisissez une formule supérieure.`,
      403
    );
  }
}

export async function validateAccessOrThrow(code?: string | null) {
  const normalizedCode = code?.trim().toUpperCase();

  if (!normalizedCode) {
    throw new AccessControlError("Code d'accès manquant", 401);
  }

  const key = await findKeyByCode(normalizedCode);

  if (!key) {
    throw new AccessControlError("Clé invalide", 403);
  }

  if (isAdminAccessKey(key)) {
    return { key, isAdmin: true };
  }

  if (!key.isActive || key.usesRemaining <= 0) {
    throw new AccessControlError("Clé inactive ou quota épuisé", 403);
  }

  if (!key.activatedAt) {
    throw new AccessControlError("Clé non activée", 403);
  }

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    throw new AccessControlError("Clé expirée", 403);
  }

  return { key, isAdmin: false };
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessControlError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  throw error;
}
