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
