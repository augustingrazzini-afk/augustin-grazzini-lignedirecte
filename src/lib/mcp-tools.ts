import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { sha256 } from "./crypto";

/**
 * Outils du connecteur Claude. Tout est limité à l'organisation du jeton (orgId) :
 * aucune requête ne lit ni n'écrit hors de cet espace.
 */
type Ctx = { orgId: string; userId: string };
type Args = Record<string, unknown>;
type Out = { text: string; data?: unknown };

const TZ = "Europe/Paris";
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };

/** Décalage de Paris (en minutes) à une date donnée : +60 l'hiver, +120 l'été. */
function parisOffset(d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "GMT+1";
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(s);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0) : 60;
}
const parisDay = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: TZ }).format(d); // AAAA-MM-JJ
/** Minuit (heure de Paris) du jour AAAA-MM-JJ, en UTC. */
function parisMidnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - parisOffset(guess) * 60e3);
}
/** Date d'échéance : AAAA-MM-JJ (9 h à Paris) ou date-heure ISO. */
function parseDue(v: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(parisMidnight(v).getTime() + 9 * 3600e3);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const fmt = (d: Date) => d.toLocaleString("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const CHANNEL: Record<string, string> = { call: "appel", email: "email", linkedin: "LinkedIn" };
const STATUS: Record<string, string> = { open: "à faire", done: "faite", dismissed: "ignorée" };

/** Client désigné par son identifiant ou par son nom (insensible à la casse). */
async function findClient(orgId: string, ref: string) {
  if (!ref) return null;
  return (await db.client.findFirst({ where: { orgId, id: ref } })) || (await db.client.findFirst({ where: { orgId, name: { equals: ref, mode: "insensitive" } } })) || (await db.client.findFirst({ where: { orgId, name: { contains: ref, mode: "insensitive" } } }));
}

export const TOOLS = [
  {
    name: "lister_relances",
    title: "Lister les relances",
    description: "Liste les relances (rappels de prospects) de l'espace Trustpipe : à faire, en retard, du jour, de la semaine. Chaque relance a un identifiant, le prospect, l'entreprise, la date, le canal, le motif et une suggestion.",
    inputSchema: { type: "object", properties: {
      statut: { type: "string", enum: ["a_faire", "faites", "ignorees", "toutes"], description: "Par défaut : a_faire" },
      echeance: { type: "string", enum: ["en_retard", "aujourd_hui", "semaine", "toutes"], description: "Par défaut : toutes" },
      client: { type: "string", description: "Nom ou identifiant d'un client pour filtrer (facultatif)" },
      recherche: { type: "string", description: "Nom du prospect ou de l'entreprise (facultatif)" },
      limite: { type: "integer", minimum: 1, maximum: 100, description: "Par défaut : 30" },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "creer_relance",
    title: "Créer une relance",
    description: "Crée une relance pour un prospect à une date donnée. Si le prospect a déjà été appelé, la relance est rattachée à sa fiche et à son client.",
    inputSchema: { type: "object", required: ["prospect", "date", "motif"], properties: {
      prospect: { type: "string", description: "Nom du prospect (prénom nom)" },
      entreprise: { type: "string", description: "Entreprise du prospect (facultatif mais recommandé)" },
      date: { type: "string", description: "AAAA-MM-JJ (relance à 9 h, heure de Paris) ou date-heure ISO 8601" },
      motif: { type: "string", description: "Pourquoi relancer, en une phrase" },
      canal: { type: "string", enum: ["call", "email", "linkedin"], description: "Par défaut : call" },
      client: { type: "string", description: "Nom ou identifiant du client concerné (facultatif)" },
    } },
  },
  {
    name: "modifier_relance",
    title: "Modifier une relance",
    description: "Marque une relance comme faite, l'ignore, la rouvre ou la reporte (d'un nombre de jours ou à une nouvelle date).",
    inputSchema: { type: "object", required: ["id", "action"], properties: {
      id: { type: "string", description: "Identifiant de la relance (donné par lister_relances)" },
      action: { type: "string", enum: ["faite", "ignorer", "rouvrir", "reporter"] },
      jours: { type: "integer", minimum: 1, maximum: 365, description: "Pour reporter : nombre de jours" },
      nouvelle_date: { type: "string", description: "Pour reporter : AAAA-MM-JJ ou date-heure ISO" },
      motif: { type: "string", description: "Nouveau motif (facultatif)" },
    } },
  },
  {
    name: "historique_prospect",
    title: "Historique d'un prospect",
    description: "Retrouve un prospect par son nom ou son entreprise : ses derniers appels (date, durée, résumé IA, rendez-vous pris) et ses relances. Utile pour préparer une relance.",
    inputSchema: { type: "object", required: ["recherche"], properties: {
      recherche: { type: "string", description: "Nom du prospect ou de l'entreprise" },
      limite: { type: "integer", minimum: 1, maximum: 20, description: "Nombre d'appels, par défaut 5" },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "lister_clients",
    title: "Lister les clients",
    description: "Liste les clients de l'espace Trustpipe, avec le nombre d'appels des 7 derniers jours et de relances à faire.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
] as const;

async function listerRelances(c: Ctx, a: Args): Promise<Out> {
  const statut = str(a.statut) || "a_faire", echeance = str(a.echeance) || "toutes", limit = num(a.limite, 30, 1, 100);
  const where: Prisma.TaskWhereInput = { orgId: c.orgId };
  if (statut !== "toutes") where.status = statut === "faites" ? "done" : statut === "ignorees" ? "dismissed" : "open";
  const today = parisMidnight(parisDay(new Date())), tomorrow = new Date(today.getTime() + 864e5);
  if (echeance === "en_retard") where.dueAt = { lt: today };
  else if (echeance === "aujourd_hui") where.dueAt = { gte: today, lt: tomorrow };
  else if (echeance === "semaine") where.dueAt = { lt: new Date(today.getTime() + 7 * 864e5) };
  if (str(a.client)) {
    const cl = await findClient(c.orgId, str(a.client));
    if (!cl) return { text: `Aucun client « ${str(a.client)} » dans cet espace.` };
    where.clientId = cl.id;
  }
  const q = str(a.recherche, 100);
  if (q) where.OR = [{ contactName: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }];
  const rows = await db.task.findMany({ where, orderBy: { dueAt: "asc" }, take: limit, include: { client: { select: { name: true } } } });
  if (!rows.length) return { text: "Aucune relance pour ces critères.", data: [] };
  const data = rows.map((t) => ({ id: t.id, prospect: t.contactName, entreprise: t.company, client: t.client?.name || null, date: t.dueAt.toISOString(), date_paris: fmt(t.dueAt), en_retard: t.status === "open" && t.dueAt < today, canal: t.channel, motif: t.reason, suggestion: t.suggestion, statut: STATUS[t.status] || t.status }));
  const lines = data.map((t) => `• [${t.id}] ${t.date_paris}${t.en_retard ? " (en retard)" : ""} · ${t.prospect || "?"}${t.entreprise ? ` (${t.entreprise})` : ""} · ${CHANNEL[t.canal] || t.canal}${t.client ? ` · client ${t.client}` : ""} · ${t.statut}\n  ${t.motif}${t.suggestion ? `\n  Suggestion : ${t.suggestion}` : ""}`);
  return { text: `${rows.length} relance(s) :\n${lines.join("\n")}`, data };
}

async function creerRelance(c: Ctx, a: Args): Promise<Out> {
  const name = str(a.prospect, 120), company = str(a.entreprise, 120), reason = str(a.motif, 300);
  const due = parseDue(str(a.date, 40));
  const channel = ["call", "email", "linkedin"].includes(str(a.canal)) ? str(a.canal) : "call";
  if (!name || reason.length < 2) return { text: "Il faut au moins le nom du prospect et un motif." };
  if (!due) return { text: "Date invalide : utilisez AAAA-MM-JJ ou une date-heure ISO." };
  let clientId: string | null = null;
  if (str(a.client)) {
    const cl = await findClient(c.orgId, str(a.client));
    if (!cl) return { text: `Aucun client « ${str(a.client)} » dans cet espace.` };
    clientId = cl.id;
  }
  // Rattachement au prospect déjà appelé, s'il existe.
  const [first, ...rest] = name.split(/\s+/);
  const last = rest.join(" ");
  const nameMatch: Prisma.CallWhereInput = last
    ? { firstName: { equals: first, mode: "insensitive" }, lastName: { equals: last, mode: "insensitive" } }
    : { OR: [{ firstName: { equals: first, mode: "insensitive" } }, { lastName: { equals: first, mode: "insensitive" } }] };
  const ref = await db.call.findFirst({ where: { orgId: c.orgId, ...nameMatch, ...(company ? { company: { contains: company, mode: "insensitive" } } : {}), ...(clientId ? { clientId } : {}) }, orderBy: { startedAt: "desc" } });
  const t = await db.task.create({ data: {
    orgId: c.orgId, clientId: clientId ?? ref?.clientId ?? null,
    contactKey: ref?.contactKey || `m:${sha256(`${name.toLowerCase()}|${company.toLowerCase()}`).slice(0, 20)}`,
    contactName: ref ? [ref.firstName, ref.lastName].filter(Boolean).join(" ") : name, company: ref?.company || company,
    channel, dueAt: due, reason, source: "manual", sourceKind: "manual", sourceId: crypto.randomUUID(),
  } });
  return { text: `Relance créée [${t.id}] : ${t.contactName}${t.company ? ` (${t.company})` : ""}, ${fmt(due)}, par ${CHANNEL[channel]}.${ref ? " Rattachée à la fiche du prospect." : " Prospect pas encore appelé : relance créée sans fiche d'appel."}`, data: { id: t.id } };
}

async function modifierRelance(c: Ctx, a: Args): Promise<Out> {
  const t = await db.task.findFirst({ where: { id: str(a.id, 40), orgId: c.orgId } });
  if (!t) return { text: "Relance introuvable dans cet espace." };
  const act = str(a.action), now = new Date();
  let data: Prisma.TaskUpdateInput;
  if (act === "faite") data = { status: "done", doneAt: now, doneById: c.userId };
  else if (act === "ignorer") data = { status: "dismissed", doneAt: now, doneById: c.userId };
  else if (act === "rouvrir") data = { status: "open", doneAt: null, doneById: null };
  else if (act === "reporter") {
    const nd = str(a.nouvelle_date) ? parseDue(str(a.nouvelle_date, 40)) : new Date(Math.max(now.getTime(), t.dueAt.getTime()) + num(a.jours, 1, 1, 365) * 864e5);
    if (!nd) return { text: "Nouvelle date invalide." };
    data = { status: "open", dueAt: nd, doneAt: null, doneById: null };
  } else return { text: "Action inconnue : faite, ignorer, rouvrir ou reporter." };
  if (str(a.motif)) data.reason = str(a.motif, 300);
  const u = await db.task.update({ where: { id: t.id }, data });
  return { text: `Relance ${u.contactName || u.id} : ${STATUS[u.status]}${u.status === "open" ? `, prévue ${fmt(u.dueAt)}` : ""}.` };
}

async function historiqueProspect(c: Ctx, a: Args): Promise<Out> {
  const q = str(a.recherche, 100);
  if (q.length < 2) return { text: "Indiquez au moins 2 caractères." };
  const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const calls = await db.call.findMany({
    where: { orgId: c.orgId, AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { company: { contains: w, mode: "insensitive" as const } }] })) },
    orderBy: { startedAt: "desc" }, take: num(a.limite, 5, 1, 20), include: { client: { select: { name: true } } },
  });
  const keys = [...new Set(calls.map((x) => x.contactKey))];
  const tasks = keys.length ? await db.task.findMany({ where: { orgId: c.orgId, contactKey: { in: keys } }, orderBy: { dueAt: "asc" }, take: 20 }) : [];
  if (!calls.length && !tasks.length) return { text: `Aucun appel trouvé pour « ${q} ».` };
  const cl = calls.map((x) => `• ${fmt(x.startedAt)} · ${[x.firstName, x.lastName].filter(Boolean).join(" ") || "?"}${x.company ? ` (${x.company})` : ""}${x.client ? ` · client ${x.client.name}` : ""} · ${x.connected ? `conversation ${Math.floor(x.durationSec / 60)} min ${x.durationSec % 60} s` : x.status}${x.meetingBooked ? " · RDV PRIS" : ""}${x.summary ? `\n  ${x.summary.replace(/\s+/g, " ").slice(0, 600)}` : ""}`);
  const tl = tasks.map((t) => `• [${t.id}] ${fmt(t.dueAt)} · ${STATUS[t.status]} · ${t.reason}`);
  return { text: `Appels :\n${cl.join("\n") || "aucun"}\n\nRelances :\n${tl.join("\n") || "aucune"}` };
}

async function listerClients(c: Ctx): Promise<Out> {
  const since = new Date(Date.now() - 7 * 864e5);
  const clients = await db.client.findMany({ where: { orgId: c.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  if (!clients.length) return { text: "Aucun client dans cet espace." };
  const [calls, tasks] = await Promise.all([
    db.call.groupBy({ by: ["clientId"], where: { orgId: c.orgId, startedAt: { gte: since } }, _count: { _all: true } }),
    db.task.groupBy({ by: ["clientId"], where: { orgId: c.orgId, status: "open" }, _count: { _all: true } }),
  ]);
  const cc = new Map(calls.map((x) => [x.clientId, x._count._all])), tc = new Map(tasks.map((x) => [x.clientId, x._count._all]));
  const data = clients.map((x) => ({ id: x.id, nom: x.name, appels_7j: cc.get(x.id) || 0, relances_a_faire: tc.get(x.id) || 0 }));
  return { text: data.map((x) => `• ${x.nom} [${x.id}] · ${x.appels_7j} appels sur 7 jours · ${x.relances_a_faire} relance(s) à faire`).join("\n"), data };
}

export async function callTool(name: string, args: Args, ctx: Ctx): Promise<Out | null> {
  switch (name) {
    case "lister_relances": return listerRelances(ctx, args);
    case "creer_relance": return creerRelance(ctx, args);
    case "modifier_relance": return modifierRelance(ctx, args);
    case "historique_prospect": return historiqueProspect(ctx, args);
    case "lister_clients": return listerClients(ctx);
    default: return null;
  }
}
