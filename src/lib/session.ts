import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "cockpit_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "");

export async function createSession(userId: string) {
  if ((process.env.AUTH_SECRET || "").length < 32) throw new Error("AUTH_SECRET manquant ou trop court");
  const jwt = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
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
    return await db.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: { include: { org: true } },
        clientAccess: { include: { client: { include: { org: true } } } },
      },
    });
  } catch {
    return null;
  }
});
export type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
