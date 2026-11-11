import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { sendLoginEmail, type LinkPurpose } from "./email";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

export const normEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

const APP = () => process.env.APP_URL || "http://localhost:3000";
const safeRedirect = (r?: string | null) => (r && r.startsWith("/") && !r.startsWith("//") ? r : null);

/**
 * Crée un lien à usage unique et l'envoie par email.
 * - login  : connexion sans mot de passe (30 min)
 * - verify : confirmation d'inscription (24 h) ; `payload` = mot de passe chiffré, appliqué seulement au clic
 * - reset  : mot de passe oublié (30 min), ouvre /reinitialiser
 */
export async function sendMagicLink(rawEmail: string, opts: { redirect?: string; intro?: string; purpose?: LinkPurpose; payload?: string } = {}) {
  const email = normEmail(rawEmail);
  if (!isEmail(email)) throw new Error("Adresse email invalide");
  const recent = await db.loginToken.count({ where: { email, createdAt: { gt: new Date(Date.now() - 15 * 60e3) } } });
  if (recent >= 5) throw new Error("Trop de demandes. Réessayez dans quelques minutes.");
  const purpose = opts.purpose || "login";
  const token = randomToken();
  const ttl = purpose === "verify" ? 24 * 3600e3 : 30 * 60e3;
  await db.loginToken.create({ data: { email, tokenHash: sha256(token), redirect: safeRedirect(opts.redirect), purpose, payload: opts.payload ?? null, expiresAt: new Date(Date.now() + ttl) } });
  const link = purpose === "reset" ? `${APP()}/reinitialiser?token=${encodeURIComponent(token)}` : `${APP()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendLoginEmail(email, link, opts.intro, purpose);
}

/**
 * Consomme un lien de connexion ou de confirmation ; renvoie l'utilisateur (créé au besoin) et la redirection.
 * Cliquer le lien prouve la possession de l'adresse : elle est marquée confirmée, et le mot de passe
 * choisi à l'inscription n'est enregistré qu'à ce moment-là.
 */
export async function consumeToken(token: string) {
  const row = await db.loginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.purpose === "reset") return null;
  const upd = await db.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (upd.count !== 1) return null;
  const confirm = { emailVerifiedAt: new Date(), ...(row.purpose === "verify" && row.payload ? { passwordHash: row.payload, failedLogins: 0, lockedUntil: null } : {}) };
  const user = await db.user.upsert({ where: { email: row.email }, update: confirm, create: { email: row.email, ...confirm } });
  return { user, redirect: row.redirect ?? (row.purpose === "verify" ? "/onboarding" : null) };
}

const MAX_FAILS = 8, LOCK_MS = 15 * 60e3;

/** Connexion par mot de passe. Message d'erreur volontairement identique (email inconnu ou mauvais mot de passe). */
export async function loginWithPassword(rawEmail: string, pw: string): Promise<{ userId: string } | { error: string }> {
  const email = normEmail(rawEmail);
  const bad = { error: "Email ou mot de passe incorrect." };
  const user = isEmail(email) ? await db.user.findUnique({ where: { email } }) : null;
  if (!user) { await verifyPassword(pw, DUMMY_HASH); return bad; } // même durée de calcul qu'un vrai compte
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "Trop d'essais. Réessayez dans quelques minutes, ou recevez un lien de connexion par email." };
  if (!user.passwordHash) return { error: "Ce compte n'a pas encore de mot de passe : connectez-vous avec un lien par email, puis définissez-en un dans Réglages." };
  if (!(await verifyPassword(pw, user.passwordHash))) {
    const fails = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: fails } });
    return bad;
  }
  if (user.failedLogins || user.lockedUntil) await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  return { userId: user.id };
}
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

/** Applique un lien « mot de passe oublié » : nouveau mot de passe, adresse confirmée, compteur remis à zéro. */
export async function resetPasswordWithToken(token: string, pw: string): Promise<{ userId: string } | { error: string }> {
  const row = await db.loginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.purpose !== "reset") return { error: "Ce lien a expiré ou a déjà servi. Refaites une demande." };
  const problem = passwordProblem(pw, row.email);
  if (problem) return { error: problem };
  const upd = await db.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (upd.count !== 1) return { error: "Ce lien a déjà servi." };
  const passwordHash = await hashPassword(pw);
  const user = await db.user.upsert({ where: { email: row.email }, update: { passwordHash, emailVerifiedAt: new Date(), failedLogins: 0, lockedUntil: null }, create: { email: row.email, passwordHash, emailVerifiedAt: new Date() } });
  return { userId: user.id };
}
