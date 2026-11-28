import { test, after } from "node:test";
import assert from "node:assert/strict";

// Démo publique : espace fictif Premium, complet, régénéré chaque jour, et fermé à toute écriture.
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
const { db } = await import("../src/lib/db");
const { ensureDemo, DEMO_ORG_ID, DEMO_USER_ID } = await import("../src/lib/demo");
after(async () => { await db.organization.deleteMany({ where: { id: DEMO_ORG_ID } }); await db.user.deleteMany({ where: { id: DEMO_USER_ID } }); await db.$disconnect(); });

test("la démo se crée avec des commerciaux, une agence et ses SDR, des appels écoutables, des relances et des RDV", async () => {
  await ensureDemo();
  const org = await db.organization.findUniqueOrThrow({ where: { id: DEMO_ORG_ID }, include: { clients: true, members: true } });
  assert.equal(org.plan, "premium");
  assert.equal(org.members[0].digest, false); // aucun email de récap
  assert.equal(org.clients.length, 4);
  const sdr = await db.call.groupBy({ by: ["repName"], where: { clientId: "demo_rep_prospectio" } });
  assert.deepEqual(sdr.map((r) => r.repName).sort(), ["Hugo", "Inès", "Marc"]);
  const [calls, rdv, audio, tasks, meet] = await Promise.all([
    db.call.count({ where: { orgId: DEMO_ORG_ID } }), db.call.count({ where: { orgId: DEMO_ORG_ID, meetingBooked: true } }),
    db.call.count({ where: { orgId: DEMO_ORG_ID, recordingUrl: { startsWith: "/demo/audio/" } } }),
    db.task.count({ where: { orgId: DEMO_ORG_ID, status: "open" } }), db.call.count({ where: { orgId: DEMO_ORG_ID, kind: "meeting", debrief: { not: undefined } } }),
  ]);
  assert.ok(calls > 800 && rdv > 20 && audio > 100 && tasks > 5 && meet === 4, JSON.stringify({ calls, rdv, audio, tasks, meet }));
});

test("une seconde visite le même jour ne régénère rien", async () => {
  const before = await db.call.findFirstOrThrow({ where: { orgId: DEMO_ORG_ID }, select: { createdAt: true } });
  await ensureDemo();
  const again = await db.call.findFirstOrThrow({ where: { orgId: DEMO_ORG_ID }, select: { createdAt: true } });
  assert.equal(again.createdAt.getTime(), before.createdAt.getTime());
});

