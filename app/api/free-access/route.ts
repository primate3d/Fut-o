import { NextResponse } from "next/server";
import { requestFreeAccess } from "@/lib/server/free-access";
import { RequestError } from "@/lib/server/request-error";
import { sendAccessKeyEmail } from "@/lib/server/email";
import { checkoutRateLimiter } from "@/lib/server/ratelimit";

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";

    if (!normalizedEmail || normalizedEmail.length > 254 || !isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: "Email obligatoire pour recevoir l'accès gratuit." },
        { status: 400 }
      );
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkoutRateLimiter.check(ip)) {
      return NextResponse.json({ error: "Trop de requêtes, veuillez patienter." }, { status: 429 });
    }

    await requestFreeAccess(normalizedEmail, sendAccessKeyEmail);

    return NextResponse.json({
      success: true,
      message: "Votre clé gratuite a été envoyée par email."
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erreur accès gratuit:", error);
    return NextResponse.json(
      { error: "Impossible d'envoyer la clé gratuite pour le moment." },
      { status: 500 }
    );
  }
}
