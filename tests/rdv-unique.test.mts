import { test, after } from "node:test";
import assert from "node:assert/strict";

// Un rendez-vous compte une fois par prospect : l'outil d'appel marque « rendez-vous » sur chaque appel d'un prospect
// qui en a un (y compris l'appel qui le décale). Cas réel : rendez-vous pris le 24, rappel le 27 pour le reporter.
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
const { db } = await import("../src/lib/db");
const { upsertCalls } = await import("../src/lib/ingest");
const mk = () => db.organization.create({ data: { name: `rdv_${Date.now()}_${Math.random()}`, plan: "premium", subscriptionStatus: "active", trialEndsAt: new Date() } });
const orgs: string[] = [];
after(async () => { await db.organization.deleteMany({ where: { id: { in: orgs } } }); await db.$disconnect(); });
const call = (id: string, day: string, over: Record<string, unknown> = {}) => ({ externalId: id, startedAt: new Date(`2026-11-${day}T14:00:00Z`), durationSec: 150, status: "connected", connected: true, meetingBooked: true, firstName: "Jamal", lastName: "Mejdoubi", company: "Nestya", phone: "+3247000000", summary: "- Rendez-vous pris le 27 à 15 h.", ...over }) as never;
const booked = async (orgId: string) => (await db.call.findMany({ where: { orgId }, orderBy: { startedAt: "asc" }, select: { externalId: true, meetingBooked: true, status: true } })).map((c) => `${c.externalId}:${c.meetingBooked ? "RDV" : c.status}`);

test("rendez-vous pris, puis appel pour le décaler : un seul rendez-vous compté", async () => {
  const org = await mk(); orgs.push(org.id); const t = { orgId: org.id, provider: "minari" };
  await upsertCalls(t, [call("a", "24")]);
  await upsertCalls(t, [call("b", "27", { summary: "- Rendez-vous reporté au mardi 1er décembre à 17 h." })]);
  assert.deepEqual(await booked(org.id), ["a:RDV", "b:meeting-rescheduled"]);
  assert.equal(await db.call.count({ where: { orgId: org.id, meetingBooked: true } }), 1);
});

test("même résultat quand les appels arrivent du plus récent au plus ancien (première synchro)", async () => {
  const org = await mk(); orgs.push(org.id); const t = { orgId: org.id, provider: "minari" };
  await upsertCalls(t, [call("b", "27", { summary: "- Rendez-vous décalé à mardi." }), call("a", "24")]);
  assert.deepEqual(await booked(org.id), ["a:RDV", "b:meeting-rescheduled"]);
});

test("suivi sans mot « reporté » : pas recompté non plus, et libellé différent", async () => {
  const org = await mk(); orgs.push(org.id); const t = { orgId: org.id, provider: "minari" };
  await upsertCalls(t, [call("a", "10"), call("b", "17", { summary: "- Le prospect confirme l'entité concernée." })]);
  assert.deepEqual(await booked(org.id), ["a:RDV", "b:meeting-followup"]);
});

test("deux prospects différents, ou le même prospect plus de 30 jours après : deux rendez-vous", async () => {
  const org = await mk(); orgs.push(org.id); const t = { orgId: org.id, provider: "minari" };
  await upsertCalls(t, [call("a", "24"), call("c", "25", { firstName: "Julie", lastName: "Roux", company: "Datalia", phone: "+3247111111" })]);
  await upsertCalls(t, [{ ...(call("d", "24") as object), externalId: "d", startedAt: new Date("2027-01-05T10:00:00Z") } as never]);
  assert.equal(await db.call.count({ where: { orgId: org.id, meetingBooked: true } }), 3);
});

test("le mot « reporté » seul ne retire pas un premier rendez-vous", async () => {
  const org = await mk(); orgs.push(org.id); const t = { orgId: org.id, provider: "minari" };
  await upsertCalls(t, [call("a", "24", { summary: "- Rendez-vous provisoire mardi 10 h, il confirmera ou demandera à décaler." })]);
  assert.deepEqual(await booked(org.id), ["a:RDV"]);
});

test("décision prise à la main (« c'est un nouveau rendez-vous ») : la synchro suivante ne la défait pas", async () => {
  const org = await mk(); orgs.push(org.id); const t = { orgId: org.id, provider: "minari" };
  await upsertCalls(t, [call("a", "24")]);
  await upsertCalls(t, [call("b", "27")]);
  await db.call.updateMany({ where: { orgId: org.id, externalId: "b" }, data: { meetingBooked: true, meetingManual: true, status: "meeting-booked" } });
  await upsertCalls(t, [call("b", "27", { summary: "- Résumé modifié dans l'outil." })]);
  assert.deepEqual(await booked(org.id), ["a:RDV", "b:RDV"]);
  // … et le rendez-vous d'origine n'est pas rétrogradé par la règle inverse
  await upsertCalls(t, [call("a", "24", { summary: "- Résumé modifié aussi." })]);
  assert.deepEqual(await booked(org.id), ["a:RDV", "b:RDV"]);
});
