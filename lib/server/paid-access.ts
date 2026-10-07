import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import {
  getAccessDurationDays,
  normalizeAccessKeyPlan,
  type AccessKeyPlan
} from "@/features/billing/access-keys";
import type { AccessKey } from "@/types";
import {
  findKeyByCode,
  getOrderBySessionId,
  insertKeyIfAbsent,
  saveOrder,
  type OrderRecord
} from "./db";
import { withWaitingKeyLock } from "./key-lock";
import { RequestError } from "./request-error";
import { generateServerAccessKeyCode } from "./access-key-generator";

export type PaidAccessEmailSender = (
  email: string,
  code: string,
  label: string
) => Promise<{ success: boolean }>;

function normalizePaidPlan(planId?: string | null): AccessKey["plan"] {
  if (planId === "famille" || planId === "premium") return "famille";
  if (planId === "foyer" || planId === "simple") return "foyer";
  throw new RequestError("Plan de commande invalide", 409);
}

async function createUniquePaidKey(plan: AccessKeyPlan, executor: Parameters<typeof insertKeyIfAbsent>[1]) {
  const normalizedPlan = normalizeAccessKeyPlan(plan);
  const now = new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const key: AccessKey = {
      id: randomUUID(),
      code: generateServerAccessKeyCode("paid"),
      plan: normalizedPlan,
      usesRemaining: normalizedPlan === "famille" ? 50 : 10,
      expiresAt: new Date(
        now.getTime() + getAccessDurationDays(normalizedPlan) * 24 * 60 * 60 * 1000
      ).toISOString(),
      isActive: true,
      createdAt: now.toISOString()
    };

    if (await insertKeyIfAbsent(key, executor)) return key;
  }

  throw new Error("Impossible de generer une cle unique");
}

export async function fulfillPaidCheckout(
  session: Stripe.Checkout.Session,
  sendEmail: PaidAccessEmailSender
) {
  if (session.payment_status !== "paid") {
    throw new RequestError("Paiement Stripe non confirme", 409);
  }

  const allocation = await withWaitingKeyLock(`stripe-order:${session.id}`, async (tx) => {
    const order = await getOrderBySessionId(session.id, tx);
    if (!order) throw new RequestError("Commande Stripe inconnue", 409);

    const orderPlan = normalizePaidPlan(order.planId);
    const sessionPlan = session.metadata?.planId
      ? normalizePaidPlan(session.metadata.planId)
      : orderPlan;
    if (normalizeAccessKeyPlan(orderPlan) !== normalizeAccessKeyPlan(sessionPlan)) {
      throw new RequestError("Plan Stripe incoherent", 409);
    }

    const customerEmail =
      session.customer_details?.email ?? session.customer_email ?? order.customerEmail ?? null;
    let key = order.generatedKey ? await findKeyByCode(order.generatedKey, tx) : undefined;
    const created = !key;

    if (!key && order.generatedKey) {
      throw new Error("Commande liee a une cle introuvable");
    }
    if (!key) key = await createUniquePaidKey(orderPlan, tx);

    const completedOrder: OrderRecord = {
      ...order,
      status: "completed",
      generatedKey: key.code,
      completedAt: order.completedAt ?? new Date().toISOString(),
      customerEmail,
      emailSent: Boolean(order.emailSent)
    };
    await saveOrder(session.id, completedOrder, tx);

    return { key, order: completedOrder, created };
  });

  const email = allocation.order.customerEmail;
  if (!email) return { ...allocation, emailSent: false };

  const emailSent = await withWaitingKeyLock(`stripe-delivery:${session.id}`, async (tx) => {
    const order = await getOrderBySessionId(session.id, tx);
    if (!order?.generatedKey || order.generatedKey !== allocation.key.code) {
      throw new Error("Livraison Stripe incoherente");
    }
    if (order.emailSent) return true;

    const result = await sendEmail(
      email,
      allocation.key.code,
      order.planName || "Audit Futeo"
    );
    if (!result.success) {
      throw new RequestError("Livraison email temporairement indisponible", 502);
    }

    await saveOrder(session.id, {
      ...order,
      emailSent: true,
      emailSentAt: new Date().toISOString()
    }, tx);
    return true;
  });

  return { ...allocation, emailSent };
}
