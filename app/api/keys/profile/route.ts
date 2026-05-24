import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  hasLockedHouseholdProfile,
  isAdminAccessCode,
  isBlockedProductionAdminCode,
  normalizeAccessKeyPlan,
  requiresHouseholdProfile
} from "@/features/billing/access-keys";
import { findKeyByCode, lockAccessKeyProfile } from "@/lib/server/db";

function cleanName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function cleanAddress(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    code?: string;
    allowedNames?: unknown[];
    profilePostalAddress?: string;
  };
  const code = body.code?.trim();

  if (!code) {
    return NextResponse.json({ error: "Code manquant" }, { status: 400 });
  }

  if (isBlockedProductionAdminCode(code)) {
    return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
  }

  const key =
    (await findKeyByCode(code)) ??
    (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);

  if (!key || !key.isActive) {
    return NextResponse.json({ error: "Cle invalide ou inactive" }, { status: 403 });
  }

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Cle expiree", expired: true }, { status: 403 });
  }

  if (!requiresHouseholdProfile(key.plan)) {
    return NextResponse.json({ error: "Profil foyer non requis pour cette offre" }, { status: 400 });
  }

  if (hasLockedHouseholdProfile(key)) {
    return NextResponse.json({ error: "Profil foyer deja verrouille" }, { status: 409 });
  }

  const allowedNames = Array.from(
    new Set((body.allowedNames ?? []).map(cleanName).filter(Boolean))
  );
  const postalAddress = cleanAddress(body.profilePostalAddress);
  const maxNames = normalizeAccessKeyPlan(key.plan) === "famille" ? 3 : 1;

  if (allowedNames.length === 0 || allowedNames.length > maxNames) {
    return NextResponse.json(
      { error: `Saisissez entre 1 et ${maxNames} nom(s) autorise(s).` },
      { status: 400 }
    );
  }

  if (postalAddress.length < 8) {
    return NextResponse.json({ error: "Adresse postale incomplete." }, { status: 400 });
  }

  if (isAdminAccessCode(key.code)) {
    return NextResponse.json({ error: "Profil indisponible pour cette cle." }, { status: 400 });
  }

  const updatedKey = await lockAccessKeyProfile(key.code, allowedNames, postalAddress);
  return NextResponse.json({ key: updatedKey });
}
