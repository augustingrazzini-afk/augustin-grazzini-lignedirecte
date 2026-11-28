import { test, after } from "node:test";
import assert from "node:assert/strict";

// Un appel envoyé à un autre commercial : lui seul y gagne l'accès, sans changer l'attribution.
const { db } = await import("../src/lib/db");
const { callAccess, callScope } = await import("../src/lib/access");

const tag = `par_${Date.now().toString(36)}`;
const mk = (name: string) => db.organization.create({ data: { name, plan: "premium", seats: 5, subscriptionStatus: "active", trialEndsAt: new Date() } });
const org = await mk(`Boîte ${tag}`), autre = await mk(`Autre ${tag}`);
const [lea, karim, zoe] = await Promise.all(["Léa", "Karim", "Zoé"].map((name) => db.client.create({ data: { orgId: org.id, name } })));
const intrus = await db.client.create({ data: { orgId: autre.id, name: "Intrus" } });
const call = await db.call.create({ data: { orgId: org.id, clientId: lea.id, provider: "manual", externalId: tag, startedAt: new Date(), durationSec: 120, status: "connected", connected: true } });
after(async () => { await db.organization.deleteMany({ where: { id: { in: [org.id, autre.id] } } }); await db.$disconnect(); });

const rep = (c: { id: string; orgId: string }) => ({ kind: "client", orgId: c.orgId, clientId: c.id, userId: "u" }) as never;
const sees = async (c: { id: string; orgId: string }) => !!(await db.call.findFirst({ where: callAccess(rep(c), call.id) }));

test("sans partage : seul le commercial de l'appel le voit", async () => {
  assert.deepEqual([await sees(lea), await sees(karim), await sees(zoe), await sees(intrus)], [true, false, false, false]);
});

test("appel envoyé à Karim : il le voit, pas les autres, et l'attribution ne bouge pas", async () => {
  await db.callShare.create({ data: { callId: call.id, clientId: karim.id, note: "Écoute le traitement du prix", fromName: "La direction" } });
  assert.deepEqual([await sees(lea), await sees(karim), await sees(zoe), await sees(intrus)], [true, true, false, false]);
  assert.equal((await db.call.findUniqueOrThrow({ where: { id: call.id } })).clientId, lea.id);
  assert.equal(await db.call.count({ where: { ...callScope(rep(karim)) } }), 0, "l'appel reçu ne compte pas dans ses chiffres ni dans sa liste");
});

test("un partage vers une autre entreprise ne donne aucun accès", async () => {
  await db.callShare.create({ data: { callId: call.id, clientId: intrus.id } });
  assert.equal(await sees(intrus), false);
});

test("partage retiré : l'accès disparaît ; commercial supprimé : ses partages aussi", async () => {
  await db.callShare.deleteMany({ where: { callId: call.id, clientId: karim.id } });
  assert.equal(await sees(karim), false);
  await db.callShare.create({ data: { callId: call.id, clientId: zoe.id } });
  await db.client.delete({ where: { id: zoe.id } });
  assert.equal(await db.callShare.count({ where: { clientId: zoe.id } }), 0);
});
