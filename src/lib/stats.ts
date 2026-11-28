import { cache } from "react";
import type { Call } from "@prisma/client";
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
    omit: { transcript: true, debrief: true },
  });
  return rows.map((r) => ({ ...r, transcript: [], debrief: null }) as Call);
});

/** Parmi ces appels, ceux qui ont une transcription (pour l'étiquette, sans charger le texte). */
export async function withTranscript(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.call.findMany({ where: { id: { in: ids }, NOT: { transcript: { equals: [] } } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export function computeStats(all: Call[], days: number): Stats {
  const calls = all.filter((c) => c.kind !== "meeting");
  const conv = calls.filter(isConversation);
  const s: Stats = {
    total: calls.length,
    connected: calls.filter((c) => c.connected).length,
    conversations: conv.length,
    meetings: calls.filter((c) => c.meetingBooked).length,
    talkSec: calls.reduce((a, c) => a + (c.connected ? c.durationSec : 0), 0),
    connectRate: 0, convToMeeting: 0, avgConvSec: 0,
    objections: [], daily: [], heat: {}, slots: {}, reps: [],
    lastCallAt: all[0]?.startedAt ?? null,
  };
  s.connectRate = s.total ? (s.connected / s.total) * 100 : 0;
  s.convToMeeting = s.conversations ? (s.meetings / s.conversations) * 100 : 0;
  s.avgConvSec = conv.length ? conv.reduce((a, c) => a + c.durationSec, 0) / conv.length : 0;

  const obj = new Map<string, { count: number; known: number; passed: number }>();
  for (const c of calls) {
    const det = (c.objDetails as unknown as { category: string; passed: boolean }[]) || [];
    for (const k of c.objections) {
      const o = obj.get(k) || { count: 0, known: 0, passed: 0 };
      o.count++;
      const d = det.find((x) => x.category === k);
      if (d) { o.known++; if (d.passed) o.passed++; }
      obj.set(k, o);
    }
  }
  s.objections = [...obj.entries()].map(([key, o]) => ({ key, count: o.count, passedRate: o.known ? (o.passed / o.known) * 100 : null })).sort((a, b) => b.count - a.count);

  const dc = new Map<string, number>(), dm = new Map<string, number>();
  for (const c of conv) dc.set(dayKey(c.startedAt), (dc.get(dayKey(c.startedAt)) || 0) + 1);
  for (const c of calls) if (c.meetingBooked) dm.set(dayKey(c.startedAt), (dm.get(dayKey(c.startedAt)) || 0) + 1);
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 864e5));
    s.daily.push({ day: k, conversations: dc.get(k) || 0, meetings: dm.get(k) || 0 });
  }
  for (const c of conv) {
    const d = weekdayParis(c.startedAt), h = hourParis(c.startedAt);
    if (d < 5 && h >= 8 && h < 20) s.heat[`${d}-${h}`] = (s.heat[`${d}-${h}`] || 0) + 1;
  }
  for (const c of calls) {
    const d = weekdayParis(c.startedAt), h = hourParis(c.startedAt);
    if (d >= 5 || h < 8 || h >= 20) continue;
    const k = `${d}-${h}`, slot = (s.slots[k] ||= { calls: 0, connected: 0 });
    slot.calls++;
    if (c.connected) slot.connected++;
  }
  const reps = new Map<string, Stats["reps"][number]>();
  for (const c of calls) {
    const n = c.repName || "Non attribué";
    const r = reps.get(n) || { name: n, total: 0, connected: 0, conversations: 0, meetings: 0 };
    r.total++; if (c.connected) r.connected++; if (isConversation(c)) r.conversations++; if (c.meetingBooked) r.meetings++;
    reps.set(n, r);
  }
  s.reps = [...reps.values()].sort((a, b) => b.total - a.total);
  return s;
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
export function slotInsights(all: Pick<Call, "kind" | "startedAt" | "connected" | "meetingBooked">[], min = BEST_MIN_CALLS) {
  const acc = { slot: new Map<string, number[]>(), hour: new Map<string, number[]>(), day: new Map<string, number[]>() };
  const add = (m: Map<string, number[]>, k: string, c: { connected: boolean; meetingBooked: boolean }) => { const v = m.get(k) || [0, 0, 0]; v[0]++; if (c.connected) v[1]++; if (c.meetingBooked) v[2]++; m.set(k, v); };
  for (const c of all) {
    if (c.kind === "meeting") continue;
    const d = weekdayParis(c.startedAt), h = hourParis(c.startedAt);
    if (d >= 5 || h < 8 || h >= 20) continue;
    add(acc.slot, `${JOURS[d]} ${h}h`, c); add(acc.hour, `${h}h`, c); add(acc.day, JOURS[d], c);
  }
  const rank = (m: Map<string, number[]>) => [...m.entries()].filter(([, v]) => v[0] >= min)
    .map(([label, v]) => ({ label, calls: v[0], connected: v[1], meetings: v[2], rate: (v[1] / v[0]) * 100 }))
    .sort((a, b) => b.rate - a.rate || b.calls - a.calls);
  return { min, slots: rank(acc.slot), hours: rank(acc.hour), days: rank(acc.day) };
}

/** Meilleur créneau : le plus fort taux de décroché parmi ceux qui ont assez d'appels (à égalité, le plus d'appels). */
export function bestSlot(slots: Stats["slots"]) {
  return Object.entries(slots)
    .filter(([, v]) => v.calls >= BEST_MIN_CALLS)
    .map(([k, v]) => ({ key: k, rate: (v.connected / v.calls) * 100, calls: v.calls }))
    .sort((a, b) => b.rate - a.rate || b.calls - a.calls)[0] ?? null;
}
