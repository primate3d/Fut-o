import { NextResponse } from "next/server";
import { purgeExpiredData } from "@/lib/server/db";

/**
 * Route simulant une Cron Job pour la purge automatique des données expirées (J+14).
 * En production, cette route serait appelée par un service tiers (Vercel Crons, etc.)
 */
export async function POST(request: Request) {
  try {
    // La purge reste inaccessible tant qu'un secret explicite n'est pas configure.
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    await purgeExpiredData();

    return NextResponse.json({ 
      success: true, 
      message: "Purge effectuée avec succès",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Erreur lors de la purge cron:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
