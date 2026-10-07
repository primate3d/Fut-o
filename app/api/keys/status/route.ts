import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  hasValidAccessExpiration,
  hasLockedHouseholdProfile,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  requiresHouseholdProfile
} from "@/features/billing/access-keys";
import { findFreeTrialByKeyCode, findKeyByCode, getOrderByGeneratedKey } from "@/lib/server/db";
import { readAccessKeyHeader } from "@/lib/access-key-transport";
import { accessKeyStatusRateLimiter, getRequestIp } from "@/lib/server/ratelimit";

export async function GET(request: Request) {
  const code = readAccessKeyHeader(request);

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  if (!accessKeyStatusRateLimiter.check(getRequestIp(request))) {
    return NextResponse.json(
      { error: "Trop de tentatives, veuillez patienter." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
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

  if (!hasValidAccessExpiration(key)) {
    return NextResponse.json({ error: "Clé expirée", expired: true }, { status: 403 });
  }

  const isAdmin = isAdminAccessCode(key.code);
  const hasQuota = isAdmin || key.usesRemaining > 0;
  const order = await getOrderByGeneratedKey(key.code);
  const freeTrial = order?.customerEmail ? undefined : await findFreeTrialByKeyCode(key.code);
  const customerEmail = order?.customerEmail ?? freeTrial?.email ?? null;
  const profileRequired = requiresHouseholdProfile(key.plan);
  const profileCompleted = !profileRequired || hasLockedHouseholdProfile(key);

  return NextResponse.json({
    key,
    customerEmail,
    hasQuota,
    usesRemaining: key.usesRemaining,
    quotaExceeded: !hasQuota,
    profileRequired,
    profileCompleted
  });
}
