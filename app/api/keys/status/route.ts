import { NextResponse } from "next/server";
import { createAdminAccessKey, isAdminAccessCode } from "@/features/billing/access-keys";
import { findKeyByCode } from "@/lib/server/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
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

  return NextResponse.json({
    key,
    hasQuota,
    usesRemaining: key.usesRemaining,
    quotaExceeded: !hasQuota
  });
}
