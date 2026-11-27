import type { Organization } from "@prisma/client";

/** Formules. `perSeat` : le prix est par commercial (le nombre est choisi au paiement). */
export const PLANS = {
  trial: { name: "Essai gratuit", maxClients: 3, price: 0, perSeat: false },
  solo: { name: "Solo", maxClients: 3, price: 24.99, perSeat: false },
  solo_plus: { name: "Solo Illimité", maxClients: Infinity, price: 34.99, perSeat: false },
  starter: { name: "Découverte", maxClients: Infinity, price: 19.99, perSeat: true },
  agency: { name: "Essentiel", maxClients: Infinity, price: 49.99, perSeat: true },
  premium: { name: "Premium", maxClients: Infinity, price: 69.99, perSeat: true },
} as const;
/**
 * Formules proposées à la souscription, par commercial suivi : Découverte (19,99 € HT, sans IA, volontairement limitée),
 * Essentiel (49,99 € HT, recommandée) et Premium (69,99 € HT).
 * Solo et Solo Illimité restent reconnues pour les abonnements déjà souscrits, mais ne sont plus proposées.
 */
export const PAID_PLANS = ["starter", "agency", "premium"] as const;
/** Contenu de chaque formule (site, souscription, abonnement). `no` : ce qui manque, affiché barré. */
export const PLAN_FEATURES: Record<"starter" | "agency" | "premium", { tag: string; yes: string[]; no: string[] }> = {
  starter: { tag: "Sans IA", yes: ["Jusqu'à 2 commerciaux", "Appels de vos commerciaux en direct", "Classement des commerciaux"], no: ["Résumé et analyse IA des appels", "Objections et relances automatiques", "Assistant IA"] },
  agency: { tag: "Recommandé", yes: ["Jusqu'à 4 commerciaux", "Appels en direct et classement", "Transcription et écoute de chaque appel", "Résumé et analyse IA de chaque appel", "Objections et relances automatiques", "Assistant IA sur toute l'équipe"], no: ["Commerciaux illimités", "Connecteur Claude"] },
  premium: { tag: "Illimité", yes: ["Commerciaux illimités", "Tout Essentiel", "Connecteur Claude", "Briefs pré-rendez-vous et débriefs de visio", "Transcription automatique des enregistrements"], no: [] },
};
/** Nombre maximal de commerciaux par formule : 2 en Découverte, 4 en Essentiel, illimité en Premium. */
export const PLAN_CAP: Record<string, number> = { starter: 2, agency: 4, premium: Infinity };
/** Ce que Premium ajoute à Essentiel (affiché sur le site, la souscription et l'abonnement). */
export const PREMIUM_EXTRAS = ["Commerciaux illimités", "Briefs pré-rendez-vous et débriefs de visio", "Transcription automatique des appels enregistrés", "Connecteur Claude"] as const;
/**
 * Fonctions Premium (briefs, débriefs, transcription par Trustpipe, connecteur Claude) :
 * incluses partout sauf dans la formule Essentiel. L'essai et les anciennes formules les gardent.
 */
export const hasPremium = (org: { plan: string }) => org.plan !== "agency" && org.plan !== "starter";
/** Analyse IA des appels (résumés, objections, relances automatiques) et assistant IA : tout sauf Découverte. */
export const hasAi = (org: { plan: string }) => org.plan !== "starter";
/** Formules sans IA avancée ou sans IA du tout, pour filtrer les traitements automatiques. */
export const NO_PREMIUM_PLANS = ["agency", "starter"];
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

/** Nombre de commerciaux suivis autorisés : le nombre payé, plafonné par la formule (2 en Découverte, 4 en Essentiel). */
export function maxClients(org: Pick<Organization, "plan" | "seats">): number {
  if (org.plan in PLAN_CAP) return Math.min(Math.max(1, org.seats), PLAN_CAP[org.plan]);
  return (PLANS[org.plan as PlanId] ?? PLANS.trial).maxClients;
}
