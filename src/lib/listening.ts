/**
 * Écoute des appels : ce que l'utilisateur doit activer dans son outil d'appel pour que Trustpipe
 * récupère l'enregistrement (ou le lien d'écoute) de chaque appel.
 */
export type ListeningHelp = { title: string; steps: string[]; kind: "link" | "audio" };

const HELP: Record<string, ListeningHelp> = {
  minari: {
    title: "Activez le partage externe des appels dans Minari",
    kind: "link",
    steps: [
      "Dans Minari, ouvrez les réglages de votre entreprise (Settings).",
      "Activez le partage externe des appels (« External call sharing »).",
      "Revenez ici et cliquez sur « Récupérer les enregistrements » : chaque appel aura son bouton Écouter.",
    ],
  },
};

const GENERIC: ListeningHelp = {
  title: "Activez l'enregistrement ou le partage des appels dans votre outil",
  kind: "audio",
  steps: [
    "Dans les réglages de votre outil d'appel, vérifiez que l'enregistrement des appels (ou leur partage) est activé.",
    "Revenez ici et cliquez sur « Récupérer les enregistrements » : chaque appel aura son lecteur audio.",
  ],
};

export function listeningHelp(provider: string, label: string): ListeningHelp {
  const h = HELP[provider];
  if (h) return h;
  return { ...GENERIC, title: `Activez l'enregistrement ou le partage des appels dans ${label}` };
}

/** Outils dont les appels peuvent avoir un enregistrement (hors import, saisie manuelle et webhook générique). */
export const hasRecordings = (provider: string) => !["csv", "manual", "webhook"].includes(provider);
