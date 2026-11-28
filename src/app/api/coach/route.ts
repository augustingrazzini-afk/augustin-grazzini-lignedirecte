import { bumpUsage } from "@/lib/usage";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope, scopeClientId } from "@/lib/access";
import { assertActive, assertAi, jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { AiError, asJson, generateCoach } from "@/lib/ai";
import { periodStats, recentConversations } from "@/lib/stats";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]), clientId: z.string().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Requête invalide");
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const blocked = (await assertActive(scope)) || (await assertAi(scope));
  if (blocked) return blocked;
  // Garde-fou de coût : plafond par espace et par jour.
  if ((await bumpUsage(`coach:${scope.orgId}`)) > 30) return jsonError("Limite de 30 diagnostics par jour atteinte pour votre espace. Elle se remet à zéro demain.", 429);
  const { stats: s } = await periodStats(scope, b.data.days);
  if (!s.lastCallAt) return jsonError("Pas encore d'appels sur cette période.", 404);
  // Les 40 conversations les plus récentes suffisent au diagnostic : on ne charge pas tous les appels.
  const calls = await recentConversations(scope, b.data.days, 40);
  const clientId = scopeClientId(scope);
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  const client = clientId ? await db.client.findUnique({ where: { id: clientId } }) : null;
  try {
    const r = await generateCoach({ total: s.total, connected: s.connected, conversations: s.conversations, meetings: s.meetings }, s.objections, calls, client?.offer || org.offer, client?.name || org.name, b.data.days);
    await db.coach.create({ data: { orgId: scope.orgId, clientId, days: b.data.days, content: asJson(r) } });
    return NextResponse.json(r);
  } catch (e) {
    return jsonError(e instanceof AiError ? e.message : "L'analyse a échoué.", 502);
  }
}
