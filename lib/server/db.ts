import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "./db/index";
import { accessKeys, analyses, documents, freeTrials, orders } from "./db/schema";
import { ExpenseCategory } from "@/types";
import { hasValidAccessExpiration } from "@/features/billing/access-keys";
import { storage } from "./storage";
import { withKeyLock, type DatabaseExecutor } from "./key-lock";
import { RequestError } from "./request-error";
import type {
  AccessKey,
  AnalysisAnomaly,
  DetectedParties,
  Expense,
  MockAnalysis as Analysis,
  Recommendation,
  UploadedDocument,
  UploadedDocumentType
} from "@/types";

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
};

export type OrderData = {
  sessionId?: string;
  planId?: string;
  planName?: string;
  status?: string;
  key?: AccessKey;
  generatedKey?: string | null;
  paidAt?: string | null;
  completedAt?: string | null;
  customerEmail?: string | null;
  emailSent?: boolean;
  emailSentAt?: string | null;
  createdAt?: string;
};

export type OrderRecord = OrderData & {
  id: string;
};

export type FreeTrialRecord = {
  id: string;
  email: string;
  keyCode: string;
  usedAt: string;
  createdAt: string;
};

export async function getKeys(): Promise<AccessKey[]> {
  const records = await db.select().from(accessKeys);
  return records.map((record) => ({
    ...record,
    activatedAt: record.activatedAt ?? undefined,
    plan: record.plan as AccessKey["plan"],
    expiresAt: record.expiresAt || ""
  }));
}

export async function saveKey(
  key: AccessKey,
  executor: DatabaseExecutor = db
): Promise<void> {
  await executor
    .insert(accessKeys)
    .values({
      id: key.id,
      code: key.code,
      plan: key.plan,
      usesRemaining: key.usesRemaining,
      expiresAt: key.expiresAt || null,
      isActive: key.isActive,
      createdAt: key.createdAt,
      allowedNames: key.allowedNames ?? null,
      profilePostalAddress: key.profilePostalAddress ?? null,
      profileLockedAt: key.profileLockedAt ?? null
    })
    .onConflictDoUpdate({
      target: accessKeys.code,
      set: {
        plan: key.plan,
        usesRemaining: key.usesRemaining,
        isActive: key.isActive,
        allowedNames: key.allowedNames ?? null,
        profilePostalAddress: key.profilePostalAddress ?? null,
        profileLockedAt: key.profileLockedAt ?? null
      }
    });
}

export async function insertKeyIfAbsent(
  key: AccessKey,
  executor: DatabaseExecutor = db
) {
  const inserted = await executor
    .insert(accessKeys)
    .values({
      id: key.id,
      code: key.code,
      plan: key.plan,
      usesRemaining: key.usesRemaining,
      expiresAt: key.expiresAt || null,
      isActive: key.isActive,
      createdAt: key.createdAt,
      allowedNames: key.allowedNames ?? null,
      profilePostalAddress: key.profilePostalAddress ?? null,
      profileLockedAt: key.profileLockedAt ?? null
    })
    .onConflictDoNothing()
    .returning({ code: accessKeys.code });

  return inserted.length === 1;
}

export async function lockAccessKeyProfile(
  code: string,
  allowedNames: string[],
  profilePostalAddress: string
): Promise<AccessKey | undefined> {
  await db
    .update(accessKeys)
    .set({
      allowedNames,
      profilePostalAddress,
      profileLockedAt: new Date().toISOString()
    })
    .where(eq(accessKeys.code, code.trim().toUpperCase()));

  return findKeyByCode(code);
}

export async function findKeyByCode(code: string, executor: DatabaseExecutor = db): Promise<AccessKey | undefined> {
  const records = await executor
    .select()
    .from(accessKeys)
    .where(eq(accessKeys.code, code.trim().toUpperCase()));

  if (records.length === 0) return undefined;
  const record = records[0];

  return {
    ...record,
    activatedAt: record.activatedAt ?? undefined,
    plan: record.plan as AccessKey["plan"],
    expiresAt: record.expiresAt || ""
  };
}

export async function findFreeTrialByEmail(email: string): Promise<FreeTrialRecord | undefined> {
  const normalizedEmail = email.trim().toLowerCase();
  const records = await db
    .select()
    .from(freeTrials)
    .where(eq(freeTrials.email, normalizedEmail));

  return records[0];
}

export async function activateStoredKey(code: string): Promise<AccessKey> {
  code = code.trim().toUpperCase();
  return withKeyLock(`key:${code}`, async (tx) => {
    const key = await findKeyByCode(code, tx);
    if (!key || !key.isActive || !hasValidAccessExpiration(key)) {
      throw new RequestError("Cle inactive ou expiree", 403);
    }
    await tx.update(accessKeys).set({
      activatedAt: sql`coalesce(${accessKeys.activatedAt}, ${new Date().toISOString()})`
    }).where(eq(accessKeys.code, code));
    return (await findKeyByCode(code, tx))!;
  });
}

