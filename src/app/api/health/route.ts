import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** État du service, pour une surveillance externe : 200 si l'application et la base répondent, 503 sinon. Aucune donnée exposée. */
export async function GET() {
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    // Aller-retour vers la base une fois la connexion ouverte (médiane de 5) : c'est le coût de chaque requête d'une page.
    const laps: number[] = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); await db.$queryRaw`SELECT 1`; laps.push(performance.now() - t); }
    const dbMs = Math.round(laps.sort((a, b) => a - b)[2] * 10) / 10;
    return NextResponse.json({ ok: true, db: "ok", ms: Date.now() - t0, dbMs, region: process.env.VERCEL_REGION || "local" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "indisponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
