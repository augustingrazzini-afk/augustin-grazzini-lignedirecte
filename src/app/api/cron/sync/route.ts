import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { syncAll } from "@/lib/sync";
import { debriefPending, processPendingAi, requeueStaleAi } from "@/lib/ai";
import { processTranscriptions } from "@/lib/transcribe";
import { db } from "@/lib/db";

export const maxDuration = 300;

/**
 * Tâche planifiée (Vercel Cron, une fois par jour à 5h17 UTC — limite de l'offre Hobby) : filet de sécurité.
 * Les appels sont normalement synchronisés et analysés dès leur arrivée (webhook, connexion, import) ;
 * ici on rattrape tout le reste, dans un budget de temps qui reste sous `maxDuration`.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now();
  const sync = await syncAll({ deadline: t0 + 170e3 });
  const requeued = await requeueStaleAi();
  await processTranscriptions({ waitMs: 20_000 });
  await debriefPending({ limit: 30 });
  const analyzed = await processPendingAi({ limit: 500, concurrency: 6, deadline: t0 + 270e3 });
  await db.loginToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 864e5) } } });
  return NextResponse.json({ sync, requeued, analyzed });
}
