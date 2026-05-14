import { NextResponse } from "next/server";
import { getStripe } from "@/lib/server/stripe";
import { getOrderBySessionId, saveOrder, saveKey } from "@/lib/server/db";
import { generateAccessKey, type AccessKeyPlan } from "@/features/billing/access-keys";

function normalizePlan(planId: unknown): AccessKeyPlan {
  return planId === "famille" || planId === "premium"
    ? "famille"
    : planId === "foyer" || planId === "simple"
      ? "foyer"
    : "foyer";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID manquant" }, { status: 400 });
  }

  try {
    // 1. Vérifier si on a déjà traité cette commande dans notre DB
    const existingOrder = await getOrderBySessionId(sessionId);
    if (existingOrder && existingOrder.key) {
      return NextResponse.json({ 
        status: "completed", 
        key: existingOrder.key.code,
        planName: existingOrder.planName 
      });
    }

    // 2. Sinon, vérifier auprès de Stripe
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      const planId = normalizePlan(session.metadata?.planId);
      const planName = session.metadata?.planName || "Audit Foyer";
      
      // Générer une clé d'accès serveur après paiement confirmé.
      const newKey = generateAccessKey(planId);
      
      // Sauvegarder la clé et la commande
      await saveKey(newKey);
      await saveOrder(sessionId, {
        sessionId,
        planId,
        planName,
        key: newKey,
        customerEmail: session.customer_details?.email,
        status: "completed",
        paidAt: new Date().toISOString()
      });

      return NextResponse.json({ 
        status: "completed", 
        key: newKey.code,
        planName 
      });
    }

    return NextResponse.json({ status: session.payment_status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur technique";
    console.error("Erreur statut commande:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
