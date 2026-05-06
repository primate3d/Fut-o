import { NextResponse } from "next/server";
import { createCheckoutSession } from "@/features/billing/service";
import type { AccessKeyPlan } from "@/features/billing/access-keys";
import { checkoutRateLimiter } from "@/lib/server/ratelimit";

export async function POST(request: Request) {
  try {
    const { planId } = (await request.json()) as { planId?: AccessKeyPlan };

    if (!planId) {
      return NextResponse.json({ error: "Plan ID manquant" }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkoutRateLimiter.check(ip)) {
      return NextResponse.json({ error: "Trop de requêtes, veuillez patienter." }, { status: 429 });
    }

    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;

    const url = await createCheckoutSession(planId, baseUrl);

    if (!url) {
      return NextResponse.json({ error: "Échec de la création de la session" }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur technique";
    console.error("Erreur API Checkout:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
