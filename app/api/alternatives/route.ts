import { NextResponse } from "next/server";
import { findAlternativeOffers } from "@/features/recommendations/service";
import { getEmbeddedMobileCatalog } from "@/features/recommendations/mobile-catalog";
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
import { ExpenseSubcategory, type AccessKey } from "@/types";

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

  const catalog = getEmbeddedMobileCatalog();
  const alternatives = findAlternativeOffers(analysis.expenses, {
    mobileCatalog: catalog
  });
  const mobileExpenses = analysis.expenses.filter(
    (expense) => expense.subcategory === ExpenseSubcategory.MOBILE
  );
  const missingMobileData = mobileExpenses.some(
    (expense) =>
      !expense.mobileDataUnlimited &&
      typeof expense.mobileIncludedDataGB !== "number" &&
      typeof expense.mobileDataGB !== "number"
  );
  const mobileAlternatives = alternatives.filter(
    (offer) => offer.sourceExpenseId &&
      mobileExpenses.some((expense) => expense.id === offer.sourceExpenseId)
  );
  const comparisonMessage = mobileExpenses.length === 0
    ? null
    : catalog.status !== "fresh"
      ? "Le catalogue mobile vérifié est indisponible ou trop ancien. Aucune économie mobile n'est annoncée."
      : missingMobileData
        ? "Confirmez le volume de données inclus pour obtenir une comparaison mobile fiable."
        : mobileAlternatives.length === 0
          ? "Aucune offre mobile vérifiée, adaptée et moins chère n'est disponible pour ce contrat."
          : null;

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
    comparisonMessage
  });
}
