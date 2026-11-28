import { cache } from "react";
import { Prisma, type Call } from "@prisma/client";
import { db } from "./db";
import { callScope, type Scope } from "./access";
import { dayKey, hourParis, isConversation, weekdayParis } from "./format";
import { periodStart } from "./period";

export type Stats = {
  total: number; connected: number; conversations: number; meetings: number; talkSec: number;
  connectRate: number; convToMeeting: number; avgConvSec: number;
  objections: { key: string; count: number; passedRate: number | null }[];
  daily: { day: string; conversations: number; meetings: number }[];
  heat: Record<string, number>;
  /** Par créneau « jour-heure » (lun-ven, 8h-19h, heure de Paris) : appels passés et appels décrochés. */
  slots: Record<string, { calls: number; connected: number }>;
  reps: { name: string; total: number; connected: number; conversations: number; meetings: number }[];
  lastCallAt: Date | null;
};

/** Appels de la période. Mémorisé le temps d'un affichage : le classement et le tableau de bord partagent la même lecture. */
/**
 * Les transcriptions et débriefs ne sont PAS chargés ici : sur des milliers d'appels ils pèsent des dizaines de Mo
 * et faisaient tomber la page d'accueil de l'appli (mémoire du serveur dépassée). Les chiffres n'en ont pas besoin.
 */
export const windowCalls = cache(async (scope: Scope, days: number): Promise<Call[]> => {
  const rows = await db.call.findMany({
    where: { ...callScope(scope), startedAt: { gte: periodStart(days) } },
    orderBy: { startedAt: "desc" },
    // Ni transcriptions, ni débriefs, ni résumés : les chiffres n'en ont pas besoin, et la page arrive bien plus vite.
    omit: { transcript: true, debrief: true, summary: true, aiSummary: true },
  });
  return rows.map((r) => ({ ...r, transcript: [], debrief: null, summary: "", aiSummary: "" }) as Call);
});

/** Résumés des quelques appels affichés (le fil du tableau de bord), lus à part pour ne pas alourdir le reste. */
export async function summariesOf(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.call.findMany({ where: { id: { in: ids } }, select: { id: true, summary: true } });
  return new Map(rows.map((r) => [r.id, r.summary]));
}

const scopeSql = (scope: Scope, days: number) => {
  const parts = [Prisma.sql`"orgId" = ${scope.orgId}`, Prisma.sql`"startedAt" >= (${periodStart(days)}::timestamptz AT TIME ZONE 'UTC')`];
  if (scope.kind === "client") parts.push(Prisma.sql`"clientId" = ${scope.clientId}`);
  else if (scope.clientFilter === "none") parts.push(Prisma.sql`"clientId" IS NULL`);
  else if (scope.clientFilter) parts.push(Prisma.sql`"clientId" = ${scope.clientFilter}`);
  return Prisma.join(parts, " AND ");
};

/**
 * Statistiques de la période, comptées par la base de données : la page ne charge plus les appels un par un.
 * Mémorisé le temps d'un affichage (classement et tableau de bord partagent la même lecture).
 */
export const aggCalls = cache(async (scope: Scope, days: number): Promise<Agg[]> => {
  const w = scopeSql(scope, days);
  return db.$queryRaw<Agg[]>`
    SELECT "clientId", "repName", to_char(l, 'YYYY-MM-DD') AS day, (extract(isodow FROM l)::int - 1) AS dow, extract(hour FROM l)::int AS hour,
      count(*)::int AS total,
      (count(*) FILTER (WHERE connected))::int AS connected,
      (count(*) FILTER (WHERE connected AND "durationSec" >= 30))::int AS conv,
      (count(*) FILTER (WHERE "meetingBooked"))::int AS rdv,
      coalesce(sum("durationSec") FILTER (WHERE connected), 0)::int AS talk,
      coalesce(sum("durationSec") FILTER (WHERE connected AND "durationSec" >= 30), 0)::int AS "convSec"
    FROM (SELECT "clientId", "repName", connected, "durationSec", "meetingBooked", ("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS l
          FROM "Call" WHERE ${w} AND kind <> 'meeting') t
    GROUP BY 1, 2, 3, 4, 5`;
});

/** Objections de la période (nombre, et part « passée » quand l'analyse le dit), comptées par la base. */
export const aggObjections = cache(async (scope: Scope, days: number): Promise<ObjAgg[]> => {
  const w = scopeSql(scope, days);
  return db.$queryRaw<ObjAgg[]>`
    SELECT o AS key, count(*)::int AS count, (count(*) FILTER (WHERE d.x IS NOT NULL))::int AS known, (count(*) FILTER (WHERE (d.x->>'passed')::boolean))::int AS passed
    FROM "Call" c CROSS JOIN LATERAL unnest(c.objections) AS o
    LEFT JOIN LATERAL (SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c."objDetails") = 'array' THEN c."objDetails" ELSE '[]'::jsonb END) x WHERE x->>'category' = o LIMIT 1) d ON true
    WHERE ${w} AND kind <> 'meeting' AND cardinality(c.objections) > 0
    GROUP BY 1`;
});

