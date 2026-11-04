import { NextResponse } from "next/server";
import { buildServerComparison } from "@/lib/server/comparison";
import {
  createAdminAccessKey,
  hasValidAccessExpiration,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  isDiscoveryPlan
} from "@/features/billing/access-keys";
import { mockAccessKeys } from "@/data/mock";
import { allowDevOnlyMocks } from "@/lib/env";
import { findKeyByCode, getAnalysisByKey } from "@/lib/server/db";
import type { AccessKey } from "@/types";

function getLocalAlternativesAccessKey(code: string): AccessKey | undefined {
  if (!allowDevOnlyMocks() || code.trim().toUpperCase() !== "TEST-PREMIUM") {
    return undefined;
  }

  return mockAccessKeys.find((key) => key.code.toUpperCase() === code.trim().toUpperCase());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string };
  const code = body.code?.trim();

  if (!code) {
    return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
  }

  if (isBlockedProductionAdminCode(code)) {
    return NextResponse.json({ error: "Clé invalide ou non autorisée" }, { status: 403 });
  }

  const key =
    getLocalAlternativesAccessKey(code) ??
    (await findKeyByCode(code)) ??
    (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);

  if (!key || !key.isActive) {
    return NextResponse.json({ error: "Clé invalide ou inactive" }, { status: 403 });
  }

  if (!hasValidAccessExpiration(key)) {
    return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
  }

  const analysis = await getAnalysisByKey(code);
  if (!analysis) {
    return NextResponse.json({ error: "Aucune analyse trouvée" }, { status: 404 });
  }

  const { alternatives, catalog, commercialCatalogs, comparisonMessage, comparisonStates } = await buildServerComparison(analysis);

  return NextResponse.json({
    alternatives: isDiscoveryPlan(key.plan)
      ? alternatives.map((offer) => ({
          ...offer,
          logoUrl: undefined,
          name: "Opérateur sélectionné caché",
          provider: "Opérateur caché",
          url: "",
          conditions: undefined,
          conditionalPrices: undefined
        }))
      : alternatives,
    catalog: {
      status: catalog.status,
      verifiedAt: catalog.verifiedAt,
      detectedOffers: catalog.detectedOffers,
      verifiedOffers: catalog.verifiedOffers,
      source: catalog.source
    },
    commercialCatalogs,
    comparisonMessage,
    comparisonStates
  });
}
