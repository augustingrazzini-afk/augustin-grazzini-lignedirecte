import { test, after } from "node:test";
import assert from "node:assert/strict";

const { db } = await import("../src/lib/db");
const { hashPassword, verifyPassword, passwordProblem } = await import("../src/lib/password");
const { sendMagicLink, consumeToken, loginWithPassword, resetPasswordWithToken } = await import("../src/lib/auth");
const { sha256, randomToken } = await import("../src/lib/crypto");

const email = `auth_${Date.now().toString(36)}@exemple.fr`;
after(async () => {
  await db.loginToken.deleteMany({ where: { email } });
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

/** Le lien n'est pas lisible dans la base (seul son hash l'est) : on crée le jeton nous-mêmes, comme sendMagicLink. */
async function link(purpose: "verify" | "reset", payload?: string) {
  const token = randomToken();
  await db.loginToken.create({ data: { email, tokenHash: sha256(token), purpose, payload, expiresAt: new Date(Date.now() + 3600e3) } });
  return token;
}

test("mot de passe : hachage scrypt et règles", async () => {
  const h = await hashPassword("Correct-horse-42");
  assert.ok(h.startsWith("scrypt$") && !h.includes("Correct"));
  assert.equal(await verifyPassword("Correct-horse-42", h), true);
  assert.equal(await verifyPassword("correct-horse-42", h), false);
  assert.ok(passwordProblem("court"));
  assert.ok(passwordProblem("1234567890123"));
  assert.ok(passwordProblem("jean.dupont2026", "jean.dupont@acme.fr"));
  assert.equal(passwordProblem("Prospection-2026!", "jean@acme.fr"), null);
});

test("inscription : le mot de passe ne s'applique qu'à la confirmation de l'email", async () => {
  await sendMagicLink(email, { purpose: "verify", payload: await hashPassword("Mon-Mot-De-Passe-1"), redirect: "/onboarding" });
  const pending = await db.loginToken.findFirst({ where: { email, purpose: "verify" } });
  assert.ok(pending?.payload?.startsWith("scrypt$"), "mot de passe en attente sur le lien");
  assert.equal(await db.user.count({ where: { email } }), 0, "pas de compte tant que l'email n'est pas confirmé");
  assert.deepEqual(await loginWithPassword(email, "Mon-Mot-De-Passe-1"), { error: "Email ou mot de passe incorrect." });

  const token = await link("verify", await hashPassword("Mon-Mot-De-Passe-1"));
  const r = await consumeToken(token);
  assert.equal(r?.redirect, "/onboarding");
  assert.ok(r?.user.emailVerifiedAt, "adresse confirmée");
  assert.equal(await consumeToken(token), null, "lien à usage unique");
  assert.ok("userId" in (await loginWithPassword(email.toUpperCase(), "Mon-Mot-De-Passe-1")), "connexion acceptée après confirmation");
});

test("connexion : blocage temporaire après 8 essais ratés", async () => {
  for (let i = 0; i < 8; i++) assert.ok("error" in (await loginWithPassword(email, "mauvais-mot-de-passe")));
  const r = await loginWithPassword(email, "Mon-Mot-De-Passe-1");
  assert.ok("error" in r && /Trop d'essais/.test(r.error), "bloqué même avec le bon mot de passe");
});

test("mot de passe oublié : nouveau mot de passe, déblocage, lien à usage unique", async () => {
  const token = await link("reset");
  assert.equal(await consumeToken(token), null, "un lien de réinitialisation ne sert pas à se connecter");
  assert.ok("error" in (await resetPasswordWithToken(token, "court")));
  assert.ok("userId" in (await resetPasswordWithToken(token, "Nouveau-Secret-77")));
  assert.ok("error" in (await resetPasswordWithToken(token, "Encore-Un-Autre-88")), "lien déjà utilisé");
  assert.ok("userId" in (await loginWithPassword(email, "Nouveau-Secret-77")), "débloqué et nouveau mot de passe actif");
  assert.ok("error" in (await loginWithPassword(email, "Mon-Mot-De-Passe-1")), "ancien mot de passe refusé");
});
