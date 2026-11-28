import type { Organization } from "@prisma/client";

/** Formules. Prix fixe par mois ; chaque formule couvre un nombre de commerciaux (voir PLAN_CAP). */
export const PLANS = {
  trial: { name: "Sans formule", maxClients: 3, price: 0, perSeat: false },
  solo: { name: "Solo", maxClients: 3, price: 24.99, perSeat: false },
  solo_plus: { name: "Solo Illimité", maxClients: Infinity, price: 34.99, perSeat: false },
  starter: { name: "Découverte", maxClients: 2, price: 29.99, perSeat: false },
  agency: { name: "Essentiel", maxClients: 10, price: 99.99, perSeat: false },
  premium: { name: "Premium", maxClients: Infinity, price: 199.99, perSeat: false },
} as const;
/**
 * Formules proposées à la souscription, à prix fixe par mois : Découverte (29,99 € HT, sans IA, volontairement limitée),
 * Essentiel (99,99 € HT, recommandée) et Premium (199,99 € HT, commerciaux illimités).
 * Solo et Solo Illimité restent reconnues pour les abonnements déjà souscrits, mais ne sont plus proposées.
 */
export const PAID_PLANS = ["starter", "agency", "premium"] as const;
/** Contenu de chaque formule (site, souscription, abonnement). `no` : ce qui manque, affiché barré. */
export const PLAN_FEATURES: Record<"starter" | "agency" | "premium", { tag: string; yes: string[]; no: string[] }> = {
  starter: { tag: "Sans IA", yes: ["Jusqu'à 2 commerciaux", "Appels de vos commerciaux en direct", "Classement des commerciaux"], no: ["Résumé et analyse IA des appels", "Objections et relances automatiques", "Assistant IA"] },
  agency: { tag: "Recommandé", yes: ["Jusqu'à 10 commerciaux", "Appels en direct et classement", "Transcription de chaque appel", "Résumé et analyse IA de chaque appel", "Objections et relances automatiques", "Assistant IA sur toute l'équipe"], no: ["Commerciaux illimités", "Écoute des enregistrements", "Connecteur Claude", "Briefs et débriefs de rendez-vous"] },
  premium: { tag: "Tout inclus", yes: ["Commerciaux illimités", "Tout Essentiel", "Écoute de chaque appel", "Connecteur Claude", "Briefs pré-rendez-vous et débriefs de visio", "Transcription automatique des enregistrements"], no: [] },
};
/** Nombre maximal de commerciaux par formule : 2 en Découverte, 10 en Essentiel, illimité en Premium. */
export const PLAN_CAP: Record<string, number> = { starter: 2, agency: 10, premium: Infinity };
/** Ce que Premium ajoute à Essentiel (affiché sur le site, la souscription et l'abonnement). */
export const PREMIUM_EXTRAS = ["Commerciaux illimités", "Écoute de chaque appel", "Briefs pré-rendez-vous et débriefs de visio", "Transcription automatique des appels enregistrés", "Connecteur Claude"] as const;
/**
 * Fonctions Premium (briefs, débriefs, transcription par Trustpipe, connecteur Claude) :
 * réservées à Premium (et aux anciennes formules). Essai de 7 jours avec carte enregistrée : l'espace choisit sa formule avant d'entrer, le premier prélèvement a lieu au bout de 7 jours.
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

/** Essai de 7 jours : la carte est enregistrée à la souscription, le premier prélèvement a lieu à la fin de l'essai. */
export const TRIAL_DAYS = 7;

/** L'espace est utilisable (essai en cours ou abonnement actif). Sinon : lecture seule. */
export function isActive(org: Pick<Organization, "subscriptionStatus" | "trialEndsAt">): boolean {
  if (org.subscriptionStatus === "active" || org.subscriptionStatus === "past_due") return true;
  return org.subscriptionStatus === "trialing" && org.trialEndsAt > new Date();
}

/** Nombre de commerciaux suivis autorisés : fixé par la formule (2 en Découverte, 10 en Essentiel, illimité en Premium). */
export function maxClients(org: Pick<Organization, "plan" | "seats">): number {
  if (org.plan in PLAN_CAP) return PLAN_CAP[org.plan];
  return (PLANS[org.plan as PlanId] ?? PLANS.trial).maxClients;
}
