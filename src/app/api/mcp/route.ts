import { NextResponse } from "next/server";
import { baseUrl, cors, verifyAccess } from "@/lib/mcp-server";
import { TOOLS, callTool } from "@/lib/mcp-tools";

/**
 * Serveur MCP de Trustpipe (transport HTTP « streamable », réponses JSON, sans session).
 * Claude y accède avec un jeton OAuth ; sans jeton, la réponse 401 indique où s'autoriser.
 */
export const maxDuration = 60;

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function unauthorized(req: Request) {
  const meta = `${baseUrl(req)}/.well-known/oauth-protected-resource`;
  return NextResponse.json(err(null, -32001, "Authentification requise"), {
    status: 401,
    headers: { ...cors, "WWW-Authenticate": `Bearer realm="trustpipe", resource_metadata="${meta}"` },
  });
}

async function handle(m: Rpc, ctx: { orgId: string; userId: string }) {
  const id = m.id;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion || "");
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "trustpipe", title: "Trustpipe", version: "1.0.0" },
        instructions: "Trustpipe gère les relances de prospection d'un commercial : rappels de prospects après un appel, rendez-vous à préparer. Utilisez lister_relances pour voir ce qui est à faire (en retard, aujourd'hui, cette semaine), historique_prospect pour relire les derniers appels avant de relancer, creer_relance et modifier_relance pour planifier ou clôturer. Dates en heure de Paris.",
      });
    }
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name || "");
      const args = (m.params?.arguments && typeof m.params.arguments === "object" ? m.params.arguments : {}) as Record<string, unknown>;
      try {
        const out = await callTool(name, args, ctx);
        if (!out) return err(id, -32602, `Outil inconnu : ${name}`);
        return ok(id, { content: [{ type: "text", text: out.text }], ...(out.data !== undefined ? { structuredContent: { resultat: out.data } } : {}) });
      } catch (e) {
        console.error("mcp", name, e);
        return ok(id, { content: [{ type: "text", text: "Erreur interne de Trustpipe. Réessayez dans un instant." }], isError: true });
      }
    }
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    default: return err(id, -32601, `Méthode non prise en charge : ${m.method}`);
  }
}

export async function POST(req: Request) {
  const ctx = await verifyAccess(req);
  if (!ctx) return unauthorized(req);
  const body = (await req.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!body) return NextResponse.json(err(null, -32700, "JSON invalide"), { status: 400, headers: cors });
  const msgs = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const m of msgs) {
    if (m.id === undefined || m.id === null) continue; // notification (ex. notifications/initialized) : pas de réponse
    replies.push(await handle(m, ctx));
  }
  if (!replies.length) return new NextResponse(null, { status: 202, headers: cors });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: cors });
}

/** Pas de flux serveur → client : le transport HTTP simple suffit. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { ...cors, Allow: "POST" } });
}
export function DELETE() { return new NextResponse(null, { status: 405, headers: { ...cors, Allow: "POST" } }); }
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
