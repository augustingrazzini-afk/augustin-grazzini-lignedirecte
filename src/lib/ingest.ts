import type { ClientRule, Prisma } from "@prisma/client";
import { sealContact } from "./contact";
import { db } from "./db";
import { sha256 } from "./crypto";
import type { NormalizedActivity, NormalizedCall } from "./providers/types";
import { RE_OPTOUT, closeTasksOnMeeting, draftFromCall, draftFromReply, markOptOut, upsertTask } from "./tasks";
import { aiEnabled } from "./ai-config";

const norm = (s?: string) => (s || "").trim().toLowerCase();

/** Trouve le commercial d'un appel (modèle « Client ») : outil branché par le commercial > règles (nom du commercial, liste, campagne, tag, numéro, entreprise). */
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
      (r.field === "rep" && norm(call.repName) === v) ||
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

/** Un rendez-vous compte une fois par prospect : fenêtre pendant laquelle un nouvel appel « rendez-vous » est un suivi. */
const SAME_MEETING_DAYS = 30;
const RE_RESCHED = /(report[ée]|d[ée]cal[ée]|replanifi|recal[ée]|d[ée]plac[ée]|reprogramm)/i;
/** Statut d'un appel que l'outil marque « rendez-vous » alors que le rendez-vous de ce prospect est déjà compté. */
export const followStatus = (summary?: string) => (RE_RESCHED.test(summary || "") ? "meeting-rescheduled" : "meeting-followup");

/** Empreinte d'un appel tel que l'outil l'envoie (et du commercial à qui il revient). */
export const callHash = (c: NormalizedCall, clientId: string | null | undefined) => sha256(JSON.stringify([2, clientId ?? null, c])).slice(0, 32);

/**
 * Enregistre (ou met à jour) des appels normalisés. Renvoie le nombre de nouveaux appels.
 * Les appels déjà connus sont lus en une seule requête, et un appel inchangé depuis la dernière synchro n'est ni
 * réécrit ni retraité (les outils renvoient toute la journée à chaque passage). `partial` : complément d'un appel
 * (transcription…), toujours appliqué et sans toucher à l'empreinte.
 */
export async function upsertCalls(t: Target, calls: NormalizedCall[], opts: { partial?: boolean } = {}): Promise<{ created: number; updated: number; unchanged: number }> {
  if (!calls.length) return { created: 0, updated: 0, unchanged: 0 };
  const rules = t.clientId ? [] : await db.clientRule.findMany({ where: { orgId: t.orgId } });
  const known = new Map((await db.call.findMany({
    where: { orgId: t.orgId, provider: t.provider, externalId: { in: calls.map((c) => c.externalId).filter(Boolean) } },
    select: { id: true, externalId: true, aiStatus: true, clientId: true, syncHash: true, meetingManual: true },
  })).map((r) => [r.externalId, r]));
  let created = 0, updated = 0, unchanged = 0;
  for (const c of calls) {
    if (!c.externalId) continue;
    const clientId = routeClient(c, t.provider, rules, t.clientId);
    const existing = known.get(c.externalId);
    const hash = opts.partial ? undefined : callHash(c, clientId);
    if (existing && hash && existing.syncHash === hash) { unchanged++; continue; }
    const hasTr = (c.transcript?.length || 0) > 0;
    // L'outil marque « rendez-vous pris » sur chaque appel d'un prospect qui a un rendez-vous (y compris quand on l'appelle
    // pour le décaler) : s'il est déjà compté dans les 30 jours précédents, cet appel est un suivi, pas un nouveau rendez-vous.
    const key = contactKey(t.provider, c), isCall = (c.kind || "call") === "call";
    let booked = c.meetingBooked, status = c.status;
    if (booked && isCall && !opts.partial) {
      const prior = await db.call.findFirst({
        where: { orgId: t.orgId, contactKey: key, kind: "call", meetingBooked: true, NOT: { provider: t.provider, externalId: c.externalId },
          startedAt: { lt: c.startedAt, gt: new Date(c.startedAt.getTime() - SAME_MEETING_DAYS * 864e5) } },
        select: { id: true },
      });
      if (prior) { booked = false; status = followStatus(c.summary); }
    }
    const needsAi = hasTr && !(c.objections?.length) ? "pending" : c.summary || c.objections?.length ? "done" : "none";
    const data: Prisma.CallUncheckedUpdateInput = {
      startedAt: c.startedAt,
      durationSec: Math.max(0, Math.round(c.durationSec || 0)),
      direction: c.direction ?? null,
      status: status.slice(0, 60),
      connected: c.connected,
      meetingBooked: booked,
      kind: c.kind || "call",
      firstName: (c.firstName || "").slice(0, 120),
      lastName: (c.lastName || "").slice(0, 120),
      company: (c.company || "").slice(0, 200),
      jobTitle: (c.jobTitle || "").slice(0, 200),
      contactKey: key,
      repName: (c.repName || "").slice(0, 120),
      listName: (c.listName || "").slice(0, 200),
      campaign: (c.campaign || "").slice(0, 200),
      tags: (c.tags || []).slice(0, 20),
      phoneLast4: c.phone ? c.phone.replace(/\D/g, "").slice(-4) : "",
      // Coordonnées du prospect : chiffrées, lisibles seulement dans l'appli par l'entreprise et le commercial concerné.
      ...(c.phone || c.email ? { contactSealed: sealContact(c.phone, c.email) } : {}),
      ...(c.summary !== undefined && c.summary !== "" ? { summary: c.summary.slice(0, 8000) } : {}),
      ...(c.objections?.length ? { objections: c.objections.slice(0, 10) } : {}),
      ...(c.objDetails?.length ? { objDetails: c.objDetails as unknown as Prisma.InputJsonValue } : {}),
      ...(hasTr ? { transcript: c.transcript as unknown as Prisma.InputJsonValue } : {}),
      ...(c.recordingUrl ? { recordingUrl: c.recordingUrl } : {}),
    };
    if (hash) data.syncHash = hash;
    // Décision prise à la main sur la fiche (compter ou non ce rendez-vous) : la synchro la respecte.
    if (existing && existing.meetingManual != null) { delete data.meetingBooked; delete data.status; }
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
    known.set(c.externalId, { id: saved.id, externalId: c.externalId, aiStatus: saved.aiStatus, clientId: saved.clientId, syncHash: saved.syncHash, meetingManual: saved.meetingManual });
    // Les appels arrivent parfois du plus récent au plus ancien : si ce rendez-vous est le premier du prospect,
    // ses appels « rendez-vous » plus récents (déjà enregistrés) deviennent des suivis.
    if (saved.meetingBooked && isCall && !opts.partial) {
      const later = await db.call.findMany({
        where: { orgId: t.orgId, contactKey: key, kind: "call", meetingBooked: true, meetingManual: null, id: { not: saved.id },
          startedAt: { gt: saved.startedAt, lt: new Date(saved.startedAt.getTime() + SAME_MEETING_DAYS * 864e5) } },
        select: { id: true, summary: true },
      });
      for (const l of later) await db.call.update({ where: { id: l.id }, data: { meetingBooked: false, status: followStatus(l.summary) } });
    }
    await afterCall(saved);
  }
  return { created, updated, unchanged };
}

