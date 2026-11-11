import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isActive } from "@/lib/billing";
import { seal, randomToken } from "@/lib/crypto";
import { CONNECT_COOKIE as COOKIE, MCP_SERVERS, discover, oauthClient, pkce } from "@/lib/mcp";
import { ProviderError } from "@/lib/providers/types";



/** Connexion en un clic : redirige vers la page d'autorisation de l'outil (comme les connecteurs de Claude). */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const app = process.env.APP_URL || new URL(req.url).origin;
  const back = (msg: string) => NextResponse.redirect(new URL(`/app/sources?erreur=${encodeURIComponent(msg)}`, app), 303);
  const server = MCP_SERVERS[provider];
  if (!server) return back("Cet outil ne propose pas la connexion en un clic.");
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL(`/login?next=/app/sources`, app), 303);
  const m = u.memberships[0];
  if (!m) return back("Seul un membre de l'espace peut connecter un outil.");
  const org = await db.organization.findUniqueOrThrow({ where: { id: m.orgId } });
  if (!isActive(org)) return back("L'abonnement de cet espace n'est plus actif.");
  const clientId = new URL(req.url).searchParams.get("client");
  if (clientId && !(await db.client.count({ where: { id: clientId, orgId: m.orgId } }))) return back("Client introuvable.");
  const redirectUri = `${app}/api/connect/${provider}/callback`;
  try {
    const o = await discover(server.url);
    const c = await oauthClient(o, redirectUri);
    const { verifier, challenge } = pkce();
    const state = randomToken(24);
    (await cookies()).set(COOKIE, seal({
      state, verifier, provider, userId: u.id, orgId: m.orgId, clientId, redirectUri, resource: o.resource,
      tokenEndpoint: o.as.token_endpoint, oauthClientId: c.clientId, oauthClientSecret: c.clientSecret || "", at: Date.now(),
    }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connect", maxAge: 900 });
    const url = new URL(o.as.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", c.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("resource", o.resource);
    if (o.scopes.length) url.searchParams.set("scope", o.scopes.join(" "));
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error("connexion", provider, e);
    return back(e instanceof ProviderError ? e.message : `Impossible de joindre ${server.label} pour le moment.`);
  }
}
