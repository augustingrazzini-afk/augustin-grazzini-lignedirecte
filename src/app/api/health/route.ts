import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** État du service, pour une surveillance externe : 200 si l'application et la base répondent, 503 sinon. Aucune donnée exposée. */
export async function GET() {
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "ok", ms: Date.now() - t0 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "indisponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
