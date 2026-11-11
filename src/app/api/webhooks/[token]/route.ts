import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { syncIntegration } from "@/lib/sync";

/**
 * Webhook d'un outil d'appel (Minari, Aircall, Ringover…). L'URL contient un jeton secret propre
 * à chaque intégration : c'est lui qui authentifie l'appel. On ne fait pas confiance au contenu
 * envoyé : on relance simplement une synchro incrémentale qui relit l'outil via son API.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 20) return NextResponse.json({ ok: false }, { status: 404 });
  const integ = await db.integration.findUnique({ where: { webhookToken: token }, select: { id: true, lastSyncAt: true, status: true } });
  if (!integ || integ.status === "paused") return NextResponse.json({ ok: false }, { status: 404 });
  const fresh = integ.lastSyncAt && Date.now() - integ.lastSyncAt.getTime() < 20_000;
  if (!fresh) after(() => syncIntegration(integ.id).catch(() => {}));
  return NextResponse.json({ ok: true });
}
