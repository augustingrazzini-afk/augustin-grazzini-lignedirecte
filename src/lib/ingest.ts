import type { ClientRule, Prisma } from "@prisma/client";
import { db } from "./db";
import { sha256 } from "./crypto";
import type { NormalizedActivity, NormalizedCall } from "./providers/types";
import { closeTasksOnMeeting, draftFromCall, draftFromReply, upsertTask } from "./tasks";
import { aiEnabled } from "./ai-config";

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

/**
 * Identifiant d'un prospect, commun à tous les canaux et tous les outils : prénom + nom + entreprise.
 * À défaut : email, profil LinkedIn, téléphone (toujours hachés, jamais stockés en clair).
 */
export function contactKey(provider: string, c: { firstName?: string; lastName?: string; company?: string; contactRef?: string; phone?: string; email?: string; linkedinUrl?: string; externalId: string }): string {
  const name = norm(`${c.firstName || ""} ${c.lastName || ""}`).replace(/\s+/g, " ").trim();
  if (name && c.lastName && c.company) return `p:${sha256(`${name}|${norm(c.company)}`).slice(0, 20)}`;
  if (c.email) return `e:${sha256(norm(c.email)).slice(0, 20)}`;
  if (c.linkedinUrl) return `l:${sha256(norm(c.linkedinUrl).replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "")).slice(0, 20)}`;
  if (c.contactRef) return `${provider}:${c.contactRef}`;
  if (name) return `p:${sha256(`${name}|${norm(c.company)}`).slice(0, 20)}`;
  if (c.phone) return `t:${sha256(c.phone.replace(/\D/g, "")).slice(0, 20)}`;
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
    let saved;
    if (existing) {
      saved = await db.call.update({
        where: { id: existing.id },
        data: { ...data, clientId: clientId ?? existing.clientId, ...(hasTr && existing.aiStatus !== "done" && existing.aiStatus !== "processing" ? { aiStatus: needsAi } : {}) },
      });
      updated++;
    } else {
      saved = await db.call.create({
        data: { ...(data as Prisma.CallUncheckedCreateInput), orgId: t.orgId, provider: t.provider, externalId: c.externalId, integrationId: t.integrationId ?? null, clientId, aiStatus: needsAi },
      });
      created++;
    }
    await afterCall(saved);
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

/** Relances liées à un appel : RDV pris → on ferme ; sinon règles (l'IA affinera si une transcription arrive). */
export async function afterCall(c: Awaited<ReturnType<typeof db.call.findFirstOrThrow>>) {
  if (c.meetingBooked) return closeTasksOnMeeting(c.orgId, c.contactKey);
  if (c.aiStatus === "pending" && aiEnabled()) return; // l'analyse IA créera la relance
  const d = draftFromCall(c);
  if (d) await upsertTask(c, "call", c.id, d, "rule");
}

/** Enregistre des événements email / LinkedIn. */
export async function upsertActivities(t: Target, items: NormalizedActivity[]): Promise<{ created: number; updated: number }> {
  if (!items.length) return { created: 0, updated: 0 };
  const rules = t.clientId ? [] : await db.clientRule.findMany({ where: { orgId: t.orgId } });
  let created = 0, updated = 0;
  for (const a of items) {
    if (!a.externalId) continue;
    const clientId = routeClient({ externalId: a.externalId, startedAt: a.occurredAt, durationSec: 0, status: "", connected: false, meetingBooked: false, company: a.company, listName: a.campaign, campaign: a.campaign }, t.provider, rules, t.clientId);
    const isReply = a.type === "replied";
    const data = {
      channel: a.channel, type: a.type, occurredAt: a.occurredAt,
      firstName: (a.firstName || "").slice(0, 120), lastName: (a.lastName || "").slice(0, 120), company: (a.company || "").slice(0, 200), jobTitle: (a.jobTitle || "").slice(0, 200),
      contactKey: contactKey(t.provider, a), repName: (a.repName || "").slice(0, 120), campaign: (a.campaign || "").slice(0, 200), step: a.step ?? null,
      subject: (a.subject || "").slice(0, 300), body: (a.body || "").slice(0, 8000),
      ...(a.sentiment ? { sentiment: a.sentiment } : {}),
    };
    const where = { orgId_provider_externalId: { orgId: t.orgId, provider: t.provider, externalId: a.externalId } };
    const existing = await db.activity.findUnique({ where, select: { id: true, clientId: true } });
    let saved;
    if (existing) {
      saved = await db.activity.update({ where: { id: existing.id }, data: { ...data, clientId: clientId ?? existing.clientId } });
      updated++;
    } else {
      const ai = isReply && data.body && !a.sentiment && aiEnabled() ? "pending" : "none";
      saved = await db.activity.create({ data: { ...data, orgId: t.orgId, provider: t.provider, externalId: a.externalId, integrationId: t.integrationId ?? null, clientId, aiStatus: ai } });
      created++;
      if (a.type === "meeting_booked") await closeTasksOnMeeting(t.orgId, saved.contactKey);
      else if (isReply && ai === "none") {
        const d = draftFromReply(saved);
        if (d) await upsertTask(saved, "activity", saved.id, d, "rule");
      }
    }
  }
  return { created, updated };
}
