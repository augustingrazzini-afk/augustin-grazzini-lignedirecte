import { bumpUsage } from "@/lib/usage";
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { apiScope, callScope, scopeClientId } from "@/lib/access";
import { assertActive, assertPremium, jsonError, sameOrigin } from "@/lib/api";
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
  const blocked = (await assertActive(scope)) || (await assertPremium(scope));
  if (blocked) return blocked;
  // Garde-fou de coût : plafond par espace et par jour.
  if ((await bumpUsage(`brief:${scope.orgId}`)) > 30) return jsonError("Limite de 30 briefs par jour atteinte pour votre espace. Elle se remet à zéro demain.", 429);

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
  // Le brief est rédigé en arrière-plan : il se termine et s'enregistre même si la personne quitte la page ou ferme le site.
  const saved = await db.brief.create({ data: { orgId: scope.orgId, clientId, query: b.data.query, prospect: b.data.query, content: {}, createdById: scope.userId, status: "pending" } });
  const offer = client?.offer || org.offer, name = client?.name || org.name;
  after(async () => {
    try {
      const brief = await generateBrief(calls, b.data.query, offer, name, acts);
      await db.brief.update({ where: { id: saved.id }, data: { prospect: brief.prospect || b.data.query, company: brief.entreprise, content: asJson(brief), status: "done" } });
    } catch (e) {
      await db.brief.update({ where: { id: saved.id }, data: { status: "failed", error: e instanceof AiError ? e.message : "La génération a échoué." } }).catch(() => null);
    }
  });
  return NextResponse.json({ id: saved.id, pending: true, calls: calls.length + acts.length });
}

/** Au-delà, un brief encore « en cours » est considéré comme échoué (serveur interrompu). */
const STALE_MS = 4 * 60_000;

/** État d'un brief en cours de rédaction (interrogé par la page tant qu'il n'est pas prêt). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const scope = await apiScope(req, { clientId: u.searchParams.get("clientId") });
  if (!scope) return jsonError("Accès refusé", 403);
  const br = await db.brief.findFirst({ where: { id: u.searchParams.get("id") || "", orgId: scope.orgId, ...(scope.kind === "client" ? { clientId: scope.clientId } : {}) } });
  if (!br) return jsonError("Brief introuvable", 404);
  if (br.status === "pending" && Date.now() - br.createdAt.getTime() > STALE_MS) return NextResponse.json({ status: "failed", error: "La rédaction a été interrompue. Relancez le brief." });
  return NextResponse.json({ status: br.status, error: br.error, brief: br.status === "done" ? br.content : null });
}
