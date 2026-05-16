import { NextResponse } from "next/server";
import { findKeyByCode, getAnalysisByKey, saveAnalysis, saveKey, deleteAnalysisByKey } from "@/lib/server/db";
import { analyzeDocumentsWithAI } from "@/features/analysis/ai-service";
import { logger, withLatency } from "@/lib/server/logger";
import { extractTextFromDocument } from "@/lib/server/ocr";
import { storage } from "@/lib/server/storage";
import { env } from "@/lib/env";
import type { MockAnalysis, UploadedDocument } from "@/types";

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

  const hasExtractedText = analysis.documents.some((document) => {
    const extractedText = "extractedText" in document ? document.extractedText : undefined;
    return typeof extractedText === "string" && extractedText.trim().length > 0;
  });
  const hasExpenses = analysis.expenses.length > 0;
  const hasMonthlyAmount = analysis.totalMonthlyAmount > 0;
  const hasUsefulDetectedDocument = Object.values(analysis.detectedParties?.documents ?? {}).some(
    (document) => Boolean(document.invoiceAmount || document.customer)
  );

  return hasExtractedText || hasExpenses || hasMonthlyAmount || hasUsefulDetectedDocument;
}

function getPhysicalFileName(keyCode: string, document: UploadedDocument) {
  const storedDocument = document as StoredUploadedDocument;
  return storedDocument.physicalFileName || `${keyCode}_${document.id}_${document.fileName}`;
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
  first500: string;
};

export async function POST(request: Request) {
  try {
    const { documents, code } = (await request.json()) as {
      documents?: UploadedDocument[];
      code?: string;
    };

    if (!code) {
      return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
    }

    // 1. Validation de la clé
    const key = await findKeyByCode(code);
    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
    }

    if (!key.isActive || key.usesRemaining <= 0) {
      return NextResponse.json({ error: "Quota épuisé ou clé non active" }, { status: 403 });
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
    }

    // 2. Vérification du cache
    const existingAnalysis = await getAnalysisByKey(code);
    if (
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
        textLength: 0,
        first500: ""
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
      diagnostic.first500 = text.slice(0, 500);
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

    // 4. Persistance serveur
    await saveAnalysis(code, analysis);

    // 5. Décrémenter le quota
    const updatedKey = { ...key, usesRemaining: key.usesRemaining - 1 };
    await saveKey(updatedKey);

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

  const key = await findKeyByCode(code);
  if (!key) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 403 });
  }

  await deleteAnalysisByKey(code);
  return NextResponse.json({ success: true });
}