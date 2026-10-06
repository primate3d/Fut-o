import { createHmac, timingSafeEqual } from "node:crypto";
import { requireServerEnv } from "@/lib/env";

export const CHECKOUT_CLAIM_COOKIE = "futeo_checkout_claim";

function signSessionId(sessionId: string) {
  return createHmac("sha256", requireServerEnv("STRIPE_SECRET_KEY"))
    .update(sessionId)
    .digest("base64url");
}

export function createCheckoutClaim(sessionId: string) {
  return signSessionId(sessionId);
}

export function verifyCheckoutClaim(sessionId: string, claim?: string | null) {
  if (!sessionId || !claim) return false;

  const expected = Buffer.from(signSessionId(sessionId));
  const received = Buffer.from(claim);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
