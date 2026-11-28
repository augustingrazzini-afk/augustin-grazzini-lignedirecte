import { test, after } from "node:test";
import assert from "node:assert/strict";

// Synchro : un appel inchangé n'est ni réécrit ni retraité ; un appel modifié dans l'outil est bien mis à jour.
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
const { db } = await import("../src/lib/db");
const { upsertCalls } = await import("../src/lib/ingest");
const org = await db.organization.create({ data: { name: `inc_${Date.now()}`, plan: "premium", subscriptionStatus: "active", trialEndsAt: new Date() } });
after(async () => { await db.organization.delete({ where: { id: org.id } }); await db.$disconnect(); });
const t = { orgId: org.id, provider: "minari" };
const at = new Date("2026-11-20T10:00:00Z");
const mk = (i: number, over: Record<string, unknown> = {}) => ({ externalId: `x${i}`, startedAt: at, durationSec: 80, status: "connected", connected: true, meetingBooked: false, firstName: "Paul", lastName: `N${i}`, company: "Acme", phone: "+33600000000", summary: "Rappeler jeudi.", ...over }) as never;

test("première synchro : tout est créé ; seconde identique : rien n'est réécrit", async () => {
  assert.deepEqual(await upsertCalls(t, [mk(1), mk(2), mk(3)]), { created: 3, updated: 0, unchanged: 0 });
  const before = await db.call.findMany({ where: { orgId: org.id }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } });
  assert.deepEqual(await upsertCalls(t, [mk(1), mk(2), mk(3)]), { created: 0, updated: 0, unchanged: 3 });
  const again = await db.call.findMany({ where: { orgId: org.id }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } });
  assert.deepEqual(again.map((c) => c.updatedAt.getTime()), before.map((c) => c.updatedAt.getTime()));
});

test("un appel corrigé dans l'outil (RDV pris) est mis à jour, les autres non", async () => {
  assert.deepEqual(await upsertCalls(t, [mk(1), mk(2, { meetingBooked: true, status: "meeting-booked" }), mk(3)]), { created: 0, updated: 1, unchanged: 2 });
  assert.equal((await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: "x2" } })).meetingBooked, true);
});

test("un complément (transcription) s'applique toujours et ne bloque pas la synchro suivante", async () => {
  const r = await upsertCalls(t, [mk(1, { transcript: [{ s: "Léa", t: "Bonjour", ts: "00:01" }] })], { partial: true });
  assert.equal(r.updated, 1);
  assert.deepEqual(await upsertCalls(t, [mk(1)]), { created: 0, updated: 0, unchanged: 1 });
  assert.equal(((await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: "x1" } })).transcript as unknown[]).length, 1);
});

test("une nouvelle règle d'attribution change l'empreinte : l'appel est rangé au passage suivant", async () => {
  const rep = await db.client.create({ data: { orgId: org.id, name: "Léa" } });
  await db.clientRule.create({ data: { orgId: org.id, clientId: rep.id, field: "company", value: "Acme" } });
  assert.deepEqual(await upsertCalls(t, [mk(3)]), { created: 0, updated: 1, unchanged: 0 });
  assert.equal((await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: "x3" } })).clientId, rep.id);
});
