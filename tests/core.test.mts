import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

const { db } = await import("../src/lib/db");
const { callScope } = await import("../src/lib/access");
const { upsertCalls, routeClient, reapplyRules } = await import("../src/lib/ingest");
const { seal, open } = await import("../src/lib/crypto");
const { computeStats } = await import("../src/lib/stats");

const tag = "test_" + Date.now().toString(36);
let orgA: string, orgB: string, nova: string, other: string;

before(async () => {
  const mk = (name: string) => db.organization.create({ data: { name: `${tag} ${name}`, trialEndsAt: new Date(Date.now() + 864e5) } });
  orgA = (await mk("A")).id; orgB = (await mk("B")).id;
  nova = (await db.client.create({ data: { orgId: orgA, name: "Nova" } })).id;
  other = (await db.client.create({ data: { orgId: orgA, name: "Autre" } })).id;
  await db.clientRule.create({ data: { orgId: orgA, clientId: nova, field: "list", value: "Nova Q1" } });
});
after(async () => {
  await db.organization.deleteMany({ where: { name: { startsWith: tag } } });
  await db.$disconnect();
});

const call = (id: string, o: Record<string, unknown> = {}) => ({ externalId: id, startedAt: new Date(), durationSec: 120, status: "connected", connected: true, meetingBooked: false, firstName: "Jean", lastName: id, company: "Acme", ...o });

test("les clés API sont chiffrées et relisibles", () => {
  const s = seal({ apiKey: "secret-123" });
  assert.ok(!s.includes("secret-123"));
  assert.deepEqual(open(s), { apiKey: "secret-123" });
  const tampered = s.slice(0, -2) + (s.endsWith("A") ? "B" : "A");
  assert.throws(() => open(tampered));
});

test("un appel est rangé chez le bon client par la règle de liste", async () => {
  await upsertCalls({ orgId: orgA, provider: "minari" }, [call("c1", { listName: "Nova Q1" }), call("c2", { listName: "LEADS CHAUDS" }), call("c3", { listName: "nova q1" })]);
  const rows = await db.call.findMany({ where: { orgId: orgA }, orderBy: { externalId: "asc" } });
  assert.equal(rows.find((r) => r.externalId === "c1")!.clientId, nova);
  assert.equal(rows.find((r) => r.externalId === "c2")!.clientId, null);
  assert.equal(rows.find((r) => r.externalId === "c3")!.clientId, nova, "comparaison insensible à la casse");
});

test("le portail d'un client ne voit QUE ses appels", async () => {
  await upsertCalls({ orgId: orgA, provider: "csv", clientId: other }, [call("o1")]);
  await upsertCalls({ orgId: orgB, provider: "minari" }, [call("b1", { listName: "Nova Q1" })]);
  const seen = await db.call.findMany({ where: callScope({ kind: "client", orgId: orgA, clientId: nova, userId: "u" }) });
  assert.deepEqual(seen.map((c) => c.externalId).sort(), ["c1", "c3"]);
  const orgSeen = await db.call.findMany({ where: callScope({ kind: "org", orgId: orgA, userId: "u", role: "owner" }) });
  assert.ok(!orgSeen.some((c) => c.orgId !== orgA), "aucun appel d'une autre organisation");
  const b = await db.call.findFirst({ where: { orgId: orgB } });
  assert.equal(b!.clientId, null, "la règle d'une organisation ne s'applique jamais à une autre");
});

test("une intégration connectée par un client range tout chez lui, sans regarder les règles", () => {
  assert.equal(routeClient(call("x", { listName: "Nova Q1" }) as never, "minari", [], other), other);
});

test("réimporter le même appel met à jour sans doublon", async () => {
  const r = await upsertCalls({ orgId: orgA, provider: "minari" }, [call("c1", { listName: "Nova Q1", summary: "- nouveau résumé" })]);
  assert.deepEqual(r, { created: 0, updated: 1 });
  assert.equal(await db.call.count({ where: { orgId: orgA, externalId: "c1" } }), 1);
});

test("une nouvelle règle range les appels existants", async () => {
  await db.clientRule.create({ data: { orgId: orgA, clientId: other, field: "list", value: "LEADS CHAUDS" } });
  assert.equal(await reapplyRules(orgA), 1);
  assert.equal((await db.call.findFirst({ where: { orgId: orgA, externalId: "c2" } }))!.clientId, other);
});

test("le numéro de téléphone n'est jamais stocké en entier", async () => {
  await upsertCalls({ orgId: orgA, provider: "aircall" }, [call("p1", { phone: "+33 6 12 34 56 78" })]);
  const c = await db.call.findFirst({ where: { orgId: orgA, externalId: "p1" } });
  assert.equal(c!.phoneLast4, "5678");
  assert.ok(!JSON.stringify(c).includes("612345678"));
});

test("statistiques d'appels", async () => {
  const now = new Date();
  const base = { orgId: orgA, provider: "csv", kind: "call", direction: null, tags: [], objections: [], objDetails: [], transcript: [], recordingUrl: null, recordingKey: null, aiStatus: "none", createdAt: now, updatedAt: now, clientId: null, integrationId: null, jobTitle: "", repName: "Julie", listName: "", campaign: "", phoneLast4: "", firstName: "A", lastName: "B", company: "C" };
  const rows = [
    { ...base, id: "1", externalId: "1", startedAt: now, durationSec: 0, status: "no-answer", connected: false, meetingBooked: false, contactKey: "k1", summary: "" },
    { ...base, id: "2", externalId: "2", startedAt: now, durationSec: 90, status: "connected", connected: true, meetingBooked: false, contactKey: "k2", summary: "- Rappeler en mars" },
    { ...base, id: "3", externalId: "3", startedAt: now, durationSec: 200, status: "meeting-booked", connected: true, meetingBooked: true, contactKey: "k3", summary: "- RDV jeudi" },
  ];
  const s = computeStats(rows as never, 7);
  assert.equal(s.total, 3); assert.equal(s.connected, 2); assert.equal(s.conversations, 2); assert.equal(s.meetings, 1);
  assert.equal(Math.round(s.connectRate), 67);
});