export async function consumeAnalysisCredit(code: string, executor: DatabaseExecutor) {
  const updated = await executor.update(accessKeys).set({
    usesRemaining: sql`${accessKeys.usesRemaining} - 1`
  }).where(and(eq(accessKeys.code, code), sql`${accessKeys.usesRemaining} > 0`)).returning();
  if (!updated.length) throw new RequestError("Quota epuise", 403);
  return updated[0].usesRemaining;
}

export async function findFreeTrialByKeyCode(keyCode: string): Promise<FreeTrialRecord | undefined> {
  const records = await db
    .select()
    .from(freeTrials)
    .where(eq(freeTrials.keyCode, keyCode.trim().toUpperCase()));

  return records[0];
}

export async function saveFreeTrial(record: FreeTrialRecord): Promise<void> {
  await db.insert(freeTrials).values({
    ...record,
    email: record.email.trim().toLowerCase()
  });
}

export async function getDocumentsByKey(keyCode: string, executor: DatabaseExecutor = db): Promise<UploadedDocument[]> {
  const records = await executor
    .select()
    .from(documents)
    .where(eq(documents.keyCode, keyCode));

  return records.map((record) => ({
    id: record.id,
    fileName: record.fileName,
    physicalFileName: record.physicalFileName,
    fileSize: record.fileSize,
    mimeType: record.mimeType,
    documentType: record.documentType as UploadedDocumentType,
    detectedCategory: record.detectedCategory
      ? (record.detectedCategory as ExpenseCategory)
      : ExpenseCategory.OTHER,
    provider: record.provider || undefined,
    status: record.status as UploadedDocument["status"],
    uploadedAt: record.uploadedAt
  }));
}

export async function saveDocuments(keyCode: string, docs: UploadedDocument[], executor: DatabaseExecutor = db): Promise<void> {
  const existingDocs = await getDocumentsByKey(keyCode, executor);
  const newIds = docs.map((document) => document.id);
  const idsToDelete = existingDocs
    .filter((document) => !newIds.includes(document.id))
    .map((document) => document.id);

  if (idsToDelete.length > 0) {
    await executor.delete(documents).where(and(eq(documents.keyCode, keyCode), inArray(documents.id, idsToDelete)));
  }

  for (const doc of docs as StoredUploadedDocument[]) {
    const saved = await executor
      .insert(documents)
      .values({
        id: doc.id,
        keyCode,
        fileName: doc.fileName,
        physicalFileName: doc.physicalFileName || `${doc.id}.pdf`,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        documentType: doc.documentType,
        detectedCategory: doc.detectedCategory || null,
        provider: doc.provider || null,
        status: doc.status,
        uploadedAt: doc.uploadedAt
      })
      .onConflictDoUpdate({
        target: documents.id,
        set: {
          fileName: doc.fileName,
          physicalFileName: doc.physicalFileName || `${doc.id}.pdf`,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          documentType: doc.documentType,
          detectedCategory: doc.detectedCategory || null,
          provider: doc.provider || null,
          status: doc.status
        },
        setWhere: eq(documents.keyCode, keyCode)
      }).returning({ id: documents.id });
    if (!saved.length) throw new RequestError("Document non autorise", 403);
  }
}

export async function getAnalysisByKey(keyCode: string, executor: DatabaseExecutor = db): Promise<Analysis | null> {
  const records = await executor
    .select()
    .from(analyses)
    .where(eq(analyses.keyCode, keyCode));

  if (records.length === 0) return null;
  const record = records[0];

  return {
    id: record.id,
    generatedAt: record.generatedAt,
    documents: record.documentsData as UploadedDocument[],
    detectedParties: record.detectedParties as DetectedParties | undefined,
    expenses: record.expenses as Expense[],
    recommendations: record.recommendations as Recommendation[],
    anomalies: record.anomalies as AnalysisAnomaly[],
    totalMonthlyAmount: record.totalMonthlyAmount,
    totalYearlyAmount: record.totalYearlyAmount,
    yearlyPotentialSavings: record.yearlyPotentialSavings
  };
}

export async function saveAnalysis(keyCode: string, analysis: Analysis, executor: DatabaseExecutor = db): Promise<void> {
  await executor
    .insert(analyses)
    .values({
      id: analysis.id,
      keyCode,
      generatedAt: analysis.generatedAt,
      documentsData: analysis.documents,
      detectedParties: analysis.detectedParties || null,
      expenses: analysis.expenses,
      recommendations: analysis.recommendations,
      anomalies: analysis.anomalies,
      totalMonthlyAmount: analysis.totalMonthlyAmount,
      totalYearlyAmount: analysis.totalYearlyAmount,
      yearlyPotentialSavings: analysis.yearlyPotentialSavings
    })
    .onConflictDoUpdate({
      target: analyses.keyCode,
      set: {
        generatedAt: analysis.generatedAt,
        documentsData: analysis.documents,
        detectedParties: analysis.detectedParties || null,
        expenses: analysis.expenses,
        recommendations: analysis.recommendations,
        anomalies: analysis.anomalies,
        totalMonthlyAmount: analysis.totalMonthlyAmount,
        totalYearlyAmount: analysis.totalYearlyAmount,
        yearlyPotentialSavings: analysis.yearlyPotentialSavings
      }
    });
}

