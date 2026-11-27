import type { Organization } from "@prisma/client";

/** Formules. `perSeat` : le prix est par commercial (le nombre est choisi au paiement). */
export const PLANS = {
  trial: { name: "Essai gratuit", maxClients: 3, price: 0, perSeat: false },
  solo: { name: "Solo", maxClients: 3, price: 24.99, perSeat: false },
  solo_plus: { name: "Solo Illimité", maxClients: Infinity, price: 34.99, perSeat: false },
  agency: { name: "Équipe", maxClients: Infinity, price: 49.99, perSeat: true },
} as const;
/** Formules proposées à la souscription, dans l'ordre d'affichage. */
export const PAID_PLANS = ["solo", "solo_plus", "agency"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
/** Nombre de commerciaux autorisés : 1 pour les formules Solo, le nombre payé pour la formule Équipe. */
export const seatLimit = (org: { plan: string; seats: number }) => (org.plan === "agency" ? Math.max(1, org.seats) : 1);
export type PlanId = keyof typeof PLANS;

/** Prix affiché à la française : 24,99 ou 50. */
export const euros = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export const TRIAL_DAYS = 14;

/** L'espace est utilisable (essai en cours ou abonnement actif). Sinon : lecture seule. */
export function isActive(org: Pick<Organization, "subscriptionStatus" | "trialEndsAt">): boolean {
  if (org.subscriptionStatus === "active" || org.subscriptionStatus === "past_due") return true;
  return org.subscriptionStatus === "trialing" && org.trialEndsAt > new Date();
}

export function maxClients(org: Pick<Organization, "plan">): number {
  return (PLANS[org.plan as PlanId] ?? PLANS.trial).maxClients;
}
