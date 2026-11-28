import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

// Téléphone et email du prospect : chiffrés en base, lisibles seulement dans l'appli.
const { db } = await import("../src/lib/db");
const { sealContact, openContact, prettyPhone } = await import("../src/lib/contact");
const { upsertCalls } = await import("../src/lib/ingest");

const tag = `co_${Date.now().toString(36)}`;
const org = await db.organization.create({ data: { name: `Coord ${tag}`, trialEndsAt: new Date() } });
after(async () => { await db.organization.delete({ where: { id: org.id } }); await db.$disconnect(); });

test("chiffrement : rien de lisible en base, tout revient à l'ouverture", () => {
  const sealed = sealContact("+33 6 12 34 56 78", " Paul.Morel@Atelier-Morel.fr ")!;
  assert.ok(!sealed.includes("612345678") && !sealed.toLowerCase().includes("morel"), "aucune coordonnée en clair");
  assert.deepEqual(openContact(sealed), { phone: "+33 6 12 34 56 78", email: "paul.morel@atelier-morel.fr" });
  assert.equal(sealContact("", ""), null, "rien à stocker");
  assert.equal(sealContact(undefined, "pas-un-email"), null, "email invalide ignoré");
  assert.equal(openContact("valeur-abîmée"), null);
  assert.equal(prettyPhone("+33612345678"), "+33 6 12 34 56 78");
});

test("synchronisation : les coordonnées de l'appel sont enregistrées chiffrées", async () => {
  await upsertCalls({ orgId: org.id, provider: "minari", integrationId: null, clientId: null }, [{ externalId: tag, startedAt: new Date(), durationSec: 60, status: "connected", connected: true, meetingBooked: false, firstName: "Paul", lastName: "Morel", phone: "+33612345678", email: "paul@atelier-morel.fr" }]);
  const c = await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: tag } });
  assert.equal(c.phoneLast4, "5678");
  assert.ok(c.contactSealed && !c.contactSealed.includes("612345678"));
  assert.deepEqual(openContact(c.contactSealed), { phone: "+33612345678", email: "paul@atelier-morel.fr" });
});
