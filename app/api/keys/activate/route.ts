import { NextResponse } from "next/server";
import { findKeyByCode, saveKey } from "@/lib/server/db";
import { mockAccessKeys } from "@/data/mock";
import { getAccessDurationDays, isDiscoveryPlan, normalizeAccessKeyPlan } from "@/features/billing/access-keys";
import { allowDevOnlyMocks } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    // On cherche d'abord dans notre DB serveur
    let key = await findKeyByCode(code);

    // Les clés mockées sont réservées au développement local.
    if (!key && allowDevOnlyMocks()) {
      const mockKey = mockAccessKeys.find((k) => k.code.toUpperCase() === code.toUpperCase());
      if (mockKey) {
        key = { ...mockKey };
      }
    }

    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 404 });
    }

    if (isDiscoveryPlan(key.plan) && key.hasUsedFreeTrial) {
      return NextResponse.json(
        { error: "L'accès découverte a déjà été utilisé sur ce compte." },
        { status: 403 }
      );
    }

    // Si la clé est déjà activée, on renvoie son état actuel
    if (key.activatedAt) {
      return NextResponse.json({ key });
    }

    // Activation réelle côté serveur
    const now = new Date();
    const plan = normalizeAccessKeyPlan(key.plan);
    const expiration = new Date(
      now.getTime() + getAccessDurationDays(plan) * 24 * 60 * 60 * 1000
    );

    const activatedKey = {
      ...key,
      plan,
      activatedAt: now.toISOString(),
      expiresAt: expiration.toISOString(),
      isActive: true,
      usesRemaining: key.usesRemaining,
      hasUsedFreeTrial: isDiscoveryPlan(plan) ? true : key.hasUsedFreeTrial,
      freeTrialUsedAt: isDiscoveryPlan(plan) ? now.toISOString() : key.freeTrialUsedAt
    };

    await saveKey(activatedKey);

    return NextResponse.json({ key: activatedKey });
  } catch (error) {
    console.error("Erreur activation clé:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
