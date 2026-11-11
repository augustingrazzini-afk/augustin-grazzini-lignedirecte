/** Couleur de pastille par source (utilisable côté serveur comme côté client). */
const COLORS: Record<string, string> = { minari: "linear-gradient(135deg,#6E5BFF,#2E5BFF)", aircall: "linear-gradient(135deg,#00B388,#00875F)", ringover: "linear-gradient(135deg,#2C6BED,#1A4FC2)", hubspot: "linear-gradient(135deg,#FF7A45,#FF5C35)", lemlist: "linear-gradient(135deg,#FF7A59,#F04E8C)" };
export const providerColor = (id: string) => COLORS[id] || "linear-gradient(135deg,#59628A,#2A3157)";
