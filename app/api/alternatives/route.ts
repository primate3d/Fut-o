import { NextResponse } from "next/server";
import { findAlternativeOffers } from "@/features/recommendations/service";
import {
  createAdminAccessKey,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  isDiscoveryPlan
} from "@/features/billing/access-keys";
import { mockAccessKeys } from "@/data/mock";
import { allowDevOnlyMocks } from "@/lib/env";
import { findKeyByCode } from "@/lib/server/db";
import type { AccessKey, Expense } from "@/types";

function getLocalAlternativesAccessKey(code: string): AccessKey | undefined {
  if (!allowDevOnlyMocks() || code.trim().toUpperCase() !== "TEST-PREMIUM") {
    return undefined;
  }

  return mockAccessKeys.find((key) => key.code.toUpperCase() === code.trim().toUpperCase());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string; expenses?: Expense[] };
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

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Clé expirée" }, { status: 403 });
  }

  const expenses = Array.isArray(body.expenses) ? body.expenses : [];
  const alternatives = findAlternativeOffers(expenses);

  return NextResponse.json({
    alternatives: isDiscoveryPlan(key.plan)
      ? alternatives.map((offer) => ({
          ...offer,
          logoUrl: undefined,
          name: "Opérateur sélectionné caché",
          provider: "Opérateur caché",
          url: ""
        }))
      : alternatives
  });
}