/** Dernier appel de la période (tous types), pour « dernier appel il y a… » et savoir s'il y a quelque chose à montrer. */
export const lastCallAt = cache(async (scope: Scope, days: number): Promise<Date | null> =>
  (await db.call.findFirst({ where: { ...callScope(scope), startedAt: { gte: periodStart(days) } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }))?.startedAt ?? null);

/** Statistiques complètes de la période, sans charger les appels. */
export async function periodStats(scope: Scope, days: number) {
  const [agg, objections, last] = await Promise.all([aggCalls(scope, days), aggObjections(scope, days), lastCallAt(scope, days)]);
  return { agg, stats: statsFromAgg(agg, days, { objections, lastCallAt: last }) };
}

/** Les dernières conversations (et rendez-vous) de la période, pour le fil du tableau de bord. */
export async function recentConversations(scope: Scope, days: number, take = 7): Promise<Call[]> {
  const rows = await db.call.findMany({
    where: { ...callScope(scope), startedAt: { gte: periodStart(days) }, OR: [{ connected: true, durationSec: { gte: 30 } }, { kind: "meeting" }] },
    orderBy: { startedAt: "desc" }, take, omit: { transcript: true, debrief: true },
  });
  return rows.map((r) => ({ ...r, transcript: [], debrief: null }) as Call);
}

/** Parmi ces appels, ceux qui ont une transcription (pour l'étiquette, sans charger le texte). */
export async function withTranscript(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.call.findMany({ where: { id: { in: ids }, NOT: { transcript: { equals: [] } } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/**
 * Appels regroupés par commercial, personne, jour et heure (heure de Paris). Toutes les statistiques se calculent à partir
 * de ces lignes : c'est la base de données qui compte (voir aggCalls), pas la page. Un million d'appels donne
 * au plus quelques milliers de lignes ici.
 */
export type Agg = { clientId: string | null; repName: string; day: string; dow: number; hour: number; total: number; connected: number; conv: number; rdv: number; talk: number; convSec: number };
export type ObjAgg = { key: string; count: number; known: number; passed: number };
type Callish = Pick<Call, "kind" | "startedAt" | "connected" | "durationSec" | "meetingBooked"> & { clientId?: string | null; repName?: string };

/** Le même regroupement, fait en mémoire sur une liste d'appels (petits volumes, tests). */
export function aggFromCalls(all: Callish[]): Agg[] {
  const m = new Map<string, Agg>();
  for (const c of all) {
    if (c.kind === "meeting") continue;
    const day = dayKey(c.startedAt), dow = weekdayParis(c.startedAt), hour = hourParis(c.startedAt), clientId = c.clientId ?? null, repName = c.repName || "";
    const k = `${clientId}|${repName}|${day}|${hour}`;
    const a = m.get(k) || { clientId, repName, day, dow, hour, total: 0, connected: 0, conv: 0, rdv: 0, talk: 0, convSec: 0 };
    a.total++;
    if (c.connected) { a.connected++; a.talk += c.durationSec; }
    if (isConversation(c)) { a.conv++; a.convSec += c.durationSec; }
    if (c.meetingBooked) a.rdv++;
    m.set(k, a);
  }
  return [...m.values()];
}

function objectionsFromCalls(all: Call[]): ObjAgg[] {
  const obj = new Map<string, ObjAgg>();
  for (const c of all) {
    if (c.kind === "meeting") continue;
    const det = (c.objDetails as unknown as { category: string; passed: boolean }[]) || [];
    for (const k of c.objections) {
      const o = obj.get(k) || { key: k, count: 0, known: 0, passed: 0 };
      o.count++;
      const d = det.find((x) => x.category === k);
      if (d) { o.known++; if (d.passed) o.passed++; }
      obj.set(k, o);
    }
  }
  return [...obj.values()];
}

const inHours = (a: { dow: number; hour: number }) => a.dow < 5 && a.hour >= 8 && a.hour < 20;

export function statsFromAgg(agg: Agg[], days: number, extra: { objections?: ObjAgg[]; lastCallAt?: Date | null } = {}): Stats {
  const sum = (f: (a: Agg) => number) => agg.reduce((n, a) => n + f(a), 0);
  const s: Stats = {
    total: sum((a) => a.total), connected: sum((a) => a.connected), conversations: sum((a) => a.conv), meetings: sum((a) => a.rdv), talkSec: sum((a) => a.talk),
    connectRate: 0, convToMeeting: 0, avgConvSec: 0,
    objections: [], daily: [], heat: {}, slots: {}, reps: [],
    lastCallAt: extra.lastCallAt ?? null,
  };
  s.connectRate = s.total ? (s.connected / s.total) * 100 : 0;
  s.convToMeeting = s.conversations ? (s.meetings / s.conversations) * 100 : 0;
  s.avgConvSec = s.conversations ? sum((a) => a.convSec) / s.conversations : 0;
  s.objections = (extra.objections || []).map((o) => ({ key: o.key, count: o.count, passedRate: o.known ? (o.passed / o.known) * 100 : null })).sort((a, b) => b.count - a.count);

  const dc = new Map<string, number>(), dm = new Map<string, number>();
  for (const a of agg) { dc.set(a.day, (dc.get(a.day) || 0) + a.conv); dm.set(a.day, (dm.get(a.day) || 0) + a.rdv); }
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 864e5));
    s.daily.push({ day: k, conversations: dc.get(k) || 0, meetings: dm.get(k) || 0 });
  }
  const reps = new Map<string, Stats["reps"][number]>();
  for (const a of agg) {
    if (inHours(a)) {
      const k = `${a.dow}-${a.hour}`;
      if (a.conv) s.heat[k] = (s.heat[k] || 0) + a.conv;
      const slot = (s.slots[k] ||= { calls: 0, connected: 0 });
      slot.calls += a.total; slot.connected += a.connected;
    }
    const n = a.repName || "Non attribué";
    const r = reps.get(n) || { name: n, total: 0, connected: 0, conversations: 0, meetings: 0 };
    r.total += a.total; r.connected += a.connected; r.conversations += a.conv; r.meetings += a.rdv;
    reps.set(n, r);
  }
  s.reps = [...reps.values()].sort((a, b) => b.total - a.total);
  return s;
}

export function computeStats(all: Call[], days: number): Stats {
  return statsFromAgg(aggFromCalls(all), days, { objections: objectionsFromCalls(all), lastCallAt: all[0]?.startedAt ?? null });
}

/** Niveaux de la carte des créneaux, selon le taux de décroché. */
export const SLOT_MIN_CALLS = 3;
export const SLOT_LEVELS = [
  { min: 30, label: "Excellent", sub: "30 % et plus", color: "#0F9F6E" },
  { min: 20, label: "Bon", sub: "20 à 30 %", color: "#6FD3A4" },
  { min: 10, label: "Moyen", sub: "10 à 20 %", color: "#F2B84B" },
  { min: 0, label: "Faible", sub: "moins de 10 %", color: "#E8697D" },
] as const;

export function slotLevel(slot: { calls: number; connected: number } | undefined) {
  if (!slot || !slot.calls) return { kind: "none" as const };
  if (slot.calls < SLOT_MIN_CALLS) return { kind: "few" as const };
  const rate = (slot.connected / slot.calls) * 100;
  return { kind: "rate" as const, rate, level: SLOT_LEVELS.find((l) => rate >= l.min)! };
}

/** Nombre d'appels minimum pour annoncer un « meilleur créneau » : en dessous, le taux ne veut rien dire. */
export const BEST_MIN_CALLS = 20;
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];

/**
 * Créneaux d'appel (heure de Paris, lundi-vendredi, 8 h-20 h) classés par taux de décroché, sur un volume suffisant :
 * par jour et heure, par heure seule, par jour seul. Sert au tableau de bord, au classement et à l'assistant IA.
 */
export function slotInsightsAgg(agg: Agg[], min = BEST_MIN_CALLS) {
  const acc = { slot: new Map<string, number[]>(), hour: new Map<string, number[]>(), day: new Map<string, number[]>() };
  const add = (m: Map<string, number[]>, k: string, a: Agg) => { const v = m.get(k) || [0, 0, 0]; v[0] += a.total; v[1] += a.connected; v[2] += a.rdv; m.set(k, v); };
  for (const a of agg) {
    if (!inHours(a)) continue;
    add(acc.slot, `${JOURS[a.dow]} ${a.hour}h`, a); add(acc.hour, `${a.hour}h`, a); add(acc.day, JOURS[a.dow], a);
  }
  const rank = (m: Map<string, number[]>) => [...m.entries()].filter(([, v]) => v[0] >= min)
    .map(([label, v]) => ({ label, calls: v[0], connected: v[1], meetings: v[2], rate: (v[1] / v[0]) * 100 }))
    .sort((a, b) => b.rate - a.rate || b.calls - a.calls || a.label.localeCompare(b.label)); // à égalité : ordre stable
  return { min, slots: rank(acc.slot), hours: rank(acc.hour), days: rank(acc.day) };
}
export function slotInsights(all: Pick<Call, "kind" | "startedAt" | "connected" | "meetingBooked">[], min = BEST_MIN_CALLS) {
  return slotInsightsAgg(aggFromCalls(all.map((c) => ({ durationSec: 0, ...c }))), min);
}

/** Meilleur créneau : le plus fort taux de décroché parmi ceux qui ont assez d'appels (à égalité, le plus d'appels). */
export function bestSlot(slots: Stats["slots"]) {
  return Object.entries(slots)
    .filter(([, v]) => v.calls >= BEST_MIN_CALLS)
    .map(([k, v]) => ({ key: k, rate: (v.connected / v.calls) * 100, calls: v.calls }))
    .sort((a, b) => b.rate - a.rate || b.calls - a.calls)[0] ?? null;
}
