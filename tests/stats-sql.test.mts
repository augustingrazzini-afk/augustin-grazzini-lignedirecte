import { test, after } from "node:test";
import assert from "node:assert/strict";

// Les statistiques comptées par la base de données doivent donner exactement les mêmes chiffres
// que le calcul appel par appel (l'ancienne méthode, gardée ici comme référence).
const { db } = await import("../src/lib/db");
const stats = await import("../src/lib/stats");
const { rankReps, rankRepsAgg, membersOf, membersAgg } = await import("../src/components/views/Leaderboard");
const { callScope } = await import("../src/lib/access");
const { periodStart } = await import("../src/lib/period");

const tag = `sql_${Date.now().toString(36)}`;
const org = await db.organization.create({ data: { name: `Stats ${tag}`, plan: "premium", subscriptionStatus: "active", trialEndsAt: new Date() } });
const reps = await Promise.all(["Léa", "Agence"].map((name, i) => db.client.create({ data: { orgId: org.id, name, kind: i ? "agence" : "interne" } })));
after(async () => { await db.organization.delete({ where: { id: org.id } }); await db.$disconnect(); });

// Générateur pseudo-aléatoire fixe : le test rejoue toujours les mêmes appels.
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const OBJ = ["budget", "timing", "relevance", "authority"];
const now = Date.now();
const rows = Array.from({ length: 1500 }, (_, i) => {
  const connected = rnd() < 0.3, dur = connected ? Math.floor(rnd() * 300) : rnd() < 0.2 ? Math.floor(rnd() * 20) : 0;
  const objections = connected && rnd() < 0.4 ? [OBJ[Math.floor(rnd() * 4)], ...(rnd() < 0.3 ? [OBJ[Math.floor(rnd() * 4)]] : [])].filter((v, k, a) => a.indexOf(v) === k) : [];
  const rep = rnd() < 0.15 ? null : reps[Math.floor(rnd() * 2)];
  return {
    orgId: org.id, clientId: rep?.id ?? null, provider: "manual", externalId: `${tag}_${i}`,
    kind: rnd() < 0.04 ? "meeting" : "call",
    // Répartis sur 40 jours, à toute heure : week-ends, nuit et minuit (heure de Paris) compris.
    startedAt: new Date(now - Math.floor(rnd() * 40 * 864e5)),
    durationSec: dur, status: connected ? "connected" : "no-answer", connected, meetingBooked: connected && rnd() < 0.15,
    repName: rep?.kind === "agence" ? ["Hugo", "Inès", "Marc"][Math.floor(rnd() * 3)] : rnd() < 0.1 ? "" : "Léa",
    objections, objDetails: objections.filter(() => rnd() < 0.7).map((category) => ({ category, passed: rnd() < 0.5 })),
  };
});
// Appels posés exactement autour de minuit et du changement d'heure.
for (const [i, iso] of ["2026-11-25T22:59:59.999Z", "2026-11-25T23:00:00.000Z", "2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z", "2026-03-29T00:59:00.000Z", "2026-03-29T01:01:00.000Z"].entries())
  rows.push({ ...rows[0], externalId: `${tag}_bord_${i}`, startedAt: new Date(iso), kind: "call", connected: true, durationSec: 45, status: "connected" });
await db.call.createMany({ data: rows });

const round = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v)));
const sortRows = <T extends { name: string }>(a: T[]) => [...a].sort((x, y) => x.name.localeCompare(y.name));

for (const [label, scope, days] of [
  ["toute l'entreprise, 30 jours", { kind: "org", orgId: org.id, userId: "u", role: "owner" }, 30],
  ["toute l'entreprise, 365 jours", { kind: "org", orgId: org.id, userId: "u", role: "owner" }, 365],
  ["un commercial, 7 jours", { kind: "org", orgId: org.id, userId: "u", role: "owner", clientFilter: reps[1].id }, 7],
  ["appels non attribués, 90 jours", { kind: "org", orgId: org.id, userId: "u", role: "owner", clientFilter: "none" }, 90],
  ["espace d'un commercial invité, 30 jours", { kind: "client", orgId: org.id, clientId: reps[0].id, userId: "u" }, 30],
] as [string, never, number][]) {
  test(`mêmes chiffres par la base et appel par appel : ${label}`, async () => {
    const calls = await db.call.findMany({ where: { ...callScope(scope), startedAt: { gte: periodStart(days) } }, orderBy: { startedAt: "desc" } });
    assert.ok(calls.length > 20, "le jeu de test contient des appels");
    const ref = stats.computeStats(calls, days);
    const { agg, stats: got } = await stats.periodStats(scope, days);
    const a = round(ref), b = round(got);
    for (const k of ["total", "connected", "conversations", "meetings", "talkSec", "connectRate", "convToMeeting", "avgConvSec", "daily", "heat", "slots"]) assert.deepEqual(b[k], a[k], k);
    assert.deepEqual(sortRows(b.reps), sortRows(a.reps), "par personne");
    assert.deepEqual([...b.objections].sort((x, y) => x.key.localeCompare(y.key)), [...a.objections].sort((x, y) => x.key.localeCompare(y.key)), "objections");
    assert.equal(new Date(b.lastCallAt).getTime(), new Date(a.lastCallAt).getTime(), "dernier appel");
    assert.deepEqual(round(stats.slotInsightsAgg(agg, 3)), round(stats.slotInsights(calls, 3)), "meilleurs créneaux");
    assert.deepEqual(round(rankRepsAgg(agg, reps)), round(rankReps(calls, reps)), "classement");
    assert.deepEqual(round(membersAgg(agg)), round(membersOf(calls)), "personnes d'une agence");
  });
}

test("fil du tableau de bord : les dernières conversations, sans les transcriptions", async () => {
  const feed = await stats.recentConversations({ kind: "org", orgId: org.id, userId: "u", role: "owner" } as never, 30);
  assert.equal(feed.length, 7);
  assert.ok(feed.every((c) => c.kind === "meeting" || (c.connected && c.durationSec >= 30)));
  assert.ok(feed.every((c, i) => !i || feed[i - 1].startedAt >= c.startedAt), "du plus récent au plus ancien");
});
