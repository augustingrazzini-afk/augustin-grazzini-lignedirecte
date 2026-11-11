import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, sameOrigin } from "@/lib/api";
import { chatScope, ownerWhere } from "@/lib/conversations";

/** Historique de l'assistant : liste (sans id) ou conversation complète (?id=…). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const scope = await chatScope(req, { clientId: u.searchParams.get("clientId"), shareToken: u.searchParams.get("shareToken") });
  if (!scope) return jsonError("Accès refusé", 403);
  const where = ownerWhere(scope);
  const id = u.searchParams.get("id");
  if (id) {
    const c = await db.conversation.findFirst({ where: { id, ...where }, select: { id: true, title: true, messages: true, updatedAt: true } });
    return c ? NextResponse.json(c) : jsonError("Conversation introuvable", 404);
  }
  const list = await db.conversation.findMany({ where, orderBy: { updatedAt: "desc" }, take: 60, select: { id: true, title: true, updatedAt: true } });
  return NextResponse.json({ conversations: list });
}

/** Supprime une conversation de l'historique. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const u = new URL(req.url);
  const scope = await chatScope(req, { clientId: u.searchParams.get("clientId"), shareToken: u.searchParams.get("shareToken") });
  if (!scope) return jsonError("Accès refusé", 403);
  const id = u.searchParams.get("id") || "";
  await db.conversation.deleteMany({ where: { id, ...ownerWhere(scope) } });
  return NextResponse.json({ ok: true });
}
