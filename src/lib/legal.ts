// Informations légales de l'éditeur. À compléter : tant qu'un champ vaut TODO, la page l'affiche « à compléter ».
export const TODO = "[à compléter]";

export const LEGAL = {
  brand: "Trustpipe",
  site: "trustpipe.fr",
  // Éditeur
  company: TODO, // raison sociale, ou « Prénom Nom, entrepreneur individuel » pour une micro-entreprise
  legalForm: TODO, // SAS, SARL, EI (micro-entreprise)…
  capital: TODO, // ex. « 1 000 € » (supprimer pour une EI)
  siren: TODO,
  rcs: TODO, // ex. « RCS Paris 123 456 789 » (ou « dispensé d'immatriculation » pour une micro-entreprise)
  vat: TODO, // numéro de TVA intracommunautaire, ou « TVA non applicable, art. 293 B du CGI »
  address: TODO,
  publisher: TODO, // directeur de la publication (personne physique)
  email: TODO, // contact et exercice des droits RGPD
  // Hébergement et sous-traitants (connus)
  host: { name: "Vercel Inc.", address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis", site: "vercel.com" },
  processors: [
    { name: "Vercel Inc.", role: "Hébergement du site et de l'application", where: "États-Unis / UE (fonctions exécutées à Paris)" },
    { name: "Supabase Inc.", role: "Base de données", where: "UE (Paris, AWS eu-west-3)" },
    { name: "Stripe Payments Europe Ltd.", role: "Paiement et facturation", where: "UE / États-Unis" },
    { name: "Resend Inc.", role: "Envoi des emails de connexion et des récapitulatifs", where: "UE (Irlande) / États-Unis" },
    { name: "Anthropic PBC", role: "Analyse IA des appels et des réponses (résumés, objections, briefs)", where: "États-Unis" },
  ],
  updatedAt: "11 novembre 2026",
};

export const isTodo = (v: string) => v === TODO;
