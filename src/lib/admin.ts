/** Espaces qui voient la page « Inscriptions » (statistiques de lancement). Par défaut : l'espace de l'éditeur. */
export const isAdminOrg = (orgId: string) => (process.env.ADMIN_ORG_IDS || "cmwc5josx0000ju08wdr4vktq").split(",").map((s) => s.trim()).includes(orgId);