export async function saveOrder(
  sessionId: string,
  orderData: OrderData,
  executor: DatabaseExecutor = db
): Promise<void> {
  await executor
    .insert(orders)
    .values({
      id: sessionId,
      planId: orderData.planId || null,
      planName: orderData.planName || null,
      status: orderData.status || null,
      generatedKey: orderData.generatedKey || orderData.key?.code || null,
      completedAt: orderData.completedAt || orderData.paidAt || null,
      customerEmail: orderData.customerEmail || null,
      emailSent: orderData.emailSent || false,
      emailSentAt: orderData.emailSentAt || null,
      createdAt: orderData.createdAt || new Date().toISOString()
    })
    .onConflictDoUpdate({
      target: orders.id,
      set: {
        status: orderData.status || null,
        generatedKey: orderData.generatedKey || orderData.key?.code || null,
        completedAt: orderData.completedAt || orderData.paidAt || null,
        customerEmail: orderData.customerEmail || null,
        emailSent: orderData.emailSent || false,
        emailSentAt: orderData.emailSentAt || null
      }
    });
}

export async function getOrderBySessionId(
  sessionId: string,
  executor: DatabaseExecutor = db
): Promise<OrderRecord | undefined> {
  const records = await executor.select().from(orders).where(eq(orders.id, sessionId));
  const record = records[0];
  if (!record) return undefined;

  return {
    id: record.id,
    planId: record.planId || undefined,
    planName: record.planName || undefined,
    status: record.status || undefined,
    generatedKey: record.generatedKey,
    completedAt: record.completedAt,
    customerEmail: record.customerEmail,
    emailSent: Boolean(record.emailSent),
    emailSentAt: record.emailSentAt,
    createdAt: record.createdAt || undefined,
    key: record.generatedKey
      ? {
        id: `key_${record.id}`,
        code: record.generatedKey,
        plan:
          record.planId === "simple" || record.planId === "premium"
            ? record.planId
            : "foyer",
        usesRemaining: 1,
        expiresAt: "",
        isActive: true,
        createdAt: record.createdAt || new Date().toISOString()
      }
      : undefined
  };
}

export async function getOrderByGeneratedKey(keyCode: string): Promise<OrderRecord | undefined> {
  const records = await db
    .select()
    .from(orders)
    .where(eq(orders.generatedKey, keyCode.trim().toUpperCase()));
  const record = records[0];
  if (!record) return undefined;

  return {
    id: record.id,
    planId: record.planId || undefined,
    planName: record.planName || undefined,
    status: record.status || undefined,
    generatedKey: record.generatedKey,
    completedAt: record.completedAt,
    customerEmail: record.customerEmail,
    emailSent: Boolean(record.emailSent),
    emailSentAt: record.emailSentAt,
    createdAt: record.createdAt || undefined,
    key: record.generatedKey
      ? {
        id: `key_${record.id}`,
        code: record.generatedKey,
        plan:
          record.planId === "simple" || record.planId === "premium"
            ? record.planId
            : "foyer",
        usesRemaining: 1,
        expiresAt: record.completedAt || "",
        isActive: record.status === "completed",
        createdAt: record.createdAt || record.completedAt || new Date().toISOString()
      }
      : undefined
  };
}

export async function deleteDocumentFile(physicalFileName: string) {
  await storage.delete(physicalFileName);
}

export async function purgeExpiredData(): Promise<void> {
  const now = new Date().toISOString();

  const expiredKeys = await db
    .select()
    .from(accessKeys)
    .where(and(lt(accessKeys.expiresAt, now), eq(accessKeys.isActive, true)));

  for (const key of expiredKeys) {
    try {
      await withKeyLock(`key:${key.code}`, async (tx) => {
    const current = await findKeyByCode(key.code, tx);
    if (!current?.expiresAt || Date.parse(current.expiresAt) > Date.now()) return;
    const docs = (await getDocumentsByKey(key.code, tx)) as StoredUploadedDocument[];
    for (const doc of docs) {
      await deleteDocumentFile(doc.physicalFileName || `${doc.id}.pdf`);
    }

    await tx.delete(documents).where(eq(documents.keyCode, key.code));
    await tx.delete(analyses).where(eq(analyses.keyCode, key.code));
    await tx.update(accessKeys).set({ isActive: false }).where(eq(accessKeys.code, key.code));
      });
    } catch (error) {
      if (!(error instanceof RequestError && error.status === 409)) throw error;
    }
  }
}

export async function deleteAnalysisByKey(keyCode: string, executor: DatabaseExecutor = db): Promise<void> {
  await executor.delete(analyses).where(eq(analyses.keyCode, keyCode));
}
