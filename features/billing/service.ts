import { getStripe } from "@/lib/server/stripe";
import { accessKeyPlans, generateAccessKey, type PublicAccessKeyPlan } from "./access-keys";
import { findFreeTrialByEmail, saveFreeTrial, saveKey, saveOrder } from "@/lib/server/db";
import { sendAccessKeyEmail } from "@/lib/server/email";
import { requireServerEnv } from "@/lib/env";

function normalizeTrialEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createCheckoutSession(
  planId: string,
  baseUrl: string,
  customerEmail?: string | null
): Promise<string | null> {
  const plan = accessKeyPlans.find(p => p.plan === planId);
  if (!plan) {
    throw new Error("Plan invalide");
  }

  if (plan.plan === "decouverte") {
    const email = normalizeTrialEmail(customerEmail);
    if (!email || !isValidEmail(email)) {
      throw new Error("Email obligatoire pour l'accès découverte");
    }

    const existingTrial = await findFreeTrialByEmail(email);
    if (existingTrial) {
      throw new Error("L'accès découverte a déjà été utilisé avec cet email.");
    }

    const key = generateAccessKey("decouverte");
    await saveKey(key);

    const emailResult = await sendAccessKeyEmail(email, key.code, "Découverte Futéo");
    if (!emailResult.success) {
      throw new Error("Impossible d'envoyer la clé découverte pour le moment.");
    }

    await saveFreeTrial({
      id: `trial_${Date.now()}`,
      email,
      keyCode: key.code,
      usedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    return `${baseUrl}/activer-cle`;
  }

  const stripePriceEnvByPlan: Partial<Record<PublicAccessKeyPlan, "STRIPE_PRICE_AUDIT_FOYER" | "STRIPE_PRICE_AUDIT_FAMILLE">> = {
    foyer: "STRIPE_PRICE_AUDIT_FOYER",
    famille: "STRIPE_PRICE_AUDIT_FAMILLE"
  };
  const priceEnvName = stripePriceEnvByPlan[plan.plan];
  const configuredPrice = priceEnvName ? requireServerEnv(priceEnvName) : undefined;
  const stripe = getStripe();

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        configuredPrice
          ? {
              price: configuredPrice,
              quantity: 1
            }
          : {
              price_data: {
                currency: "eur",
                product_data: {
                  name: `Futéo - ${plan.name}`,
                  description: plan.description
                },
                unit_amount: Math.round(plan.priceValue * 100)
              },
              quantity: 1
            }
      ],
      mode: "payment",
      success_url: `${baseUrl}/tarifs?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/tarifs`,
      metadata: {
        planId: plan.plan,
        planName: plan.name
      }
    });

    await saveOrder(session.id, {
      planId: plan.plan,
      planName: plan.name,
      status: "pending",
      createdAt: new Date().toISOString()
    });

    return session.url;
  } catch (error) {
    console.error("Erreur création session Stripe:", error);
    return null;
  }
}