/** Réapplique les règles aux appels existants non rangés (après création d'une règle). */
export async function reapplyRules(orgId: string) {
  const rules = await db.clientRule.findMany({ where: { orgId } });
  if (!rules.length) return 0;
  const calls = await db.call.findMany({ where: { orgId, clientId: null }, select: { id: true, provider: true, listName: true, campaign: true, tags: true, company: true, repName: true } });
  let n = 0;
  for (const c of calls) {
    const cid = routeClient({ externalId: "", startedAt: new Date(), durationSec: 0, status: "", connected: false, meetingBooked: false, listName: c.listName, campaign: c.campaign, tags: c.tags, company: c.company, repName: c.repName }, c.provider, rules);
    if (cid) { await db.call.update({ where: { id: c.id }, data: { clientId: cid } }); n++; }
  }
  return n;
}

/** Relances liées à un appel : RDV pris → on ferme ; sinon règles (l'IA affinera si une transcription arrive). */
export async function afterCall(c: Awaited<ReturnType<typeof db.call.findFirstOrThrow>>) {
  // Rendez-vous pris, ou suivi d'un rendez-vous déjà compté (report, confirmation) : pas de relance à proposer.
  if (c.meetingBooked || c.status.startsWith("meeting-")) return closeTasksOnMeeting(c.orgId, c.contactKey);
  // Opposition repérée dans le résumé de l'outil d'appel : on la garde et on retire les relances de ce prospect.
  if (!c.optOut && c.summary && RE_OPTOUT.test(c.summary)) {
    await db.call.update({ where: { id: c.id }, data: { optOut: true } });
    return markOptOut(c.orgId, c.contactKey);
  }
  if (c.optOut) return;
  if (c.aiStatus === "pending" && aiEnabled()) return; // l'analyse IA créera la relance
  const d = draftFromCall(c);
  if (d) await upsertTask(c, "call", c.id, d, "rule");
}

/** Enregistre des événements email / LinkedIn. */
export async function upsertActivities(t: Target, items: NormalizedActivity[]): Promise<{ created: number; updated: number }> {
  if (!items.length) return { created: 0, updated: 0 };
  const rules = t.clientId ? [] : await db.clientRule.findMany({ where: { orgId: t.orgId } });
  const known = new Map((await db.activity.findMany({
    where: { orgId: t.orgId, provider: t.provider, externalId: { in: items.map((a) => a.externalId).filter(Boolean) } },
    select: { id: true, externalId: true, clientId: true, type: true, occurredAt: true, subject: true, body: true, campaign: true, contactKey: true, repName: true, sentiment: true },
  })).map((r) => [r.externalId, r]));
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
    const existing = known.get(a.externalId);
    // Événement déjà enregistré à l'identique : rien à réécrire.
    if (existing && existing.type === data.type && existing.occurredAt.getTime() === data.occurredAt.getTime() && existing.subject === data.subject && existing.body === data.body
      && existing.campaign === data.campaign && existing.contactKey === data.contactKey && existing.repName === data.repName && (clientId ?? existing.clientId) === existing.clientId && (!a.sentiment || a.sentiment === existing.sentiment)) continue;
    let saved;
    if (existing) {
      saved = await db.activity.update({ where: { id: existing.id }, data: { ...data, clientId: clientId ?? existing.clientId } });
      updated++;
    } else {
      const ai = isReply && data.body && !a.sentiment && aiEnabled() ? "pending" : "none";
      saved = await db.activity.create({ data: { ...data, orgId: t.orgId, provider: t.provider, externalId: a.externalId, integrationId: t.integrationId ?? null, clientId, aiStatus: ai } });
      created++;
      if (a.type === "meeting_booked") await closeTasksOnMeeting(t.orgId, saved.contactKey);
      else if (a.type === "unsubscribed") await markOptOut(t.orgId, saved.contactKey);
      else if (isReply && ai === "none") {
        const d = draftFromReply(saved);
        if (d) await upsertTask(saved, "activity", saved.id, d, "rule");
      }
    }
  }
  return { created, updated };
}
