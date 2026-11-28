import { NextResponse } from "next/server";
import { discover } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sonde temporaire : quels outils d'appel ont un serveur MCP avec connexion en un clic (OAuth + inscription
 * automatique), comme Minari ? Ne lit que des métadonnées publiques ; aucun identifiant n'est envoyé.
 */
const CANDIDATS = [
  "https://mcp.minari.ai/mcp",
  "https://mcp.hubspot.com/", "https://mcp.hubspot.com/anthropic",
  "https://mcp.close.com/mcp",
  "https://app.lemlist.com/mcp", "https://api.lemlist.com/mcp", "https://mcp.lemlist.com/mcp",
  "https://mcp.apollo.io/mcp", "https://mcp.apollo.io/sse",
  "https://mcp.aircall.io/mcp", "https://api.aircall.io/mcp",
  "https://mcp.ringover.com/mcp", "https://public-api.ringover.com/mcp",
  "https://mcp.dialpad.com/mcp", "https://mcp.justcall.io/mcp", "https://mcp.gong.io/mcp",
  "https://mcp.salesloft.com/mcp", "https://mcp.skipcall.io/mcp", "https://mcp.allo.io/mcp",
];

export async function GET() {
  const res = await Promise.all(CANDIDATS.map(async (url) => {
    try {
      const o = await discover(url);
      return { url, oauth: true, unClic: !!o.as.registration_endpoint, serveur: o.as.issuer || new URL(o.as.authorization_endpoint).origin };
    } catch { return { url, oauth: false, unClic: false }; }
  }));
  return NextResponse.json(res, { headers: { "cache-control": "no-store" } });
}
