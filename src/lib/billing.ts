import type { Organization } from "@prisma/client";

export const PLANS = {
  trial: { name: "Essai gratuit", maxClients: 3, price: 0 },
  solo: { name: "Solo", maxClients: 3, price: 25 },
  agency: { name: "Agence", maxClients: Infinity, price: 50 },
} as const;
export type PlanId = keyof typeof PLANS;

export const TRIAL_DAYS = 14;

/** L'espace est utilisable (essai en cours ou abonnement actif). Sinon : lecture seule. */
export function isActive(org: Pick<Organization, "subscriptionStatus" | "trialEndsAt">): boolean {
  if (org.subscriptionStatus === "active" || org.subscriptionStatus === "past_due") return true;
  return org.subscriptionStatus === "trialing" && org.trialEndsAt > new Date();
}

export function maxClients(org: Pick<Organization, "plan">): number {
  return (PLANS[org.plan as PlanId] ?? PLANS.trial).maxClients;
}
