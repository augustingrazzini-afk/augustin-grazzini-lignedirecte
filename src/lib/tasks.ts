import type { Activity, Call, Prisma } from "@prisma/client";
import { db } from "./db";

const TZ_OFFSET_H = 9; // relances posées à 9 h (heure de Paris approximative)
const MONTHS: Record<string, number> = { janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, décembre: 11 };
const WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12 };

const at9 = (d: Date) => { const x = new Date(d); x.setUTCHours(TZ_OFFSET_H - 1, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
function addMonths(d: Date, n: number) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; }
/** Ramène un week-end au lundi suivant. */
function workday(d: Date) { const w = d.getUTCDay(); return w === 6 ? addDays(d, 2) : w === 0 ? addDays(d, 1) : d; }

/**
 * Déduit une date de relance d'un texte (« rappeler en mars », « dans 6 mois », « la semaine prochaine »…).
 * Renvoie null si le texte ne parle d'aucun moment.
 */
export function parseDue(text: string, from: Date): Date | null {
  const t = text.toLowerCase();
  let m = t.match(/dans\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze)\s+(jours?|semaines?|mois|ans?|années?)/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : WORDS[m[1]];
    const u = m[2];
    const d = u.startsWith("jour") ? addDays(from, n) : u.startsWith("semaine") ? addDays(from, 7 * n) : u === "mois" ? addMonths(from, n) : addMonths(from, 12 * n);
    return workday(at9(d));
  }
  m = t.match(/(?:en|début|fin|courant|mi-?)\s*(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+(20\d\d))?/);
  if (m) {
    const month = MONTHS[m[1]];
    let year = m[2] ? +m[2] : from.getUTCFullYear();
    if (!m[2] && (month < from.getUTCMonth() || (month === from.getUTCMonth()))) year++;
    const day = /fin/.test(m[0]) ? 25 : /mi/.test(m[0]) ? 15 : 1;
    return workday(at9(new Date(Date.UTC(year, month, day))));
  }
  if (/semaine prochaine/.test(t)) return workday(at9(addDays(from, 7)));
  if (/mois prochain/.test(t)) return workday(at9(addMonths(from, 1)));
  if (/(l'|l’)ann[ée]e prochaine|dans un an/.test(t)) return workday(at9(addMonths(from, 12)));
  if (/demain/.test(t)) return workday(at9(addDays(from, 1)));
  m = t.match(/\b(202[6-9]|203\d)\b/);
  if (m && +m[1] > from.getUTCFullYear()) return workday(at9(new Date(Date.UTC(+m[1], 0, 15))));
  m = t.match(/(?:jusqu'au|retour le|de retour le|absent[e]? jusqu'au)\s+(\d{1,2})(?:[/.](\d{1,2}))?/);
  if (m) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), m[2] ? +m[2] - 1 : from.getUTCMonth(), +m[1]));
    if (d < from) d.setUTCMonth(d.getUTCMonth() + (m[2] ? 12 : 1));
    return workday(at9(addDays(d, 1)));
  }
  return null;
}

const RE_RECALL = /rappel|rappeler|recontact|revenir vers|relancer|follow.?up|call back|plus tard|ultérieurement/i;
const RE_SEND = /(envoy|envoi|transmet|recevoir|partager).{0,40}(mail|e-mail|email|slides|plaquette|documentation|présentation|devis|proposition|infos?)/i;
const RE_NO = /demande explicite de ne pas|ne (plus|pas) (le |la |les )?(re)?contacter|ne pas (être )?recontact|stop|désinscri|pas intéressé du tout/i;

export type TaskDraft = { channel: "call" | "email" | "linkedin"; dueAt: Date; reason: string; suggestion?: string };

/** Relance déduite d'un appel par des règles simples (utilisé quand l'IA n'est pas disponible). */
export function draftFromCall(c: Pick<Call, "summary" | "startedAt" | "meetingBooked">): TaskDraft | null {
  const s = c.summary || "";
  if (!s || c.meetingBooked || RE_NO.test(s)) return null;
  const due = parseDue(s, c.startedAt);
  if (RE_SEND.test(s)) return { channel: "email", dueAt: due && due > c.startedAt && !RE_RECALL.test(s) ? due : workday(at9(addDays(c.startedAt, 1))), reason: firstLine(s, RE_SEND) || "Email demandé pendant l'appel" };
  if (RE_RECALL.test(s) || due) return { channel: "call", dueAt: due || workday(at9(addDays(c.startedAt, 7))), reason: firstLine(s, RE_RECALL) || "Rappel demandé" };
  return null;
}

