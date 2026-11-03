import { NextResponse } from "next/server";
import { findKeyByCode, getAnalysisByKey, saveAnalysis, consumeAnalysisCredit, deleteAnalysisByKey, getDocumentsByKey } from "@/lib/server/db";
import { withKeyLock } from "@/lib/server/key-lock";
import { RequestError } from "@/lib/server/request-error";
import { readLimitedBody, selectOwnedDocuments } from "@/lib/server/document-validation";
import { analyzeDocumentsWithAI } from "@/features/analysis/ai-service";
import {
  createAdminAccessKey,
  hasValidAccessExpiration,
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
import { readAccessKeyHeader } from "@/lib/access-key-transport";
import {
  applyMobileContractPreferences,
  buildManualAnalysis,
  filterAnalysisToDocuments,
  isManualDocument,
  mergeAnalyses,
  preserveManualEntries,
  type ManualContractInput,
  type MobileContractPreferencesInput
} from "@/lib/server/manual-analysis";
import { applyContractConfirmation, type ContractConfirmationInput } from "@/lib/server/contract-confirmation";

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
  extractedText?: string;
};

type ExtractedUploadedDocument = StoredUploadedDocument & {
  extractedText: string;
};

function getAnalysisDocumentSignature(document: UploadedDocument) {
  return JSON.stringify({
    documentType: document.documentType,
    provider: document.provider?.trim() || null,
    userCorrections: document.userCorrections ?? {}
  });
}

