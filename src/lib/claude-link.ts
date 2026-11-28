/** Adresse du connecteur Trustpipe (serveur MCP) à ajouter dans Claude. */
export const mcpUrl = () => `${(process.env.APP_URL || "https://trustpipe.fr").replace(/\/$/, "")}/api/mcp`;

/**
 * Lien officiel de Claude qui ouvre « Ajouter un connecteur personnalisé » avec le nom et l'adresse déjà remplis
 * (https://claude.com/docs/connectors/building/directory-vs-custom). L'utilisateur n'a plus qu'à confirmer.
 */
export const claudeInstallLink = () => `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Trustpipe&connectorUrl=${encodeURIComponent(mcpUrl())}`;