/** Relance déduite d'une réponse email / LinkedIn par des règles simples. */
export function draftFromReply(a: Pick<Activity, "body" | "occurredAt" | "channel" | "sentiment">): TaskDraft | null {
  const b = a.body || "";
  if (RE_NO.test(b) || a.sentiment === "negative") return null;
  const ch = a.channel === "linkedin" ? "linkedin" : "email";
  const due = parseDue(b, a.occurredAt);
  if (a.sentiment === "ooo") return { channel: ch, dueAt: due || workday(at9(addDays(a.occurredAt, 7))), reason: "Absent : relancer à son retour" };
  if (due) return { channel: ch, dueAt: due, reason: "A demandé à être recontacté plus tard" };
  if (a.sentiment === "positive") return { channel: ch, dueAt: workday(at9(addDays(a.occurredAt, 1))), reason: "Réponse positive : proposer un créneau" };
  return null;
}

function firstLine(s: string, re: RegExp) {
  return s.split("\n").map((l) => l.replace(/^-\s*/, "").trim()).find((l) => re.test(l))?.slice(0, 200) || "";
}

type Who = { orgId: string; clientId: string | null; contactKey: string; firstName: string; lastName: string; company: string };

/** Crée la relance d'une source (appel, réponse…) — une seule par source, jamais recréée si on l'a fermée. */
export async function upsertTask(who: Who, sourceKind: "call" | "activity" | "rule", sourceId: string, d: TaskDraft, source: "ai" | "rule") {
  if (!who.contactKey) return;
  const data = {
    clientId: who.clientId, contactKey: who.contactKey, contactName: [who.firstName, who.lastName].filter(Boolean).join(" "), company: who.company,
    channel: d.channel, dueAt: d.dueAt, reason: d.reason.slice(0, 300), suggestion: (d.suggestion || "").slice(0, 1500), source,
  };
  const existing = await db.task.findUnique({ where: { orgId_sourceKind_sourceId: { orgId: who.orgId, sourceKind, sourceId } } });
  if (existing) {
    if (existing.status === "open") await db.task.update({ where: { id: existing.id }, data });
    return;
  }
  // Une relance déjà ouverte pour ce contact sur le même canal suffit.
  const dup = await db.task.findFirst({ where: { orgId: who.orgId, contactKey: who.contactKey, channel: d.channel, status: "open" } });
  if (dup) return;
  await db.task.create({ data: { ...data, orgId: who.orgId, sourceKind, sourceId } });
}

/** Ferme les relances ouvertes d'un contact quand un RDV est pris. */
export async function closeTasksOnMeeting(orgId: string, contactKey: string) {
  if (!contactKey) return;
  await db.task.updateMany({ where: { orgId, contactKey, status: "open" }, data: { status: "done", doneAt: new Date() } });
}

/**
 * Règles automatiques, lancées chaque nuit :
 * - LinkedIn : invitation acceptée depuis 2 jours, sans message envoyé ensuite → envoyer un message.
 * - Email/LinkedIn : réponse positive depuis 2 jours sans RDV → proposer un créneau (si aucune relance n'existe).
 */
export async function generateRuleTasks(orgId: string) {
  const since = new Date(Date.now() - 30 * 864e5), cutoff = new Date(Date.now() - 2 * 864e5);
  let n = 0;
  const accepted = await db.activity.findMany({ where: { orgId, channel: "linkedin", type: "invite_accepted", occurredAt: { gte: since, lte: cutoff } } });
  for (const a of accepted) {
    const after = await db.activity.count({ where: { orgId, contactKey: a.contactKey, channel: "linkedin", type: { in: ["message_sent", "replied"] }, occurredAt: { gt: a.occurredAt } } });
    const meeting = await db.call.count({ where: { orgId, contactKey: a.contactKey, meetingBooked: true } });
    if (after || meeting) continue;
    await upsertTask(a, "rule", `li-accept:${a.id}`, { channel: "linkedin", dueAt: workday(at9(new Date())), reason: "Invitation LinkedIn acceptée, aucun message envoyé" }, "rule");
    n++;
  }
  return n;
}

export const taskScope = (s: { kind: "org" | "client"; orgId: string; clientId?: string | null; clientFilter?: string | null }): Prisma.TaskWhereInput =>
  s.kind === "client" ? { orgId: s.orgId, clientId: s.clientId } : s.clientFilter ? { orgId: s.orgId, clientId: s.clientFilter === "none" ? null : s.clientFilter } : { orgId: s.orgId };