function isAnalysisForDocuments(analysis: MockAnalysis, documents: UploadedDocument[]) {
  const currentDocumentIds = documents
    .filter((document) => document.status !== "error")
    .map((document) => document.id)
    .sort();
  const analysisDocumentIds = analysis.documents
    .filter((document) => !isManualDocument(document))
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
    const body = JSON.parse((await readLimitedBody(request, 1024 * 1024)).toString("utf8")) as {
      documents?: UploadedDocument[];
      code?: string;
      force?: boolean;
      incremental?: boolean;
      manualContract?: ManualContractInput;
      mobileContractPreferences?: MobileContractPreferencesInput;
      contractConfirmation?: ContractConfirmationInput;
    };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const force = body.force === true;
    const incremental = body.incremental === true;

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    if (!code) {
      return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
    }

    const requestedActions = [
      body.manualContract !== undefined,
      body.documents !== undefined,
      body.mobileContractPreferences !== undefined,
      body.contractConfirmation !== undefined
    ].filter(Boolean).length;
    if (requestedActions > 1) {
      return NextResponse.json(
        { error: "Une seule action d'analyse peut etre effectuee a la fois" },
        { status: 400 }
      );
    }

    // 1. Validation de la clé
    return await withKeyLock(`key:${code}`, async (tx) => {
    const key =
      getLocalAnalysisAccessKey(code) ??
      (await findKeyByCode(code, tx)) ??
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

    if (requiresHouseholdProfile(key.plan) && !hasLockedHouseholdProfile(key)) {
      return NextResponse.json(
        { error: "Configurez le profil de votre foyer avant de lancer une analyse." },
        { status: 403 }
      );
    }

    const existingAnalysis = await getAnalysisByKey(code, tx);

    if (body.mobileContractPreferences !== undefined) {
      if (!existingAnalysis) {
        return NextResponse.json({ error: "Aucune analyse trouvee" }, { status: 404 });
      }
      const updatedAnalysis = applyMobileContractPreferences(
        existingAnalysis,
        body.mobileContractPreferences
      );
      await saveAnalysis(code, updatedAnalysis, tx);
      return NextResponse.json({ analysis: updatedAnalysis, cached: false });
    }

    if (body.contractConfirmation !== undefined) {
      if (!existingAnalysis) {
        return NextResponse.json({ error: "Aucune analyse trouvee" }, { status: 404 });
      }
      const updatedAnalysis = applyContractConfirmation(existingAnalysis, body.contractConfirmation);
      await saveAnalysis(code, updatedAnalysis, tx);
      return NextResponse.json({ analysis: updatedAnalysis, cached: false });
    }

    if (body.manualContract !== undefined) {
      const manualAnalysis = buildManualAnalysis(body.manualContract, key);
      const manualDocument = manualAnalysis.documents[0];
      if (existingAnalysis?.documents.some((document) => document.id === manualDocument.id)) {
        return NextResponse.json({ analysis: existingAnalysis, cached: true });
      }
      if (key.usesRemaining <= 0) {
        return NextResponse.json({ error: "Quota épuisé" }, { status: 403 });
      }

      const mergedAnalysis = mergeAnalyses(existingAnalysis, manualAnalysis);
      if (key.plan === "decouverte" && mergedAnalysis.documents.length > 1) {
        return NextResponse.json(
          { error: "L'accès Découverte est limité à 1 document maximum." },
          { status: 403 }
        );
      }
      if (isAuditFoyerPlan(key.plan)) {
        const validation = validateAuditFoyerDocuments(key.plan, mergedAnalysis.documents);
        if (!validation.isValid) {
          return NextResponse.json(
            { error: validation.message || "Limite de documents dépassée pour ce plan." },
            { status: 403 }
          );
        }
      }

      await saveAnalysis(code, mergedAnalysis, tx);
      const usesRemaining = isVirtualAnalysisAccessKey(key.code)
        ? key.usesRemaining
        : await consumeAnalysisCredit(key.code, tx);
      logger.info("Saisie manuelle enregistrée", {
        service: "Analysis",
        action: "manual_analysis_success",
        keyCode: code,
        metadata: { documentCount: mergedAnalysis.documents.length, usesRemaining }
      });
      return NextResponse.json({ analysis: mergedAnalysis, cached: false });
    }

    const documents = selectOwnedDocuments(body.documents, await getDocumentsByKey(code, tx));
    if (documents) {
      const documentsForPlanValidation = [
        ...(existingAnalysis?.documents.filter(isManualDocument) ?? []),
        ...documents
      ];
      if (key.plan === "decouverte" && documentsForPlanValidation.length > 1) {
        return NextResponse.json(
          { error: "L'accès Découverte est limité à 1 document maximum." },
          { status: 403 }
        );
      }

      if (isAuditFoyerPlan(key.plan)) {
        const validation = validateAuditFoyerDocuments(key.plan, documentsForPlanValidation);
        if (!validation.isValid) {
          return NextResponse.json(
            { error: validation.message || "Limite de documents dépassée pour ce plan." },
            { status: 403 }
          );
        }
      }
    }

    const currentAnalysis = existingAnalysis
      ? filterAnalysisToDocuments(existingAnalysis, documents)
      : null;
    const analyzedDocuments = new Map(
      currentAnalysis?.documents
        .filter((document) => !isManualDocument(document))
        .map((document) => [document.id, document]) ?? []
    );
    const documentsToAnalyze = incremental && !force
      ? documents.filter((document) => {
          const analyzedDocument = analyzedDocuments.get(document.id);
          return !analyzedDocument ||
            getAnalysisDocumentSignature(analyzedDocument) !==
              getAnalysisDocumentSignature(document);
        })
      : documents;

    // A technical retry must reuse the aggregate without consuming another credit.
    if (
      currentAnalysis &&
      isNonEmptyAnalysis(currentAnalysis) &&
      (documentsToAnalyze.length === 0 || (!force && isAnalysisForDocuments(currentAnalysis, documents)))
    ) {
      if (currentAnalysis !== existingAnalysis) {
        await saveAnalysis(code, currentAnalysis, tx);
      }
      return NextResponse.json({ analysis: currentAnalysis, cached: true });
    }

    if (key.usesRemaining <= 0) {
      return NextResponse.json({ error: "Quota épuisé" }, { status: 403 });
    }

    // 3. Extraction de texte (OCR) et appel à l'IA
    if (documentsToAnalyze.length === 0) {
      return NextResponse.json({ error: "Aucun document à analyser" }, { status: 400 });
    }

    const documentsWithContent: ExtractedUploadedDocument[] = [];
    const extractionDiagnostics: ExtractionDiagnostic[] = [];

    for (const doc of documentsToAnalyze) {
      const physicalFileName = getPhysicalFileName(code, doc);
      const buffer = await storage.get(physicalFileName);
      if (!buffer) throw new RequestError("Fichier source indisponible", 422);
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

    let generatedAnalysis: MockAnalysis | null = null;
    let latencyMs = 0;
    for (const document of documentsWithContent) {
      const timedAnalysis = await withLatency(async () => {
        return analyzeDocumentsWithAI([document], code);
      });
      const documentAnalysis = timedAnalysis.result;
      latencyMs += timedAnalysis.latencyMs;

      logger.info("Diagnostic analyse après IA", {
        service: "Analysis",
        action: "analysis_after_ai",
        keyCode: code,
        metadata: {
          expensesCount: documentAnalysis.expenses.length,
          documents: Object.values(documentAnalysis.detectedParties?.documents ?? {}).map((profile) => ({
            documentId: profile.documentId,
            providerName: profile.providerName,
            invoiceAmount: profile.invoiceAmount,
            documentType: profile.documentType
          }))
        }
      });

      if (!isNonEmptyAnalysis(documentAnalysis)) {
        logger.error("Analyse vide non sauvegardée", {
          service: "Analysis",
          action: "empty_analysis_blocked",
          keyCode: code,
          metadata: {
            documentId: document.id,
            expensesLength: documentAnalysis.expenses.length,
            totalMonthlyAmount: documentAnalysis.totalMonthlyAmount,
            textLength: document.extractedText.length
          }
        });
        return NextResponse.json(
          { error: "Analyse vide: sauvegarde refusée" },
          { status: 422 }
        );
      }

      if (requiresHouseholdProfile(key.plan)) {
        const compliance = validateAnalysisAgainstHouseholdProfile(key, documentAnalysis);
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
        applyProfileAddressFallback(key, documentAnalysis);
      }

      generatedAnalysis = mergeAnalyses(generatedAnalysis, documentAnalysis);
    }

    if (!generatedAnalysis) {
      return NextResponse.json({ error: "Aucune analyse produite" }, { status: 422 });
    }

    // 4. Persistance serveur: incremental imports keep previously validated contracts.
    const analysisBase = incremental && currentAnalysis
      ? filterAnalysisToDocuments(
          currentAnalysis,
          documents.filter((document) =>
            !documentsToAnalyze.some((candidate) => candidate.id === document.id)
          )
        )
      : currentAnalysis;
    const analysisToSave = incremental
      ? mergeAnalyses(analysisBase, generatedAnalysis)
      : preserveManualEntries(generatedAnalysis, existingAnalysis);
    await saveAnalysis(code, analysisToSave, tx);

    // 5. Décrémenter le quota
    const usesRemaining = isVirtualAnalysisAccessKey(key.code)
      ? key.usesRemaining
      : await consumeAnalysisCredit(key.code, tx);

    logger.info("Analyse IA terminée avec succès", {
      service: "Analysis",
      action: "ai_success",
      keyCode: code,
      latencyMs,
      metadata: { docCount: documentsToAnalyze.length, usesRemaining }
    });

    return NextResponse.json({
      analysis: analysisToSave,
      cached: false,
      analyzedDocumentCount: documentsToAnalyze.length
    });
    });
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Requete invalide" }, { status: 400 });
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
  const code = readAccessKeyHeader(request);

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

  if (!hasValidAccessExpiration(key)) {
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
  let code = "";
  try {
    const body = (await request.json()) as { code?: string };
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  } catch {
    return NextResponse.json({ error: "Requete invalide" }, { status: 400 });
  }

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

  if (!hasValidAccessExpiration(key)) {
    return NextResponse.json({ error: "Cle expiree", expired: true }, { status: 403 });
  }

  try {
    return await withKeyLock(`key:${key.code}`, async (tx) => {
      await deleteAnalysisByKey(key.code, tx);
      return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
