import { NextResponse } from "next/server";
import { findKeyByCode, getAnalysisByKey, saveAnalysis, saveKey, deleteAnalysisByKey } from "@/lib/server/db";
import { analyzeDocumentsWithAI } from "@/features/analysis/ai-service";
import {
  createAdminAccessKey,
  hasLockedHouseholdProfile,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  isAuditFoyerPlan,
  requiresHouseholdProfile,
  validateAuditFoyerDocuments
} from "@/features/billing/access-keys";
import { mockAccessKeys } from "@/data/mock";
import { allowDevOnlyMocks, env } from "@/lib/env";
import { logger, withLatency } from "@/lib/server/logger";
import { extractTextFromDocument } from "@/lib/server/ocr";
import { storage } from "@/lib/server/storage";
import type { AccessKey, MockAnalysis, UploadedDocument } from "@/types";

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
  extractedText?: string;
};

type ExtractedUploadedDocument = StoredUploadedDocument & {
  extractedText: string;
};

function isAnalysisForDocuments(analysis: MockAnalysis, documents: UploadedDocument[]) {
  const currentDocumentIds = documents
    .filter((document) => document.status !== "error")
    .map((document) => document.id)
    .sort();
  const analysisDocumentIds = analysis.documents
    .map((document) => document.id)
    .sort();

  return (
    currentDocumentIds.length > 0 &&
    currentDocumentIds.length === analysisDocumentIds.length &&
    currentDocumentIds.every((documentId, index) => documentId === analysisDocumentIds[index])
  );
}

function isNonEmptyAnalysis(analysis: MockAnalysis | null) {
  if (!analysis) {
    return false;
  }

  const hasExpenses = analysis.expenses.some((expense) => {
    const monthlyAmount = Number(expense.monthlyAmount);
    const yearlyAmount = Number(expense.yearlyAmount);
    return (
      (Number.isFinite(monthlyAmount) && monthlyAmount > 0) ||
      (Number.isFinite(yearlyAmount) && yearlyAmount > 0)
    );
  });
  const hasMonthlyAmount = analysis.totalMonthlyAmount > 0;

  return hasExpenses || hasMonthlyAmount;
}

function getPhysicalFileName(keyCode: string, document: UploadedDocument) {
  const storedDocument = document as StoredUploadedDocument;
  return storedDocument.physicalFileName || `${keyCode}_${document.id}_${document.fileName}`;
}

function getLocalAnalysisAccessKey(code: string): AccessKey | undefined {
  if (!allowDevOnlyMocks()) {
    return undefined;
  }

  if (code.trim().toUpperCase() !== "TEST-PREMIUM") {
    return undefined;
  }

  const mockKey = mockAccessKeys.find(
    (key) => key.code.toUpperCase() === code.trim().toUpperCase()
  );

  return mockKey ? { ...mockKey } : undefined;
}

function isVirtualAnalysisAccessKey(code: string) {
  return isAdminAccessCode(code) || Boolean(getLocalAnalysisAccessKey(code));
}

type ExtractionDiagnostic = {
  id: string;
  name: string;
  physicalFileName: string;
  fullPath: string;
  mimeType: string;
  fileExists: boolean;
  fileSizeBytes: number;
  textLength: number;
};

