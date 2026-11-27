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
