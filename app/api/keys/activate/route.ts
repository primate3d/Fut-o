import { NextResponse } from "next/server";
import { findKeyByCode, saveKey } from "@/lib/server/db";
import { mockAccessKeys } from "@/data/mock";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code manquant" }, { status: 400 });
    }

    // On cherche d'abord dans notre DB serveur
    let key = await findKeyByCode(code);

    // Si pas trouvé en DB, on regarde dans les mocks (simulation d'achat préalable)
    if (!key) {
      const mockKey = mockAccessKeys.find((k) => k.code.toUpperCase() === code.toUpperCase());
      if (mockKey) {
        key = { ...mockKey };
      }
    }

    if (!key) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 404 });
    }

    // Si la clé est déjà activée, on renvoie son état actuel
    if (key.activatedAt) {
      return NextResponse.json({ key });
    }

    // Activation réelle côté serveur
    const now = new Date();
    const expiration = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const activatedKey = {
      ...key,
      activatedAt: now.toISOString(),
      expiresAt: expiration.toISOString(),
      isActive: true,
      usesRemaining: key.usesRemaining - 1
    };

    await saveKey(activatedKey);

    return NextResponse.json({ key: activatedKey });
  } catch (error) {
    console.error("Erreur activation clé:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
