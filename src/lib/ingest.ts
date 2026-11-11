import type { ClientRule, Prisma } from "@prisma/client";
import { db } from "./db";
import { sha256 } from "./crypto";
import type { NormalizedCall } from "./providers/types";

const norm = (s?: string) => (s || "").trim().toLowerCase();

/** Trouve le client d'un appel : intégration d'un client > règles (liste, campagne, tag, numéro, entreprise). */
export function routeClient(call: NormalizedCall, provider: string, rules: ClientRule[], fixedClientId?: string | null): string | null {
  if (fixedClientId) return fixedClientId;
  for (const r of rules) {
    if (r.provider && r.provider !== provider) continue;
    const v = norm(r.value);
    if (!v) continue;
    const hit =
      (r.field === "list" && norm(call.listName) === v) ||
      (r.field === "campaign" && (norm(call.campaign) === v || norm(call.listName) === v)) ||
      (r.field === "tag" && (call.tags || []).some((t) => norm(t) === v)) ||
      (r.field === "company" && norm(call.company) === v) ||
      (r.field === "number" && !!call.phone && call.phone.replace(/\D/g, "").endsWith(v.replace(/\D/g, "")));
    if (hit) return r.clientId;
  }
  return null;
}

export function contactKey(provider: string, c: NormalizedCall): string {
  if (c.contactRef) return `${provider}:${c.contactRef}`;
  const who = norm(`${c.firstName} ${c.lastName} ${c.company}`).replace(/\s+/g, " ").trim();
  if (who) return `name:${sha256(who).slice(0, 16)}`;
  if (c.phone) return `tel:${sha256(c.phone.replace(/\D/g, "")).slice(0, 16)}`;
  return `${provider}:${c.externalId}`;
}

type Target = { orgId: string; provider: string; integrationId?: string | null; clientId?: string | null };

/** Enregistre (ou met à jour) des appels normalisés. Renvoie le nombre de nouveaux appels. */
export async function upsertCalls(t: Target, calls: NormalizedCall[]): Promise<{ created: number; updated: number }> {
  if (!calls.length) return { created: 0, updated: 0 };
  const rules = t.clientId ? [] : await db.clientRule.findMany({ where: { orgId: t.orgId } });
  let created = 0, updated = 0;
  for (const c of calls) {
    if (!c.externalId) continue;
    const clientId = routeClient(c, t.provider, rules, t.clientId);
    const hasTr = (c.transcript?.length || 0) > 0;
    const needsAi = hasTr && !(c.objections?.length) ? "pending" : c.summary || c.objections?.length ? "done" : "none";
    const data: Prisma.CallUncheckedUpdateInput = {
      startedAt: c.startedAt,
      durationSec: Math.max(0, Math.round(c.durationSec || 0)),
      direction: c.direction ?? null,
      status: c.status.slice(0, 60),
      connected: c.connected,
      meetingBooked: c.meetingBooked,
      kind: c.kind || "call",
      firstName: (c.firstName || "").slice(0, 120),
      lastName: (c.lastName || "").slice(0, 120),
      company: (c.company || "").slice(0, 200),
      jobTitle: (c.jobTitle || "").slice(0, 200),
      contactKey: contactKey(t.provider, c),
      repName: (c.repName || "").slice(0, 120),
      listName: (c.listName || "").slice(0, 200),
      campaign: (c.campaign || "").slice(0, 200),
      tags: (c.tags || []).slice(0, 20),
      phoneLast4: c.phone ? c.phone.replace(/\D/g, "").slice(-4) : "",
      ...(c.summary !== undefined && c.summary !== "" ? { summary: c.summary.slice(0, 8000) } : {}),
      ...(c.objections?.length ? { objections: c.objections.slice(0, 10) } : {}),
      ...(c.objDetails?.length ? { objDetails: c.objDetails as unknown as Prisma.InputJsonValue } : {}),
      ...(hasTr ? { transcript: c.transcript as unknown as Prisma.InputJsonValue } : {}),
      ...(c.recordingUrl ? { recordingUrl: c.recordingUrl } : {}),
    };
    const where = { orgId_provider_externalId: { orgId: t.orgId, provider: t.provider, externalId: c.externalId } };
    const existing = await db.call.findUnique({ where, select: { id: true, aiStatus: true, clientId: true } });
    if (existing) {
      await db.call.update({
        where: { id: existing.id },
        data: { ...data, clientId: clientId ?? existing.clientId, ...(hasTr && existing.aiStatus !== "done" ? { aiStatus: needsAi } : {}) },
      });
      updated++;
    } else {
      await db.call.create({
        data: { ...(data as Prisma.CallUncheckedCreateInput), orgId: t.orgId, provider: t.provider, externalId: c.externalId, integrationId: t.integrationId ?? null, clientId, aiStatus: needsAi },
      });
      created++;
    }
  }
  return { created, updated };
}

/** Réapplique les règles aux appels existants non rangés (après création d'une règle). */
export async function reapplyRules(orgId: string) {
  const rules = await db.clientRule.findMany({ where: { orgId } });
  if (!rules.length) return 0;
  const calls = await db.call.findMany({ where: { orgId, clientId: null }, select: { id: true, provider: true, listName: true, campaign: true, tags: true, company: true } });
  let n = 0;
  for (const c of calls) {
    const cid = routeClient({ externalId: "", startedAt: new Date(), durationSec: 0, status: "", connected: false, meetingBooked: false, listName: c.listName, campaign: c.campaign, tags: c.tags, company: c.company }, c.provider, rules);
    if (cid) { await db.call.update({ where: { id: c.id }, data: { clientId: cid } }); n++; }
  }
  return n;
}
