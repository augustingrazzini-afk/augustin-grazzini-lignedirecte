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
  const asked = new URL(req.url).searchParams.get("client");
  // Un commercial invité revient dans son propre espace (guide de démarrage), l'entreprise dans ses sources.
  const page = (cid: string | null, rep: boolean) => (rep && cid ? `/portal/${cid}/bienvenue?etape=2` : "/app/sources");
  let repMode = false;
  const back = (msg: string) => NextResponse.redirect(new URL(`${page(asked, repMode)}${page(asked, repMode).includes("?") ? "&" : "?"}erreur=${encodeURIComponent(msg)}`, app), 303);
  const server = MCP_SERVERS[provider];
  if (!server) return back("Cet outil ne propose pas la connexion en un clic.");
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL(`/login?next=/app/sources`, app), 303);
  if (u.id === "demo_user") return NextResponse.redirect(new URL(`/app/sources`, app), 303); // démo en lecture seule
  // Entreprise (membre de l'espace) ou commercial invité qui branche son propre outil.
  const access = asked ? u.clientAccess.find((a) => a.clientId === asked) : null;
  repMode = !!access && !u.memberships.some((x) => x.orgId === access.client.orgId);
  const orgId = access ? access.client.orgId : u.memberships[0]?.orgId;
  if (!orgId) return back("Seul un membre de l'espace peut connecter un outil.");
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (!isActive(org)) return back("L'abonnement de cet espace n'est plus actif.");
  const clientId = asked;
  if (clientId && !(await db.client.count({ where: { id: clientId, orgId } }))) return back("Commercial introuvable.");
  const redirectUri = `${app}/api/connect/${provider}/callback`;
  try {
    const o = await discover(server.url);
    const c = await oauthClient(o, redirectUri);
    const { verifier, challenge } = pkce();
    const state = randomToken(24);
    (await cookies()).set(COOKIE, seal({
      state, verifier, provider, userId: u.id, orgId, clientId, rep: repMode, redirectUri, resource: o.resource,
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
