import { test, after } from "node:test";
import assert from "node:assert/strict";

// Correctifs de l'audit pré-lancement : redirection ouverte, sessions révocables.
const { db } = await import("../src/lib/db");
const { safeRedirect, resetPasswordWithToken } = await import("../src/lib/auth");
const { sha256, randomToken } = await import("../src/lib/crypto");

const email = `sec_${Date.now().toString(36)}@exemple.fr`;
after(async () => { await db.loginToken.deleteMany({ where: { email } }); await db.user.deleteMany({ where: { email } }); await db.$disconnect(); });

test("redirection après connexion : chemins internes uniquement", () => {
  for (const ok of ["/app", "/portal/abc/sources", "/oauth/authorize?client_id=x&state=y"]) assert.equal(safeRedirect(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "evil.com", "/app\\x", "/a\nb", "", null, undefined])
    assert.equal(safeRedirect(bad as string), null, `refusé : ${JSON.stringify(bad)}`);
  // Ce que le navigateur ferait d'un chemin accepté reste sur le site.
  assert.equal(new URL(safeRedirect("/app")!, "https://trustpipe.fr").origin, "https://trustpipe.fr");
});

test("sessions : un nouveau mot de passe révoque les sessions existantes", async () => {
  const u = await db.user.create({ data: { email } });
  assert.equal(u.sessionVersion, 0);
  const token = randomToken();
  await db.loginToken.create({ data: { email, tokenHash: sha256(token), purpose: "reset", expiresAt: new Date(Date.now() + 60e3) } });
  const r = await resetPasswordWithToken(token, "Nouveau-secret-2026!");
  assert.ok("userId" in r);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).sessionVersion, 1, "les anciens jetons (version 0) ne sont plus acceptés");
});

test("fin de contrat : données supprimées 30 jours après la résiliation, pas avant", async () => {
  const { purgeEndedOrgs } = await import("../src/lib/purge");
  const tag = Date.now().toString(36);
  const mk = async (name: string, status: string, daysAgo: number | null) => {
    const o = await db.organization.create({ data: { name: `${name} ${tag}`, trialEndsAt: new Date(), subscriptionStatus: status, endedAt: daysAgo == null ? null : new Date(Date.now() - daysAgo * 864e5) } });
    await db.call.create({ data: { orgId: o.id, provider: "test", externalId: `p-${o.id}`, startedAt: new Date(), status: "connected" } });
    return o;
  };
  const old = await mk("Résilié 31 j", "canceled", 31), recent = await mk("Résilié 5 j", "canceled", 5), active = await mk("Actif", "active", null);
  try {
    await purgeEndedOrgs();
    const left = async (id: string) => db.call.count({ where: { orgId: id } });
    assert.deepEqual([await left(old.id), await left(recent.id), await left(active.id)], [0, 1, 1]);
    assert.ok((await db.organization.findUniqueOrThrow({ where: { id: old.id } })).purgedAt, "l'espace reste, marqué comme purgé");
  } finally {
    await db.call.deleteMany({ where: { orgId: { in: [old.id, recent.id, active.id] } } });
    await db.organization.deleteMany({ where: { id: { in: [old.id, recent.id, active.id] } } });
  }
});

test("inscription : l'acceptation des conditions générales est datée et versionnée", async () => {
  const { consumeToken } = await import("../src/lib/auth");
  const mail = `cgv_${Date.now().toString(36)}@exemple.fr`, token = randomToken();
  await db.loginToken.create({ data: { email: mail, tokenHash: sha256(token), purpose: "verify", payload: "scrypt$x", expiresAt: new Date(Date.now() + 60e3) } });
  const r = await consumeToken(token);
  try {
    assert.ok(r?.user.termsAcceptedAt instanceof Date);
    assert.match(r!.user.termsVersion || "", /2026/);
  } finally { await db.loginToken.deleteMany({ where: { email: mail } }); await db.user.deleteMany({ where: { email: mail } }); }
});

