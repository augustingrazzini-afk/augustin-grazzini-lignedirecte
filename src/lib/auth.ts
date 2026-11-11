import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { sendLoginEmail } from "./email";

export const normEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

/** Crée un lien de connexion à usage unique (30 min) et l'envoie par email. */
export async function sendMagicLink(rawEmail: string, opts: { redirect?: string; intro?: string } = {}) {
  const email = normEmail(rawEmail);
  if (!isEmail(email)) throw new Error("Adresse email invalide");
  const recent = await db.loginToken.count({ where: { email, createdAt: { gt: new Date(Date.now() - 15 * 60e3) } } });
  if (recent >= 5) throw new Error("Trop de demandes. Réessayez dans quelques minutes.");
  const token = randomToken();
  const redirect = opts.redirect && opts.redirect.startsWith("/") && !opts.redirect.startsWith("//") ? opts.redirect : null;
  await db.loginToken.create({ data: { email, tokenHash: sha256(token), redirect, expiresAt: new Date(Date.now() + 30 * 60e3) } });
  const link = `${process.env.APP_URL || "http://localhost:3000"}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendLoginEmail(email, link, opts.intro);
}

/** Consomme un jeton ; renvoie l'utilisateur (créé à la première connexion) et la redirection. */
export async function consumeToken(token: string) {
  const row = await db.loginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  const upd = await db.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (upd.count !== 1) return null;
  const user = await db.user.upsert({ where: { email: row.email }, update: {}, create: { email: row.email } });
  return { user, redirect: row.redirect };
}
