import { NextResponse } from "next/server";
import {
  hasValidAccessExpiration,
  isBlockedProductionAdminCode,
  isDiscoveryPlan
} from "@/features/billing/access-keys";
import { generateLettersFromAnalysis } from "@/features/letters/service";
import { findKeyByCode, getAnalysisByKey } from "@/lib/server/db";
import { readLimitedBody } from "@/lib/server/document-validation";
import { RequestError } from "@/lib/server/request-error";

export async function POST(request: Request) {
  try {
    const body = JSON.parse((await readLimitedBody(request, 16 * 1024)).toString("utf8")) as {
      code?: string;
    };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) {
      return NextResponse.json({ error: "Code d'acces manquant" }, { status: 400 });
    }
    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    const key = await findKeyByCode(code);
    if (!key || !key.isActive || !hasValidAccessExpiration(key)) {
      return NextResponse.json({ error: "Cle invalide, inactive ou expiree" }, { status: 403 });
    }
    if (isDiscoveryPlan(key.plan)) {
      return NextResponse.json(
        { error: "Les courriers complets ne sont pas inclus dans l'acces Decouverte" },
        { status: 403 }
      );
    }

    const analysis = await getAnalysisByKey(code);
    if (!analysis) {
      return NextResponse.json({ error: "Aucune analyse trouvee" }, { status: 404 });
    }

    return NextResponse.json({ letters: generateLettersFromAnalysis(analysis) });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Requete invalide" }, { status: 400 });
    }
    return NextResponse.json({ error: "Generation des courriers indisponible" }, { status: 500 });
  }
}
