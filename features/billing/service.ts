import { getStripe } from "@/lib/server/stripe";
import { accessKeyPlans, type PublicAccessKeyPlan } from "./access-keys";
import { saveOrder } from "@/lib/server/db";
import { requireServerEnv } from "@/lib/env";

export async function createCheckoutSession(planId: string, baseUrl: string): Promise<string | null> {
  const plan = accessKeyPlans.find(p => p.plan === planId);
  if (!plan) {
    throw new Error("Plan invalide");
  }

  if (plan.plan === "decouverte") {
    throw new Error("L'accès gratuit doit passer par /api/free-access.");
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
