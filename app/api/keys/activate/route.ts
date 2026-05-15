import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  getAccessDurationDays,
  isAdminAccessCode,
  isDiscoveryPlan,
  normalizeAccessKeyPlan
} from "@/features/billing/access-keys";
import { mockAccessKeys } from "@/data/mock";
import { allowDevOnlyMocks } from "@/lib/env";
import { findKeyByCode, saveKey } from "@/lib/server/db";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    let key = (await findKeyByCode(code)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);

    if (!key && allowDevOnlyMocks()) {
      const mockKey = mockAccessKeys.find((k) => k.code.toUpperCase() === code.toUpperCase());
      if (mockKey) {
        key = { ...mockKey };
      }
    }

    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 404 });
    }

    if (key.activatedAt) {
      return NextResponse.json({ key });
    }

    if (isDiscoveryPlan(key.plan) && key.hasUsedFreeTrial) {
      return NextResponse.json(
        { error: "L'accès découverte a déjà été utilisé sur ce compte." },
        { status: 403 }
      );
    }

    const now = new Date();
    const plan = normalizeAccessKeyPlan(key.plan);
    const expiration = new Date(
      now.getTime() + getAccessDurationDays(plan) * 24 * 60 * 60 * 1000
    );

    const activatedKey = {
      ...key,
      plan,
      activatedAt: now.toISOString(),
      expiresAt: isAdminAccessCode(key.code) ? key.expiresAt : expiration.toISOString(),
      isActive: true,
      usesRemaining: key.usesRemaining,
      hasUsedFreeTrial: isDiscoveryPlan(plan) ? true : key.hasUsedFreeTrial,
      freeTrialUsedAt: isDiscoveryPlan(plan) ? now.toISOString() : key.freeTrialUsedAt
    };

    if (!isAdminAccessCode(activatedKey.code)) {
      await saveKey(activatedKey);
    }

    return NextResponse.json({ key: activatedKey });
  } catch (error) {
    console.error("Erreur activation clé:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