test("export CSV : les cellules qui ressemblent à une formule sont neutralisées", async () => {
  const { csvCell } = await import("../src/lib/csv");
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  for (const bad of ["+33 6", "-1", "@SUM(A1)", "\tx"]) assert.ok(csvCell(bad).startsWith(`"'`), bad);
  assert.equal(csvCell("Paul; \"Morel\""), `"Paul; ""Morel"""`);
  assert.equal(csvCell(null), `""`);
});

test("opposition : un prospect qui refuse d'être recontacté n'a plus aucune relance", async () => {
  const { RE_OPTOUT, upsertTask, isOptedOut } = await import("../src/lib/tasks");
  const { afterCall } = await import("../src/lib/ingest");
  for (const yes of ["Ne plus me rappeler svp", "Demande à ne pas être recontacté.", "Demande à être retiré de la liste", "inscrit sur Bloctel", "do not call"]) assert.ok(RE_OPTOUT.test(yes), yes);
  for (const no of ["Rappeler jeudi", "Pas intéressé pour le moment", "Envoyer la plaquette", "Ne pas rappeler avant mars", "Il ne décroche pas, rappeler demain"]) assert.ok(!RE_OPTOUT.test(no), no);
  const tag = Date.now().toString(36);
  const org = await db.organization.create({ data: { name: `Opp ${tag}`, trialEndsAt: new Date(Date.now() + 864e5) } });
  try {
    const mk = (id: string, summary: string) => db.call.create({ data: { orgId: org.id, provider: "test", externalId: id, startedAt: new Date(), status: "connected", connected: true, durationSec: 60, firstName: "Luc", lastName: "Petit", company: "Acme", contactKey: `k-${tag}`, summary } });
    const c1 = await mk("o1", "Rappeler la semaine prochaine");
    await afterCall(c1);
    assert.equal(await db.task.count({ where: { orgId: org.id, status: "open" } }), 1, "relance créée");
    const c2 = await mk("o2", "Très agacé : demande à ne plus être rappelé.");
    await afterCall(c2);
    assert.equal(await isOptedOut(org.id, `k-${tag}`), true);
    assert.equal(await db.task.count({ where: { orgId: org.id, status: "open" } }), 0, "relance retirée");
    await upsertTask(c1, "call", "autre", { channel: "call", dueAt: new Date(), reason: "x" }, "rule");
    assert.equal(await db.task.count({ where: { orgId: org.id, status: "open" } }), 0, "aucune nouvelle relance");
  } finally { await db.organization.delete({ where: { id: org.id } }); }
});

test("conservation : enregistrements effacés après 6 mois, transcriptions après 12", async () => {
  const { purgeOldMedia } = await import("../src/lib/purge");
  const tag = Date.now().toString(36);
  const org = await db.organization.create({ data: { name: `Cons ${tag}`, trialEndsAt: new Date(Date.now() + 864e5) } });
  const mk = (id: string, days: number) => db.call.create({ data: { orgId: org.id, provider: "test", externalId: id, startedAt: new Date(Date.now() - days * 864e5), status: "connected", summary: "Résumé gardé", recordingUrl: "https://ex.test/a.mp3", transcript: [{ s: "A", t: "Bonjour", ts: "" }] } });
  try {
    const [recent, m7, m13] = [await mk("r", 10), await mk("m7", 215), await mk("m13", 400)];
    await purgeOldMedia();
    const get = async (id: string) => { const c = await db.call.findUniqueOrThrow({ where: { id } }); return [!!c.recordingUrl, (c.transcript as unknown[]).length, c.summary]; };
    assert.deepEqual(await get(recent.id), [true, 1, "Résumé gardé"]);
    assert.deepEqual(await get(m7.id), [false, 1, "Résumé gardé"]);
    assert.deepEqual(await get(m13.id), [false, 0, "Résumé gardé"]);
  } finally { await db.organization.delete({ where: { id: org.id } }); }
});
