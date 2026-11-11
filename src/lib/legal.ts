// Informations légales de l'éditeur. À compléter : tant qu'un champ vaut TODO, la page l'affiche « à compléter ».
export const TODO = "[à compléter]";

export const LEGAL = {
  brand: "Trustpipe",
  site: "trustpipe.fr",
  // Éditeur
  company: "Augustin Grazzini (nom commercial LigneDirecte)", // raison sociale, ou « Prénom Nom, entrepreneur individuel » pour une micro-entreprise
  legalForm: "entrepreneur individuel (EI)", // SAS, SARL, EI (micro-entreprise)…
  capital: "", // ex. « 1 000 € » (supprimer pour une EI)
  siren: "131 650 632 (SIRET 131 650 632 00014)",
  rcs: "immatriculé au Registre national des entreprises (RNE)", // ex. « RCS Paris 123 456 789 » (ou « dispensé d'immatriculation » pour une micro-entreprise)
  vat: "FR15131650632", // numéro de TVA intracommunautaire, ou « TVA non applicable, art. 293 B du CGI »
  address: "93 boulevard Jeanne d'Arc, 13005 Marseille, France",
  publisher: "Augustin Grazzini", // directeur de la publication (personne physique)
  email: "augustingrazzini@gmail.com", // contact et exercice des droits RGPD
  // Hébergement et sous-traitants (connus)
  host: { name: "Vercel Inc.", address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis", site: "vercel.com" },
  processors: [
    { name: "Vercel Inc.", role: "Hébergement du site et de l'application", where: "États-Unis / UE (fonctions exécutées à Paris)" },
    { name: "Supabase Inc.", role: "Base de données", where: "UE (Paris, AWS eu-west-3)" },
    { name: "Stripe Payments Europe Ltd.", role: "Paiement et facturation", where: "UE / États-Unis" },
    { name: "Resend Inc.", role: "Envoi des emails de connexion et des récapitulatifs", where: "UE (Irlande) / États-Unis" },
    { name: "Anthropic PBC", role: "Analyse IA des appels et des réponses (résumés, objections, briefs)", where: "États-Unis" },
    { name: "Gladia SAS", role: "Transcription des enregistrements d'appels", where: "UE (France)" },
  ],
  updatedAt: "11 novembre 2026",
};

export const isTodo = (v: string) => v === TODO;
