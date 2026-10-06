import { NextRequest, NextResponse } from "next/server";
import { getOrderBySessionId } from "@/lib/server/db";
import {
  CHECKOUT_CLAIM_COOKIE,
  verifyCheckoutClaim
} from "@/lib/server/checkout-claim";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Session ID manquant" }, { status: 400 });
  }

  const claim = request.cookies.get(CHECKOUT_CLAIM_COOKIE)?.value;
  if (!verifyCheckoutClaim(sessionId, claim)) {
    return NextResponse.json({ error: "Session de commande non autorisee" }, { status: 403 });
  }

  try {
    const order = await getOrderBySessionId(sessionId);
    if (!order) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    if (order.status === "completed" && order.generatedKey) {
      return NextResponse.json({
        status: "completed",
        key: order.generatedKey,
        planName: order.planName ?? null
      });
    }

    const { getStripe } = await import("@/lib/server/stripe");
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.id !== order.id || session.metadata?.planId !== order.planId) {
      return NextResponse.json({ error: "Commande Stripe incoherente" }, { status: 403 });
    }

    return NextResponse.json({
      status: order.status ?? "pending",
      paymentStatus: session.payment_status,
      planName: order.planName ?? session.metadata?.planName ?? null
    });
  } catch (error) {
    console.error("Erreur statut commande:", error);
    return NextResponse.json({ error: "Statut de commande indisponible" }, { status: 500 });
  }
}
