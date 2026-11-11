import { NextResponse } from "next/server";
import { db } from "./db";
import { isActive } from "./billing";
import type { Scope } from "./access";

export const jsonError = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Écriture autorisée seulement si l'essai ou l'abonnement de l'organisation est en cours. */
export async function assertActive(scope: Scope) {
  const org = await db.organization.findUnique({ where: { id: scope.orgId }, select: { subscriptionStatus: true, trialEndsAt: true } });
  if (!org || !isActive(org)) return jsonError("L'abonnement de cet espace n'est plus actif. Les données restent consultables.", 402);
  return null;
}

/** Vérifie que la requête vient bien de notre propre site (protection CSRF des routes POST). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const app = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(req.url).origin;
  return origin === app || origin === new URL(req.url).origin;
}
