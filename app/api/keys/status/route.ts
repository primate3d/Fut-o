import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  isAdminAccessCode,
  isBlockedProductionAdminCode
} from "@/features/billing/access-keys";
import { findFreeTrialByKeyCode, findKeyByCode, getOrderByGeneratedKey } from "@/lib/server/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  if (isBlockedProductionAdminCode(code)) {
    return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
  }

  const key = (await findKeyByCode(code)) ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);

  if (!key) {
    return NextResponse.json({ error: "Clé inconnue ou non activée" }, { status: 404 });
  }

  if (!key.isActive) {
    return NextResponse.json({ error: "Clé inactive" }, { status: 403 });
  }

  const now = new Date();
  if (key.expiresAt && new Date(key.expiresAt) < now) {
    return NextResponse.json({ error: "Clé expirée", expired: true }, { status: 403 });
  }

  const isAdmin = isAdminAccessCode(key.code);
  const hasQuota = isAdmin || key.usesRemaining > 0;
  const order = await getOrderByGeneratedKey(key.code);
  const freeTrial = order?.customerEmail ? undefined : await findFreeTrialByKeyCode(key.code);
  const customerEmail = order?.customerEmail ?? freeTrial?.email ?? null;

  return NextResponse.json({
    key,
    customerEmail,
    hasQuota,
    usesRemaining: key.usesRemaining,
    quotaExceeded: !hasQuota
  });
}
