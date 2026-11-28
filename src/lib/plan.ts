import { cache } from "react";
import { orgOf } from "./session";
import { hasAi, hasPremium } from "./billing";

/**
 * Ce que la formule de l'entreprise ouvre, pour adapter l'affichage (une lecture par page).
 * `ai` : résumés, objections, transcription, relances, assistant (à partir d'Essentiel).
 * `premium` : écoute des enregistrements, briefs, débriefs, connecteur Claude.
 */
export const planOf = cache(async (orgId: string) => {
  const org = await orgOf(orgId);
  return { plan: org?.plan || "trial", ai: !org || hasAi(org), premium: !org || hasPremium(org) };
});

/** Pages non incluses dans la formule : elles restent visibles dans le menu, grisées, avec le nom de la formule qui les ouvre. */
export const lockedIcons = (p: { ai: boolean; premium: boolean }): Record<string, string> => ({ ...(p.ai ? {} : { relances: "Essentiel", coach: "Essentiel" }), ...(p.premium ? {} : { brief: "Premium" }) });
