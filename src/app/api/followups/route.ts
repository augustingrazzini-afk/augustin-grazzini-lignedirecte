import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope, callScope } from "@/lib/access";
import { jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = z.object({ contactKey: z.string().min(1).max(200), done: z.boolean(), clientId: z.string().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Requête invalide");
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  // le contact doit exister dans le périmètre de l'utilisateur
  const exists = await db.call.count({ where: { ...callScope(scope), contactKey: b.data.contactKey } });
  if (!exists) return jsonError("Contact introuvable", 404);
  if (b.data.done) {
    await db.followUp.upsert({ where: { orgId_contactKey: { orgId: scope.orgId, contactKey: b.data.contactKey } }, update: { done: true, doneById: scope.userId, doneAt: new Date() }, create: { orgId: scope.orgId, contactKey: b.data.contactKey, doneById: scope.userId } });
  } else {
    await db.followUp.deleteMany({ where: { orgId: scope.orgId, contactKey: b.data.contactKey } });
  }
  return NextResponse.json({ ok: true });
}
