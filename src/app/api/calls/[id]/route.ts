import { NextResponse } from "next/server";
import { apiScope, callScope } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { AiError, analyzeCall } from "@/lib/ai";

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

/** Relance l'analyse IA d'un appel. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const r = await load(req, (await params).id);
  if ("error" in r) return r.error;
  const blocked = await assertActive(r.scope);
  if (blocked) return blocked;
  try {
    await analyzeCall(r.call);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof AiError ? e.message : "Analyse impossible", 502);
  }
}