function normalizeHouseholdName(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateAnalysisAgainstHouseholdProfile(key: AccessKey, analysis: MockAnalysis) {
  const allowedNames = (key.allowedNames ?? []).map(normalizeHouseholdName).filter(Boolean);
  const customers = [
    analysis.detectedParties?.customer,
    ...Object.values(analysis.detectedParties?.documents ?? {}).map((document) => document.customer)
  ].filter(Boolean);
  const extractedNames = customers
    .map((customer) => customer?.fullName || customer?.lastName || "")
    .filter(Boolean);
  const matches = extractedNames.map(normalizeHouseholdName).some((extractedName) =>
    allowedNames.some((allowedName) => ` ${extractedName} `.includes(` ${allowedName} `))
  );

  return {
    matches,
    extractedName: extractedNames[0] ?? "Nom non detecte",
    profileName: (key.allowedNames ?? []).join(" / ")
  };
}

function applyProfileAddressFallback(key: AccessKey, analysis: MockAnalysis) {
  if (!key.profilePostalAddress || !analysis.detectedParties) return;

  const firstDocumentCustomer = Object.values(analysis.detectedParties.documents ?? {}).find(
    (document) => document.customer
  )?.customer;
  analysis.detectedParties.customer = {
    ...(firstDocumentCustomer ?? {}),
    ...(analysis.detectedParties.customer ?? {}),
    address:
      analysis.detectedParties.customer?.address ||
      firstDocumentCustomer?.address ||
      key.profilePostalAddress
  };
}

export async function POST(request: Request) {
  try {
    const { documents, code, force } = (await request.json()) as {
      documents?: UploadedDocument[];
      code?: string;
      force?: boolean;
    };

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    if (!code) {
      return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
    }

    // 1. Validation de la clé
    const key =
      getLocalAnalysisAccessKey(code) ??
      (await findKeyByCode(code)) ??
      (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
    }

    if (!key.isActive || key.usesRemaining <= 0) {
      return NextResponse.json({ error: "Quota épuisé ou clé non active" }, { status: 403 });
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
    }

    if (requiresHouseholdProfile(key.plan) && !hasLockedHouseholdProfile(key)) {
      return NextResponse.json(
        { error: "Configurez le profil de votre foyer avant de lancer une analyse." },
        { status: 403 }
      );
    }

    if (documents) {
      if (key.plan === "decouverte" && documents.length > 1) {
        return NextResponse.json(
          { error: "L'accès Découverte est limité à 1 document maximum." },
          { status: 403 }
        );
      }

      if (isAuditFoyerPlan(key.plan)) {
        const validation = validateAuditFoyerDocuments(key.plan, documents);
        if (!validation.isValid) {
          return NextResponse.json(
            { error: validation.message || "Limite de documents dépassée pour ce plan." },
            { status: 403 }
          );
        }
      }
    }

    // 2. Vérification du cache
    const existingAnalysis = await getAnalysisByKey(code);
    if (
      !force &&
      !requiresHouseholdProfile(key.plan) &&
      existingAnalysis &&
      documents &&
      isNonEmptyAnalysis(existingAnalysis) &&
      isAnalysisForDocuments(existingAnalysis, documents)
    ) {
      return NextResponse.json({ analysis: existingAnalysis, cached: true });
    }

    // 3. Extraction de texte (OCR) et appel à l'IA
    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: "Aucun document à analyser" }, { status: 400 });
    }

    const documentsWithContent: ExtractedUploadedDocument[] = [];
    const extractionDiagnostics: ExtractionDiagnostic[] = [];

    for (const doc of documents) {
      const physicalFileName = getPhysicalFileName(code, doc);
      const buffer = await storage.get(physicalFileName);
      const diagnostic: ExtractionDiagnostic = {
        id: doc.id,
        name: doc.fileName,
        physicalFileName,
        fullPath: `${env.UPLOADS_DIR}/${physicalFileName}`,
        mimeType: doc.mimeType,
        fileExists: Boolean(buffer),
        fileSizeBytes: buffer?.length ?? 0,
        textLength: 0
      };

      logger.info("Diagnostic document avant extraction", {
        service: "Analysis",
        action: "document_before_extraction",
        keyCode: code,
        metadata: diagnostic
      });

      let text = "";
      try {
        text = await extractTextFromDocument(code, doc);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur extraction inconnue";
        logger.error("Exception pendant extractTextFromDocument", {
          service: "Analysis",
          action: "document_extraction_exception",
          keyCode: code,
          metadata: { id: doc.id, physicalFileName, error: message }
        });
        return NextResponse.json(
          { error: "Extraction texte impossible", details: message },
          { status: 422 }
        );
      }

      diagnostic.textLength = text.length;
      extractionDiagnostics.push(diagnostic);

      logger.info("Diagnostic document après extraction", {
        service: "Analysis",
        action: "document_after_extraction",
        keyCode: code,
        metadata: diagnostic
      });

      documentsWithContent.push({ ...doc, physicalFileName, extractedText: text });
    }

    const hasExtractedText = documentsWithContent.some((doc) => doc.extractedText?.trim());

    if (!hasExtractedText) {
      logger.error("Analyse stoppée: extraction texte vide", {
        service: "Analysis",
        action: "empty_extraction_blocked",
        keyCode: code,
        metadata: {
          documents: documentsWithContent.map((doc) => ({
            id: doc.id,
            name: doc.fileName,
            physicalFileName: doc.physicalFileName,
            mimeType: doc.mimeType,
            textLength: doc.extractedText?.length ?? 0
          }))
        }
      });
      return NextResponse.json(
        {
          error: "Extraction texte vide: analyse IA non lancée et aucune sauvegarde effectuée",
          diagnostics: extractionDiagnostics
        },
        { status: 422 }
      );
    }

    logger.info("Texte transmis à l'IA", {
      service: "Analysis",
      action: "ai_input_ready",
      keyCode: code,
      metadata: {
        documents: documentsWithContent.map((doc) => ({
          id: doc.id,
          textLength: doc.extractedText?.length ?? 0
        }))
      }
    });

    const { result: analysis, latencyMs } = await withLatency(async () => {
      return analyzeDocumentsWithAI(documentsWithContent, code);
    });

    logger.info("Diagnostic analyse après IA", {
      service: "Analysis",
      action: "analysis_after_ai",
      keyCode: code,
      metadata: {
        expensesCount: analysis.expenses.length,
        documents: Object.values(analysis.detectedParties?.documents ?? {}).map((document) => ({
          documentId: document.documentId,
          providerName: document.providerName,
          invoiceAmount: document.invoiceAmount,
          documentType: document.documentType
        }))
      }
    });

    if (!isNonEmptyAnalysis(analysis)) {
      logger.error("Analyse vide non sauvegardée", {
        service: "Analysis",
        action: "empty_analysis_blocked",
        keyCode: code,
        metadata: {
          expensesLength: analysis.expenses.length,
          totalMonthlyAmount: analysis.totalMonthlyAmount,
          documentTextLengths: analysis.documents.map((doc) => {
            const extractedText = "extractedText" in doc ? doc.extractedText : undefined;
            return typeof extractedText === "string" ? extractedText.length : 0;
          })
        }
      });
      return NextResponse.json(
        { error: "Analyse vide: sauvegarde refusée" },
        { status: 422 }
      );
    }

    if (requiresHouseholdProfile(key.plan)) {
      const compliance = validateAnalysisAgainstHouseholdProfile(key, analysis);
      if (!compliance.matches) {
        return NextResponse.json(
          {
            error: "Document non conforme au foyer configure.",
            code: "HOUSEHOLD_NAME_MISMATCH",
            extractedName: compliance.extractedName,
            profileName: compliance.profileName
          },
          { status: 403 }
        );
      }
      applyProfileAddressFallback(key, analysis);
    }

    // 4. Persistance serveur
    await saveAnalysis(code, analysis);

    // 5. Décrémenter le quota
    const updatedKey = isVirtualAnalysisAccessKey(key.code)
      ? key
      : { ...key, usesRemaining: key.usesRemaining - 1 };

    if (!isVirtualAnalysisAccessKey(key.code)) {
      await saveKey(updatedKey);
    }

    logger.info("Analyse IA terminée avec succès", {
      service: "Analysis",
      action: "ai_success",
      keyCode: code,
      latencyMs,
      metadata: { docCount: documents.length, usesRemaining: updatedKey.usesRemaining }
    });

    return NextResponse.json({ analysis, cached: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Une erreur est survenue lors de l'analyse IA";
    logger.error("Erreur critique lors de l'analyse IA", {
      service: "Analysis",
      action: "ai_error",
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Récupère l'analyse existante sans la recalculer
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  if (isBlockedProductionAdminCode(code)) {
    return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
  }

  const key =
    getLocalAnalysisAccessKey(code) ??
    (await findKeyByCode(code)) ??
    (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
  if (!key || !key.isActive) {
    return NextResponse.json({ error: "Cle invalide ou inactive" }, { status: 403 });
  }

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Cle expiree", expired: true }, { status: 403 });
  }

  const analysis = await getAnalysisByKey(code);
  if (!analysis) {
    return NextResponse.json({ error: "Aucune analyse trouvée" }, { status: 404 });
  }

  return NextResponse.json({ analysis });
}

/**
 * Supprime l'analyse en base pour forcer une nouvelle extraction au prochain appel
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  if (isBlockedProductionAdminCode(code)) {
    return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
  }

  const key =
    (await findKeyByCode(code)) ??
    (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);
  if (!key) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
  }

  if (!key.isActive) {
    return NextResponse.json({ error: "Cle non active" }, { status: 403 });
  }

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Cle expiree", expired: true }, { status: 403 });
  }

  await deleteAnalysisByKey(code);
  return NextResponse.json({ success: true });
}
