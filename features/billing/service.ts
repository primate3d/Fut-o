import { stripe } from "@/lib/server/stripe";
import { accessKeyPlans } from "./access-keys";
import { saveOrder } from "@/lib/server/db";

export async function createCheckoutSession(planId: string, baseUrl: string): Promise<string | null> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY manquante");
  }

  const plan = accessKeyPlans.find(p => p.plan === planId);
  if (!plan) {
    throw new Error("Plan invalide");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Futéo - ${plan.name}`,
              description: plan.description,
            },
            unit_amount: Math.round(plan.priceValue * 100), // En centimes
          },
          quantity: 1,
        },
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
