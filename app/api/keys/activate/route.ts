import { NextResponse } from "next/server";
import {
  createAdminAccessKey,
  hasValidAccessExpiration,
  isAdminAccessCode,
  isBlockedProductionAdminCode
} from "@/features/billing/access-keys";
import { mockAccessKeys } from "@/data/mock";
import { allowDevOnlyMocks } from "@/lib/env";
import { findKeyByCode, activateStoredKey } from "@/lib/server/db";
import { RequestError } from "@/lib/server/request-error";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    if (isBlockedProductionAdminCode(code)) {
      return NextResponse.json({ error: "Cle invalide ou non autorisee" }, { status: 403 });
    }

    const storedKey = await findKeyByCode(code);
    let key = storedKey ?? (isAdminAccessCode(code) ? createAdminAccessKey() : undefined);

    if (!key && allowDevOnlyMocks()) {
      const mockKey = mockAccessKeys.find((k) => k.code.toUpperCase() === code.toUpperCase());
      if (mockKey) {
        key = { ...mockKey };
      }
    }

    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 404 });
    }

    if (!key.isActive || !hasValidAccessExpiration(key)) {
      return NextResponse.json(
        { error: "Cle inactive ou expiree" },
        { status: 403 }
      );
    }

    const activatedKey = storedKey ? await activateStoredKey(code) : key;

    return NextResponse.json({ key: activatedKey });
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erreur activation clé:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
