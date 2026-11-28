import { test, after } from "node:test";
import assert from "node:assert/strict";

// Rattrapage des coordonnées (téléphone, email) sur les appels enregistrés avant que Trustpipe ne les conserve :
// il ne complète que ça, une seule fois, sans toucher aux rendez-vous ni aux relances.
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
const { db } = await import("../src/lib/db");
const { PROVIDERS } = await import("../src/lib/providers");
const { backfillContacts } = await import("../src/lib/sync");
const { openContact } = await import("../src/lib/contact");
const org = await db.organization.create({ data: { name: `rat_${Date.now()}`, plan: "premium", subscriptionStatus: "active", trialEndsAt: new Date() } });
after(async () => { await db.organization.delete({ where: { id: org.id } }); await db.$disconnect(); });
const base = { orgId: org.id, provider: "minari", startedAt: new Date(), durationSec: 60, status: "connected", connected: true };
await db.call.createMany({ data: [
  { ...base, externalId: "old1", meetingBooked: true, summary: "RDV pris" },
  { ...base, externalId: "old2" },
  { ...base, externalId: "deja", contactSealed: "x" },
] });
await db.task.create({ data: { orgId: org.id, contactKey: "k", channel: "call", dueAt: new Date("2027-01-01"), reason: "Reportée à la main", source: "rule", sourceKind: "call", sourceId: "old2" } });
let passes = 0;
const real = PROVIDERS.minari.list;
PROVIDERS.minari.list = async function* () { passes++; yield [
  { externalId: "old1", startedAt: new Date(), durationSec: 60, status: "connected", connected: true, meetingBooked: false, phone: "+33612345678", email: "paul@acme.fr" },
  { externalId: "old2", startedAt: new Date(), durationSec: 60, status: "connected", connected: true, meetingBooked: false, phone: "+33698765432" },
  { externalId: "deja", startedAt: new Date(), durationSec: 60, status: "connected", connected: true, meetingBooked: false, phone: "+33600000000" },
  { externalId: "inconnu", startedAt: new Date(), durationSec: 60, status: "connected", connected: true, meetingBooked: false, phone: "+33611111111" },
] as never; };
after(() => { PROVIDERS.minari.list = real; });
const integ = await db.integration.create({ data: { orgId: org.id, provider: "minari", label: "Minari", credentials: "x", webhookToken: `rat_${Date.now()}` } });

test("les anciens appels reçoivent téléphone et email, rien d'autre ne change", async () => {
  assert.equal(await backfillContacts(integ, {}), 2);
  const [a, b, c] = await Promise.all(["old1", "old2", "deja"].map((externalId) => db.call.findFirstOrThrow({ where: { orgId: org.id, externalId } })));
  assert.deepEqual(openContact(a.contactSealed), { phone: "+33612345678", email: "paul@acme.fr" });
  assert.equal(a.phoneLast4, "5678");
  assert.equal(a.meetingBooked, true); // le rendez-vous n'est pas touché
  assert.equal(openContact(b.contactSealed)?.phone, "+33698765432");
  assert.equal(c.contactSealed, "x"); // déjà renseigné : inchangé
  assert.equal(await db.call.count({ where: { orgId: org.id } }), 3); // aucun appel créé
  assert.equal((await db.task.findFirstOrThrow({ where: { orgId: org.id } })).dueAt.toISOString().slice(0, 10), "2027-01-01"); // relance intacte
});

test("le rattrapage ne tourne qu'une fois par outil", async () => {
  const again = await db.integration.findUniqueOrThrow({ where: { id: integ.id } });
  assert.equal(await backfillContacts(again, {}), 0);
  assert.equal(passes, 1);
});
