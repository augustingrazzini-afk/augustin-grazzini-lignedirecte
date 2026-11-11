import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope, scopeClientId } from "@/lib/access";
import { jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { taskScope } from "@/lib/tasks";

/** Modifier une relance : faite, ignorée, rouverte, reportée. */
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = z.object({
    id: z.string().max(40),
    action: z.enum(["done", "dismiss", "reopen", "snooze"]),
    days: z.number().int().min(1).max(365).optional(),
    clientId: z.string().nullable().optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Requête invalide");
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const task = await db.task.findFirst({ where: { id: b.data.id, ...taskScope(scope) } });
  if (!task) return jsonError("Relance introuvable", 404);
  const a = b.data.action;
  const data =
    a === "done" ? { status: "done", doneAt: new Date(), doneById: scope.userId }
    : a === "dismiss" ? { status: "dismissed", doneAt: new Date(), doneById: scope.userId }
    : a === "reopen" ? { status: "open", doneAt: null, doneById: null }
    : { status: "open", dueAt: new Date(Math.max(Date.now(), task.dueAt.getTime()) + (b.data.days || 1) * 864e5) };
  await db.task.update({ where: { id: task.id }, data });
  return NextResponse.json({ ok: true });
}

/** Créer une relance à la main depuis une fiche prospect. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = z.object({
    contactKey: z.string().min(1).max(200),
    channel: z.enum(["call", "email", "linkedin"]),
    dueAt: z.string().datetime(),
    reason: z.string().trim().min(2).max(300),
    clientId: z.string().nullable().optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Indiquez une date et un motif.");
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const clientId = scopeClientId(scope);
  const where = { orgId: scope.orgId, contactKey: b.data.contactKey, ...(scope.kind === "client" ? { clientId } : {}) };
  const ref = (await db.call.findFirst({ where, orderBy: { startedAt: "desc" } })) || (await db.activity.findFirst({ where, orderBy: { occurredAt: "desc" } }));
  if (!ref) return jsonError("Prospect introuvable", 404);
  await db.task.create({ data: {
    orgId: scope.orgId, clientId: ref.clientId, contactKey: ref.contactKey, contactName: [ref.firstName, ref.lastName].filter(Boolean).join(" "), company: ref.company,
    channel: b.data.channel, dueAt: new Date(b.data.dueAt), reason: b.data.reason, source: "manual", sourceKind: "manual", sourceId: crypto.randomUUID(),
  } });
  return NextResponse.json({ ok: true });
}
