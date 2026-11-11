import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { open, seal, randomToken, safeEqual } from "@/lib/crypto";
import { CONNECT_COOKIE as COOKIE, MCP_SERVERS, applyTokens, exchangeCode } from "@/lib/mcp";
import { getProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/types";
import { syncAndAnalyze } from "@/lib/sync";

export const maxDuration = 60;

type Pending = { state: string; verifier: string; provider: string; userId: string; orgId: string; clientId: string | null; redirectUri: string; resource: string; tokenEndpoint: string; oauthClientId: string; oauthClientSecret: string; at: number };

/** Retour de la page d'autorisation : on récupère les jetons, on crée l'intégration et la première synchro démarre. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const app = process.env.APP_URL || new URL(req.url).origin;
  const back = (q: string) => NextResponse.redirect(new URL(`/app/sources?${q}`, app), 303);
  const fail = (msg: string) => back(`erreur=${encodeURIComponent(msg)}`);
  const server = MCP_SERVERS[provider];
  const sp = new URL(req.url).searchParams;
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/connect" });
  if (!server || !raw) return fail("La connexion a expiré. Recommencez.");
  if (sp.get("error")) return fail(`Connexion à ${server.label} annulée.`);
  let p: Pending;
  try { p = open<Pending>(raw); } catch { return fail("La connexion a expiré. Recommencez."); }
  const u = await currentUser();
  if (!u || u.id !== p.userId || p.provider !== provider || Date.now() - p.at > 900e3 || !safeEqual(sp.get("state") || "", p.state)) return fail("La connexion a expiré. Recommencez.");
  const code = sp.get("code");
  if (!code) return fail(`${server.label} n'a pas confirmé la connexion.`);
  let id = "";
  try {
    const t = await exchangeCode({ tokenEndpoint: p.tokenEndpoint, clientId: p.oauthClientId, clientSecret: p.oauthClientSecret || undefined, code, verifier: p.verifier, redirectUri: p.redirectUri, resource: p.resource });
    const creds: Record<string, string> = { mcpUrl: server.url, tokenEndpoint: p.tokenEndpoint, oauthClientId: p.oauthClientId, resource: p.resource };
    if (p.oauthClientSecret) creds.oauthClientSecret = p.oauthClientSecret;
    applyTokens(creds, t);
    delete creds.__dirty;
    await getProvider(provider).test(creds); // vérifie l'accès aux données
    delete creds.__dirty;
    const integ = await db.integration.create({ data: { orgId: p.orgId, clientId: p.clientId, provider, label: server.label, credentials: seal(creds), webhookToken: randomToken(24) } });
    id = integ.id;
  } catch (e) {
    console.error("connexion retour", provider, e);
    return fail(e instanceof ProviderError ? e.message : `La connexion à ${server.label} a échoué. Réessayez.`);
  }
  after(() => syncAndAnalyze(id, { full: true }).catch(() => {}));
  return back(`connecte=${provider}`);
}
