import { NextResponse } from "next/server";
import { generateAccessKey } from "@/features/billing/access-keys";
import { findFreeTrialByEmail, saveFreeTrial, saveKey } from "@/lib/server/db";
import { sendAccessKeyEmail } from "@/lib/server/email";
import { checkoutRateLimiter } from "@/lib/server/ratelimit";

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskKeyForLog(keyCode: string) {
  return `****${keyCode.slice(-4)}`;
}

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: "Email obligatoire pour recevoir l'accès gratuit." },
        { status: 400 }
      );
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkoutRateLimiter.check(ip)) {
      return NextResponse.json({ error: "Trop de requêtes, veuillez patienter." }, { status: 429 });
    }

    const existingTrial = await findFreeTrialByEmail(normalizedEmail);
    if (existingTrial) {
      return NextResponse.json(
        { error: "Une clé gratuite a déjà été demandée avec cet email." },
        { status: 409 }
      );
    }

    const key = generateAccessKey("decouverte");
    const emailResult = await sendAccessKeyEmail(normalizedEmail, key.code, "Accès gratuit Futéo");

    if (!emailResult.success) {
      console.error("Echec envoi clé gratuite:", {
        email: normalizedEmail,
        keySuffix: maskKeyForLog(key.code),
        error: emailResult.error
      });
      return NextResponse.json(
        { error: "Impossible d'envoyer la clé gratuite pour le moment." },
        { status: 500 }
      );
    }

    await saveKey(key);
    await saveFreeTrial({
      id: `free_${Date.now()}`,
      email: normalizedEmail,
      keyCode: key.code,
      usedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: "Votre clé gratuite a été envoyée par email."
    });
  } catch (error) {
    console.error("Erreur accès gratuit:", error);
    return NextResponse.json(
      { error: "Impossible d'envoyer la clé gratuite pour le moment." },
      { status: 500 }
    );
  }
}
