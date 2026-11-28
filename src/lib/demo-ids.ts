/** Identifiants de la démo publique (sans dépendance : importable partout). */
export const DEMO_ORG_ID = "demo_trustpipe";
export const DEMO_USER_ID = "demo_user";
export const DEMO_MESSAGE = "Démo en lecture seule : créez votre compte pour essayer Trustpipe avec vos propres appels.";
export const isDemoOrg = (orgId?: string | null) => orgId === DEMO_ORG_ID;
export const isDemoUser = (userId?: string | null) => userId === DEMO_USER_ID;
