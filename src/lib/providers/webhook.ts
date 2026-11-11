import type { Provider } from "./types";

/**
 * Source universelle : n'importe quel outil (La Growth Machine, Waalaxy, Apollo, Lemlist, Brevo…)
 * envoie ses événements via Zapier, Make ou n8n vers /api/ingest/<jeton>. Aucune clé à fournir.
 */
export const webhook: Provider = {
  id: "webhook",
  label: "Autre outil (Zapier, Make, n8n)",
  channels: ["call", "email", "linkedin"],
  credentialFields: [],
  help: "Pour tous les autres outils : une URL à brancher dans Zapier, Make ou n8n. Chaque événement (email envoyé, réponse, invitation LinkedIn, appel…) arrive en direct.",
  async test() {},
};
