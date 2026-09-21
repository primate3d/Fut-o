import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getAccessDurationDays } from "@/features/billing/access-keys";
import { db } from "./db/index";
import { accessKeys, freeTrials } from "./db/schema";
import { withKeyLock } from "./key-lock";
import { RequestError } from "./request-error";

type SendEmail = (email: string, code: string, label: string) => Promise<{ success: boolean }>;

// Scope is server-owned. No campaign or client-selected plan is enabled here.
export async function requestFreeAccess(email: string, send: SendEmail, scope = "decouverte") {
  const normalizedEmail = email.trim().toLowerCase();
  const allocation = await db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const keyCode = `FUTEO-DECOUVERTE-${randomBytes(16).toString("hex").toUpperCase()}`;
    const inserted = await tx.insert(freeTrials).values({
      id: randomUUID(), email: normalizedEmail, scope, keyCode, usedAt: now, createdAt: now
    }).onConflictDoNothing().returning();
    if (inserted[0]) {
      await tx.insert(accessKeys).values({
        id: randomUUID(), code: keyCode, plan: "decouverte", usesRemaining: 1,
        expiresAt: new Date(Date.now() + getAccessDurationDays("decouverte") * 86400000).toISOString(),
        isActive: true, createdAt: now
      });
      return inserted[0];
    }
    const [existing] = await tx.select().from(freeTrials).where(and(
      eq(freeTrials.scope, scope), sql`lower(btrim(${freeTrials.email})) = ${normalizedEmail}`
    ));
    if (!existing) throw new Error("Free access allocation unavailable");
    return existing;
  });

  // Allocation is committed before delivery: even an ambiguous network failure keeps the same key.
  await withKeyLock(`delivery:${allocation.id}`, async (tx) => {
    const [current] = await tx.select().from(freeTrials).where(eq(freeTrials.id, allocation.id));
    if (current.emailSentAt) {
      throw new RequestError("Une cle gratuite a deja ete demandee avec cet email.", 409);
    }
    const [key] = await tx.select().from(accessKeys).where(eq(accessKeys.code, allocation.keyCode));
    if (!key?.isActive || !key.expiresAt || Date.parse(key.expiresAt) <= Date.now()) {
      throw new RequestError("Cette cle gratuite a expire. Contactez le support.", 403);
    }
    if (!(await send(normalizedEmail, allocation.keyCode, "Acces gratuit Futeo")).success) {
      throw new RequestError("Impossible d'envoyer la cle gratuite pour le moment.", 500);
    }
    await tx.update(freeTrials).set({ emailSentAt: new Date().toISOString() }).where(eq(freeTrials.id, allocation.id));
  });
}
