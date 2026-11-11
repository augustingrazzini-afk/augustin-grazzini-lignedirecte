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
  reps: { name: string; total: number; connected: number; conversations: number; meetings: number }[];
  lastCallAt: Date | null;
};

export async function windowCalls(scope: Scope, days: number) {
  return db.call.findMany({
    where: { ...callScope(scope), startedAt: { gte: periodStart(days) } },
    orderBy: { startedAt: "desc" },
  });
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
    objections: [], daily: [], heat: {}, reps: [],
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
