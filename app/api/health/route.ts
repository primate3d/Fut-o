import { NextResponse } from "next/server";
import { db } from "@/lib/server/db/index";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const start = performance.now();
    await db.execute(sql`SELECT 1`);
    const latency = Math.round(performance.now() - start);

    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs: latency,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  } catch (error) {
    console.error("Healthcheck failed:", error);
    return NextResponse.json({
      status: "error",
      database: "disconnected",
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
