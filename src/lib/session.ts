import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "cockpit_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "");

export async function createSession(userId: string, maxAge = MAX_AGE) {
  if ((process.env.AUTH_SECRET || "").length < 32) throw new Error("AUTH_SECRET manquant ou trop court");
  const u = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  const jwt = await new SignJWT({ sub: userId, v: u?.sessionVersion ?? 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(secret());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
}

/** Invalide toutes les sessions ouvertes de l'utilisateur (déconnexion, nouveau mot de passe). */
export async function revokeSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Utilisateur connecté (ou null), avec ses espaces : organisations et portails clients. */
export const currentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: { include: { org: true } },
        clientAccess: { include: { client: { include: { org: true } } } },
      },
    });
    // Session révoquée (déconnexion, changement de mot de passe) : le jeton ne vaut plus rien.
    if (!user || Number(payload.v ?? 0) !== user.sessionVersion) return null;
    return user;
  } catch {
    return null;
  }
});
export type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
