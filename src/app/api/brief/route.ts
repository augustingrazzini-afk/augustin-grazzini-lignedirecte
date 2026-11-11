import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope, callScope, scopeClientId } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { AiError, asJson, generateBrief } from "@/lib/ai";
import { activityScope } from "@/lib/channels";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = z.object({ query: z.string().trim().min(3).max(120), clientId: z.string().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Tapez au moins 3 caractères.");
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const blocked = await assertActive(scope);
  if (blocked) return blocked;

  const words = b.data.query.split(/\s+/).filter((w) => w.length > 1);
  const match = words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { company: { contains: w, mode: "insensitive" as const } }] }));
  const [calls, acts] = await Promise.all([
    db.call.findMany({ where: { ...callScope(scope), AND: match }, orderBy: { startedAt: "desc" }, take: 15 }),
    db.activity.findMany({ where: { ...activityScope(scope), AND: match }, orderBy: { occurredAt: "desc" }, take: 60 }),
  ]);
  if (!calls.length && !acts.length) return jsonError(`Aucun appel trouvé pour « ${b.data.query} ». Essayez le nom de famille seul ou l'entreprise.`, 404);

  const clientId = scopeClientId(scope);
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  const client = clientId ? await db.client.findUnique({ where: { id: clientId } }) : null;
  try {
    const brief = await generateBrief(calls, b.data.query, client?.offer || org.offer, client?.name || org.name, acts);
    const saved = await db.brief.create({ data: { orgId: scope.orgId, clientId, query: b.data.query, prospect: brief.prospect || b.data.query, company: brief.entreprise, content: asJson(brief), createdById: scope.userId } });
    return NextResponse.json({ id: saved.id, brief, calls: calls.length + acts.length });
  } catch (e) {
    return jsonError(e instanceof AiError ? e.message : "La génération a échoué.", 502);
  }
}
