import { NextResponse } from "next/server";
import Stripe from "stripe";
import { sendAccessKeyEmail } from "@/lib/server/email";
import { logger, withLatency } from "@/lib/server/logger";
import { fulfillPaidCheckout } from "@/lib/server/paid-access";
import { getStripe } from "@/lib/server/stripe";
import { requireServerEnv } from "@/lib/env";

function maskKeyForLog(keyCode: string) {
  return `****${keyCode.slice(-4)}`;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    if (!signature) throw new Error("Signature Stripe manquante");

    const webhookSecret = requireServerEnv("STRIPE_WEBHOOK_SECRET");
    const stripe = getStripe();
    const { result, latencyMs } = await withLatency(async () =>
      stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    );
    event = result;

    logger.info("Webhook Stripe recu et verifie", {
      service: "Stripe",
      action: "webhook_verify",
      latencyMs,
      metadata: { type: event.type }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    logger.error("Echec verification signature Webhook", {
      service: "Stripe",
      action: "webhook_verify",
      metadata: { error: message }
    });
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const startTime = performance.now();

    try {
      const result = await fulfillPaidCheckout(session, sendAccessKeyEmail);
      logger.info(result.created ? "Paiement complete et cle generee" : "Webhook Stripe rejoue", {
        service: "Stripe",
        action: result.created ? "payment_complete" : "webhook_duplicate",
        sessionId: session.id,
        idempotencyKey: session.id,
        metadata: {
          keySuffix: maskKeyForLog(result.key.code),
          emailSent: result.emailSent
        },
        latencyMs: Math.round(performance.now() - startTime)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de traitement Stripe";
      logger.error("Echec traitement du paiement Stripe", {
        service: "Stripe",
        action: "payment_fulfillment_failure",
        sessionId: session.id,
        metadata: { error: message }
      });
      return NextResponse.json({ error: "Traitement du paiement incomplet" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
