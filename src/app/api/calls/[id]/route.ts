import { NextResponse } from "next/server";
import { apiScope, callScope } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { AiError, analyzeCall, debriefMeeting } from "@/lib/ai";
import { hasAi, hasPremium } from "@/lib/billing";

export const maxDuration = 120;

async function load(req: Request, id: string) {
  const scope = await apiScope(req);
  if (!scope) return { error: jsonError("Accès refusé", 403) };
  const call = await db.call.findFirst({ where: { id, ...callScope(scope) } });
  if (!call) return { error: jsonError("Appel introuvable", 404) };
  return { scope, call };
}

/** Supprime un appel ajouté à la main ou importé en CSV (pas ceux des outils synchronisés). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const r = await load(req, (await params).id);
  if ("error" in r) return r.error;
  if (!["csv", "manual"].includes(r.call.provider)) return jsonError("Seuls les appels ajoutés à la main ou par CSV peuvent être supprimés.");
  await db.call.delete({ where: { id: r.call.id } });
  return NextResponse.json({ ok: true });
}

/** Relance l'analyse IA d'un appel (et le débrief, pour un rendez-vous). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const r = await load(req, (await params).id);
  if ("error" in r) return r.error;
  const blocked = await assertActive(r.scope);
  if (blocked) return blocked;
  const org = await db.organization.findUnique({ where: { id: r.scope.orgId }, select: { plan: true } });
  if (org && !hasAi(org)) return jsonError("L'analyse IA des appels est incluse à partir de la formule Essentiel.", 402);
  try {
    const done = await analyzeCall(r.call);
    if (!done) return jsonError("Cet appel n'a pas de transcription : il n'y a rien à analyser.", 400);
    // Le débrief de rendez-vous est réservé à la formule Premium (l'analyse simple reste possible dès Essentiel).
    if (r.call.kind === "meeting" && org && hasPremium(org)) await debriefMeeting(r.call.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof AiError ? e.message : "Analyse impossible", 502);
  }
}
