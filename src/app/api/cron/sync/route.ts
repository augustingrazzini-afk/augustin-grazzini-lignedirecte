import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { syncAll } from "@/lib/sync";
import { processPendingAi } from "@/lib/ai";
import { db } from "@/lib/db";

export const maxDuration = 300;

/** Tâche planifiée (Vercel Cron toutes les 10 min) : synchronise les outils puis lance l'analyse IA. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sync = await syncAll();
  const analyzed = await processPendingAi(20);
  await db.loginToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 864e5) } } });
  return NextResponse.json({ sync, analyzed });
}
