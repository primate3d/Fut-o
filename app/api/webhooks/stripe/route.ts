import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrderBySessionId, saveKey, saveOrder } from "@/lib/server/db";
import { sendAccessKeyEmail } from "@/lib/server/email";
import { logger, withLatency } from "@/lib/server/logger";
import { getStripe } from "@/lib/server/stripe";
import { requireServerEnv } from "@/lib/env";
import { getAccessDurationDays, normalizeAccessKeyPlan } from "@/features/billing/access-keys";
import type { AccessKey } from "@/types";

function normalizePlan(planId: unknown): AccessKey["plan"] {
  return planId === "famille" || planId === "premium"
    ? "famille"
    : planId === "foyer" || planId === "simple"
      ? "foyer"
      : "foyer";
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    if (!signature) {
      throw new Error("Signature Stripe manquante");
    }

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
    const order = await getOrderBySessionId(session.id);

    if (order && order.status !== "completed") {
      const keyCode = `FF-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const plan = normalizePlan(order.planId);
      const normalizedPlan = normalizeAccessKeyPlan(plan);
      const expiresAt = new Date(
        Date.now() + getAccessDurationDays(normalizedPlan) * 24 * 60 * 60 * 1000
      ).toISOString();

      const newKey: AccessKey = {
        id: `key_${Date.now()}`,
        code: keyCode,
        plan: normalizedPlan,
        usesRemaining: normalizedPlan === "famille" ? 50 : 10,
        expiresAt,
        isActive: true,
        createdAt: new Date().toISOString()
      };

      await saveKey(newKey);

      await saveOrder(session.id, {
        ...order,
        status: "completed",
        generatedKey: keyCode,
        completedAt: new Date().toISOString(),
        customerEmail: session.customer_details?.email,
        emailSent: false
      });

      logger.info("Paiement complete et cle generee", {
        service: "Stripe",
        action: "payment_complete",
        sessionId: session.id,
        keyCode,
        metadata: { plan, email: session.customer_details?.email }
      });

      if (session.customer_details?.email) {
        const emailResult = await sendAccessKeyEmail(
          session.customer_details.email,
          keyCode,
          order.planName || "Audit Futéo"
        );

        if (emailResult.success) {
          await saveOrder(session.id, {
            ...(await getOrderBySessionId(session.id)),
            emailSent: true,
            emailSentAt: new Date().toISOString()
          });

          logger.info("Email de livraison envoye", {
            service: "Email",
            action: "delivery_success",
            sessionId: session.id,
            keyCode,
            latencyMs: Math.round(performance.now() - startTime)
          });
        } else {
          logger.error("Echec de l'envoi de l'email de livraison", {
            service: "Email",
            action: "delivery_failure",
            sessionId: session.id,
            metadata: { error: emailResult.error }
          });
        }
      }
    } else if (order && order.status === "completed") {
      logger.warn("Webhook Stripe ignore, deja traite", {
        service: "Stripe",
        action: "webhook_duplicate",
        sessionId: session.id,
        idempotencyKey: session.id
      });
    }
  }

  return NextResponse.json({ received: true });
}
