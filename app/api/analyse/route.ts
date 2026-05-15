import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  isAdminAccessCode
} from "@/features/billing/access-keys";
import { analyzeDocumentsWithAI } from "@/features/analysis/ai-service";
import { findKeyByCode, getAnalysisByKey, saveAnalysis, saveKey } from "@/lib/server/db";
import { logger, withLatency } from "@/lib/server/logger";
import { extractTextFromDocument } from "@/lib/server/ocr";
import type { UploadedDocument } from "@/types";

export async function POST(request: Request) {
  try {
    const { documents, code } = (await request.json()) as {
      documents?: UploadedDocument[];
      code?: string;
    };

    if (!code) {
      return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
    }

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

    const existingAnalysis = await getAnalysisByKey(code);
    if (existingAnalysis?.detectedParties?.documents) {
      return NextResponse.json({
        analysis: existingAnalysis,
        cached: true,
        hasQuota: isAdminAccessCode(key.code) || key.usesRemaining > 0,
        usesRemaining: key.usesRemaining
      });
    }

    if (!isAdminAccessCode(key.code) && key.usesRemaining <= 0) {
      return NextResponse.json(
        {
          error: "Quota d'analyse épuisé pour cette clé.",
          quotaExceeded: true,
          hasQuota: false,
          usesRemaining: key.usesRemaining
        },
        { status: 403 }
      );
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: "Aucun document à analyser" }, { status: 400 });
    }

    const { result: analysis, latencyMs } = await withLatency(async () => {
      const documentsWithContent = await Promise.all(
        documents.map(async (doc) => {
          const text = await extractTextFromDocument(code, doc);
          return { ...doc, extractedText: text };
        })
      );

      return analyzeDocumentsWithAI(documentsWithContent, code);
    });

    await saveAnalysis(code, analysis);

    const updatedKey = isAdminAccessCode(key.code)
      ? key
      : { ...key, usesRemaining: Math.max(0, key.usesRemaining - 1) };

    if (!isAdminAccessCode(key.code)) {
      await saveKey(updatedKey);
    }

    logger.info("Analyse IA terminée avec succès", {
      service: "Analysis",
      action: "ai_success",
      keyCode: code,
      latencyMs,
      metadata: { docCount: documents.length, usesRemaining: updatedKey.usesRemaining }
    });

    return NextResponse.json({
      analysis,
      cached: false,
      hasQuota: isAdminAccessCode(updatedKey.code) || updatedKey.usesRemaining > 0,
      usesRemaining: updatedKey.usesRemaining
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Une erreur est survenue lors de l'analyse IA";
    logger.error("Erreur critique lors de l'analyse IA", {
      service: "Analysis",
      action: "ai_error",
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

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

  const analysis = await getAnalysisByKey(code);
  if (!analysis) {
    return NextResponse.json({ error: "Aucune analyse trouvée" }, { status: 404 });
  }

  return NextResponse.json({
    analysis,
    hasQuota: isAdminAccessCode(key.code) || key.usesRemaining > 0,
    usesRemaining: key.usesRemaining
  });
}
