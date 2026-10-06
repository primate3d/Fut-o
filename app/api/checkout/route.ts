import { NextResponse } from "next/server";
import { createCheckoutSession } from "@/features/billing/service";
import type { AccessKeyPlan } from "@/features/billing/access-keys";
import { CHECKOUT_CLAIM_COOKIE, createCheckoutClaim } from "@/lib/server/checkout-claim";
import { checkoutRateLimiter } from "@/lib/server/ratelimit";

export async function POST(request: Request) {
  try {
    const { planId } = (await request.json()) as { planId?: AccessKeyPlan };

    if (!planId) {
      return NextResponse.json({ error: "Plan ID manquant" }, { status: 400 });
    }
    if (planId === "decouverte") {
      return NextResponse.json(
        { error: "L'accès gratuit doit passer par le formulaire email." },
        { status: 400 }
      );
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkoutRateLimiter.check(ip)) {
      return NextResponse.json({ error: "Trop de requêtes, veuillez patienter." }, { status: 429 });
    }

    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host") || "localhost:3000";
    const session = await createCheckoutSession(planId, `${protocol}://${host}`);
    if (!session) {
      return NextResponse.json({ error: "Échec de la création de la session" }, { status: 500 });
    }

    const response = NextResponse.json({ url: session.url });
    response.cookies.set(CHECKOUT_CLAIM_COOKIE, createCheckoutClaim(session.id), {
      httpOnly: true,
      maxAge: 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur technique";
    console.error("Erreur API Checkout:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
