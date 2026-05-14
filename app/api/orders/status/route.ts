import { NextResponse } from "next/server";
import { getOrderBySessionId } from "@/lib/server/db";
import { getStripe } from "@/lib/server/stripe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID manquant" }, { status: 400 });
  }

  try {
    const existingOrder = await getOrderBySessionId(sessionId);
    const existingKey = existingOrder?.key?.code ?? existingOrder?.generatedKey;

    if (existingOrder?.status === "completed" && existingKey) {
      return NextResponse.json({
        status: "completed",
        key: existingKey,
        planName: existingOrder.planName ?? null
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return NextResponse.json({
      status: existingOrder?.status ?? "pending",
      paymentStatus: session.payment_status,
      planName: existingOrder?.planName ?? session.metadata?.planName ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur technique";
    console.error("Erreur statut commande:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
