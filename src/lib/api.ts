import { NextResponse } from "next/server";
import { db } from "./db";
import { hasAi, hasPremium, isActive } from "./billing";
import type { Scope } from "./access";

export const jsonError = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Écriture autorisée seulement si l'essai ou l'abonnement de l'organisation est en cours. */
/** Assistant IA : inclus à partir de la formule Essentiel. */
export async function assertAi(scope: Scope) {
  const org = await db.organization.findUnique({ where: { id: scope.orgId }, select: { plan: true } });
  if (org && !hasAi(org)) return jsonError("L'assistant IA est inclus à partir de la formule Essentiel (99,99 € HT par mois). Changez de formule depuis la page Abonnement.", 402);
  return null;
}

/** Fonction réservée à la formule Premium (briefs, débriefs, connecteur Claude). */
export async function assertPremium(scope: Scope) {
  const org = await db.organization.findUnique({ where: { id: scope.orgId }, select: { plan: true } });
  if (org && !hasPremium(org)) return jsonError("Cette fonction est incluse dans la formule Premium (199,99 € HT par mois). Passez en Premium depuis la page Abonnement.", 402);
  return null;
}

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
