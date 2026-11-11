import type { Activity, Prisma } from "@prisma/client";
import { db } from "./db";
import type { Scope } from "./access";
import { isConversation } from "./format";
import { periodStart } from "./period";

export function activityScope(s: Scope): Prisma.ActivityWhereInput {
  if (s.kind === "client") return { orgId: s.orgId, clientId: s.clientId };
  return s.clientFilter ? { orgId: s.orgId, clientId: s.clientFilter === "none" ? null : s.clientFilter } : { orgId: s.orgId };
}

export async function windowActivities(scope: Scope, days: number, channel?: "email" | "linkedin") {
  return db.activity.findMany({
    where: { ...activityScope(scope), ...(channel ? { channel } : {}), occurredAt: { gte: periodStart(days) } },
    orderBy: { occurredAt: "desc" },
    take: 20000,
  });
}

const uniq = (list: Activity[], type: string) => new Set(list.filter((a) => a.type === type).map((a) => a.contactKey)).size;

export type EmailStats = { sent: number; contacts: number; opened: number; replied: number; positive: number; bounced: number; meetings: number; openRate: number; replyRate: number; positiveRate: number; bounceRate: number; campaigns: CampaignRow[] };
export type LinkedinStats = { invites: number; accepted: number; messages: number; replied: number; positive: number; meetings: number; acceptRate: number; replyRate: number; campaigns: CampaignRow[] };
export type CampaignRow = { name: string; sent: number; replied: number; positive: number; meetings: number; rate: number };

function campaigns(list: Activity[], sentTypes: string[]): CampaignRow[] {
  const m = new Map<string, CampaignRow>();
  for (const a of list) {
    const k = a.campaign || "Sans campagne";
    const r = m.get(k) || { name: k, sent: 0, replied: 0, positive: 0, meetings: 0, rate: 0 };
    if (sentTypes.includes(a.type)) r.sent++;
    if (a.type === "replied") { r.replied++; if (a.sentiment === "positive") r.positive++; }
    if (a.type === "meeting_booked") r.meetings++;
    m.set(k, r);
  }
  return [...m.values()].map((r) => ({ ...r, rate: r.sent ? (r.replied / r.sent) * 100 : 0 })).sort((a, b) => b.sent - a.sent).slice(0, 15);
}

export function emailStats(list: Activity[]): EmailStats {
  const e = list.filter((a) => a.channel === "email");
  const contacts = new Set(e.filter((a) => a.type === "sent").map((a) => a.contactKey)).size;
  const replied = uniq(e, "replied"), opened = uniq(e, "opened"), bounced = uniq(e, "bounced");
  const positive = new Set(e.filter((a) => a.type === "replied" && a.sentiment === "positive").map((a) => a.contactKey)).size;
  const meetings = uniq(e, "meeting_booked");
  const base = contacts || 1;
  return { sent: e.filter((a) => a.type === "sent").length, contacts, opened, replied, positive, bounced, meetings, openRate: (opened / base) * 100, replyRate: (replied / base) * 100, positiveRate: replied ? (positive / replied) * 100 : 0, bounceRate: (bounced / base) * 100, campaigns: campaigns(e, ["sent"]) };
}

export function linkedinStats(list: Activity[]): LinkedinStats {
  const l = list.filter((a) => a.channel === "linkedin");
  const invites = uniq(l, "invite_sent"), accepted = uniq(l, "invite_accepted"), replied = uniq(l, "replied");
  const positive = new Set(l.filter((a) => a.type === "replied" && a.sentiment === "positive").map((a) => a.contactKey)).size;
  const reached = new Set(l.filter((a) => a.type === "message_sent").map((a) => a.contactKey)).size || accepted;
  return { invites, accepted, messages: l.filter((a) => a.type === "message_sent").length, replied, positive, meetings: uniq(l, "meeting_booked"), acceptRate: invites ? (accepted / invites) * 100 : 0, replyRate: reached ? (replied / reached) * 100 : 0, campaigns: campaigns(l, ["invite_sent", "message_sent"]) };
}

/** Vue d'ensemble par canal, pour le pilotage. */
export async function channelOverview(scope: Scope, days: number) {
  const since = periodStart(days);
  const [acts, calls] = await Promise.all([
    windowActivities(scope, days),
    db.call.findMany({ where: { ...(scope.kind === "client" ? { orgId: scope.orgId, clientId: scope.clientId } : scope.clientFilter ? { orgId: scope.orgId, clientId: scope.clientFilter === "none" ? null : scope.clientFilter } : { orgId: scope.orgId }), startedAt: { gte: since }, kind: "call" }, select: { connected: true, durationSec: true, meetingBooked: true } }),
  ]);
  const e = emailStats(acts), l = linkedinStats(acts);
  const call = { total: calls.length, conversations: calls.filter(isConversation).length, meetings: calls.filter((c) => c.meetingBooked).length };
  return { email: e, linkedin: l, call, hasEmail: acts.some((a) => a.channel === "email"), hasLinkedin: acts.some((a) => a.channel === "linkedin") };
}
