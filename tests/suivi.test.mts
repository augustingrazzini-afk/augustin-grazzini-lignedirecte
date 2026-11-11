import { test, after, before } from "node:test";
import assert from "node:assert/strict";

const { db } = await import("../src/lib/db");
const { callScope, shareScope } = await import("../src/lib/access");
const { activityScope } = await import("../src/lib/channels");
const { periodStart, startOfDayParis, pickDays } = await import("../src/lib/period");

const tag = "suivi_" + Date.now().toString(36);
let orgId: string, a: string, b: string;
const token = "tok_" + "x".repeat(30) + Date.now();

before(async () => {
  orgId = (await db.organization.create({ data: { name: tag, trialEndsAt: new Date(Date.now() + 864e5) } })).id;
  a = (await db.client.create({ data: { orgId, name: `${tag} A`, shareToken: token } })).id;
  b = (await db.client.create({ data: { orgId, name: `${tag} B` } })).id;
  const call = (id: string, clientId: string) => ({ orgId, clientId, provider: "csv", externalId: id, startedAt: new Date(), updatedAt: new Date() });
  await db.call.createMany({ data: [call("a1", a), call("a2", a), call("b1", b)] });
  const act = (id: string, clientId: string, channel: string) => ({ orgId, clientId, provider: "csv", externalId: id, channel, type: "replied", occurredAt: new Date() });
  await db.activity.createMany({ data: [act("ea", a, "email"), act("la", a, "linkedin"), act("eb", b, "email")] });
});
after(async () => {
  await db.organization.deleteMany({ where: { name: tag } });
  await db.$disconnect();
});

test("le lien de suivi ne donne accès qu'aux appels de SON client", async () => {
  const { scope, client } = await shareScope(token);
  assert.equal(client.id, a);
  const seen = await db.call.findMany({ where: callScope(scope) });
  assert.deepEqual(seen.map((c) => c.externalId).sort(), ["a1", "a2"]);
  const acts = await db.activity.findMany({ where: activityScope(scope) });
  assert.deepEqual(acts.map((x) => x.externalId).sort(), ["ea", "la"], "emails et LinkedIn : seulement ceux du client");
});

test("un lien inconnu, trop court ou désactivé est refusé", async () => {
  await assert.rejects(() => shareScope("inconnu-" + "y".repeat(30)));
  await assert.rejects(() => shareScope("court"));
  await db.client.update({ where: { id: a }, data: { shareToken: null } });
  await assert.rejects(() => shareScope(token));
  await db.client.update({ where: { id: a }, data: { shareToken: token } });
});

test("périodes : jour = depuis minuit à Paris, sinon N jours glissants", () => {
  const now = new Date("2026-07-15T21:30:00Z"); // 23h30 à Paris (UTC+2)
  assert.equal(startOfDayParis(now).toISOString(), "2026-07-14T22:00:00.000Z");
  const winter = new Date("2026-01-15T23:30:00Z"); // 00h30 le 16 à Paris (UTC+1)
  assert.equal(startOfDayParis(winter).toISOString(), "2026-01-15T23:00:00.000Z");
  assert.equal(periodStart(7, now).getTime(), now.getTime() - 7 * 864e5);
  assert.equal(pickDays("365"), 365);
  assert.equal(pickDays("12"), 30);
  assert.equal(pickDays("1", [7, 30, 90]), 30);
});

test("carte des créneaux : couleurs selon le taux de décroché, et meilleur créneau", async () => {
  const { slotLevel, bestSlot } = await import("../src/lib/stats");
  assert.equal(slotLevel(undefined).kind, "none");
  assert.equal(slotLevel({ calls: 2, connected: 2 }).kind, "few", "moins de 3 appels : pas de couleur");
  const lv = (calls: number, connected: number) => { const r = slotLevel({ calls, connected }); return r.kind === "rate" ? r.level.label : r.kind; };
  assert.equal(lv(10, 0), "Faible");
  assert.equal(lv(10, 1), "Moyen");
  assert.equal(lv(10, 2), "Bon");
  assert.equal(lv(10, 3), "Excellent");
  const best = bestSlot({ "1-13": { calls: 3, connected: 3 }, "0-9": { calls: 2, connected: 2 }, "2-10": { calls: 20, connected: 6 } });
  assert.equal(best?.key, "1-13", "le créneau à 2 appels est ignoré");
});
