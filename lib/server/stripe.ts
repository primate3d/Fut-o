import "server-only";
import Stripe from "stripe";
import { requireServerEnv } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripe() {
  stripeClient ??= new Stripe(requireServerEnv("STRIPE_SECRET_KEY"));
  return stripeClient;
}
