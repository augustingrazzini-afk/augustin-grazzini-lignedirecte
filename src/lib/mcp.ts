import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { ProviderError } from "./providers/types";

/**
 * Connexion « en un clic » aux outils qui exposent un serveur MCP (Minari…), comme les connecteurs de Claude :
 * découverte OAuth (RFC 9728 / RFC 8414), enregistrement dynamique du client (RFC 7591), PKCE,
 * puis appels d'outils MCP (transport « Streamable HTTP ») avec le jeton de l'utilisateur.
 */

/** Serveurs MCP connus, par source. */
export const MCP_SERVERS: Record<string, { url: string; label: string }> = {
  minari: { url: process.env.MINARI_MCP_URL || "https://mcp.minari.ai/mcp", label: "Minari" },
};

export const CONNECT_COOKIE = "tp_connect";
const PROTOCOL = "2025-06-18";
const TIMEOUT = 30_000;

type AsMeta = { issuer?: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; scopes_supported?: string[] };
export type McpOAuth = { resource: string; as: AsMeta; scopes: string[] };

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Trouve le serveur d'autorisation d'un serveur MCP. */
export async function discover(mcpUrl: string): Promise<McpOAuth> {
  const u = new URL(mcpUrl);
  // 1. Le serveur MCP indique ses métadonnées dans l'en-tête WWW-Authenticate d'une réponse 401.
  let prmUrl: string | null = null;
  try {
    const r = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const m = (r.headers.get("www-authenticate") || "").match(/resource_metadata="([^"]+)"/);
    if (m) prmUrl = m[1];
  } catch { /* on essaie les adresses standard */ }
  const path = u.pathname.replace(/\/$/, "");
  const prm = (prmUrl && (await getJson(prmUrl)))
    || (await getJson(`${u.origin}/.well-known/oauth-protected-resource${path}`))
    || (await getJson(`${u.origin}/.well-known/oauth-protected-resource`));
  const asUrl = new URL(prm?.authorization_servers?.[0] || u.origin);
  const asPath = asUrl.pathname.replace(/\/$/, "");
  const as: AsMeta | null = (asPath && (await getJson(`${asUrl.origin}/.well-known/oauth-authorization-server${asPath}`)))
    || (await getJson(`${asUrl.origin}/.well-known/oauth-authorization-server`))
    || (await getJson(`${asUrl.origin}/.well-known/openid-configuration${asPath}`))
    || (await getJson(`${asUrl.origin}/.well-known/openid-configuration`));
  if (!as?.authorization_endpoint || !as?.token_endpoint) throw new ProviderError("Impossible de trouver la page de connexion de l'outil.");
  return { resource: prm?.resource || mcpUrl, as, scopes: prm?.scopes_supported || [] };
}

/** Identifiant client OAuth de Trustpipe chez ce serveur (enregistré une fois, puis réutilisé). */
export async function oauthClient(o: McpOAuth, redirectUri: string): Promise<{ clientId: string; clientSecret?: string }> {
  const issuer = o.as.issuer || new URL(o.as.authorization_endpoint).origin;
  const known = await db.oAuthClient.findUnique({ where: { issuer_redirectUri: { issuer, redirectUri } } });
  if (known) return { clientId: known.clientId, clientSecret: known.clientSecret || undefined };
  if (!o.as.registration_endpoint) throw new ProviderError("Cet outil n'accepte pas encore la connexion en un clic. Utilisez une clé API.");
  const r = await fetch(o.as.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Trustpipe",
      client_uri: process.env.APP_URL || undefined,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new ProviderError(`L'outil a refusé l'enregistrement de Trustpipe (${r.status}).`);
  const j = await r.json();
  if (!j.client_id) throw new ProviderError("L'outil n'a pas renvoyé d'identifiant client.");
  await db.oAuthClient.upsert({
    where: { issuer_redirectUri: { issuer, redirectUri } },
    create: { issuer, redirectUri, clientId: j.client_id, clientSecret: j.client_secret || null },
    update: { clientId: j.client_id, clientSecret: j.client_secret || null },
  });
  return { clientId: j.client_id, clientSecret: j.client_secret };
}

export const b64url = (b: Buffer) => b.toString("base64url");
export function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

/** Identifiants enregistrés (chiffrés) pour une intégration connectée par OAuth. */
export type McpCreds = Record<string, string> & {
  mcpUrl: string; accessToken: string; refreshToken?: string; expiresAt?: string;
  tokenEndpoint: string; oauthClientId: string; oauthClientSecret?: string; resource?: string;
};

async function tokenRequest(endpoint: string, form: Record<string, string | undefined>) {
  const body = new URLSearchParams(Object.entries(form).filter(([, v]) => v) as [string, string][]);
  let r: Response;
  try {
    r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    throw new ProviderError("L'outil ne répond pas. Réessayez plus tard.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new ProviderError(r.status === 400 || r.status === 401 ? "La connexion à l'outil a expiré : reconnectez-le depuis Sources." : `L'outil a répondu ${r.status}.`, 401);
  return j as { access_token: string; refresh_token?: string; expires_in?: number };
}

/** Échange le code reçu après autorisation contre des jetons. */
export async function exchangeCode(o: { tokenEndpoint: string; clientId: string; clientSecret?: string; code: string; verifier: string; redirectUri: string; resource: string }) {
  return tokenRequest(o.tokenEndpoint, {
    grant_type: "authorization_code", code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId,
    client_secret: o.clientSecret, code_verifier: o.verifier, resource: o.resource,
  });
}

export function applyTokens(c: Record<string, string>, t: { access_token: string; refresh_token?: string; expires_in?: number }) {
  c.accessToken = t.access_token;
  if (t.refresh_token) c.refreshToken = t.refresh_token;
  c.expiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : "";
  c.__dirty = "1"; // la synchro réenregistre les identifiants mis à jour
}

async function refresh(c: McpCreds) {
  if (!c.refreshToken) throw new ProviderError("La connexion à l'outil a expiré : reconnectez-le depuis Sources.", 401);
  const t = await tokenRequest(c.tokenEndpoint, {
    grant_type: "refresh_token", refresh_token: c.refreshToken, client_id: c.oauthClientId, client_secret: c.oauthClientSecret, resource: c.resource,
  });
  applyTokens(c, t);
}

/** Lit une réponse JSON-RPC, en JSON simple ou en flux SSE. */
async function readRpc(r: Response, id: number): Promise<any> {
  const text = await r.text();
  if ((r.headers.get("content-type") || "").includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const m = JSON.parse(line.slice(5).trim());
        if (m.id === id) return m;
      } catch { /* ligne suivante */ }
    }
    return null;
  }
  return text ? JSON.parse(text) : null;
}

const sessions = new WeakMap<object, string>();

async function rpc(c: McpCreds, label: string, method: string, params: unknown, id?: number) {
  const send = () => fetch(c.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL, ...(sessions.get(c) ? { "Mcp-Session-Id": sessions.get(c)! } : {}),
    },
    body: JSON.stringify(id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  let r: Response;
  try { r = await send(); } catch { throw new ProviderError(`${label} ne répond pas. Réessayez plus tard.`); }
  if (r.status === 401) { await refresh(c); r = await send(); }
  if (r.status === 401 || r.status === 403) throw new ProviderError(`${label} refuse l'accès : reconnectez-le depuis Sources.`, r.status);
  if (r.status === 429) throw new ProviderError(`${label} limite le nombre de requêtes : nouvelle tentative au prochain passage.`, 429);
  if (r.status === 404 && sessions.get(c)) { sessions.delete(c); throw new ProviderError(`${label} a fermé la session : nouvelle tentative au prochain passage.`); }
  if (!r.ok && r.status !== 202) throw new ProviderError(`${label} a répondu ${r.status}.`, r.status);
  const sid = r.headers.get("mcp-session-id");
  if (sid) sessions.set(c, sid);
  return id === undefined ? null : readRpc(r, id);
}

let nextId = 1;

/** Appelle un outil MCP et renvoie son résultat (JSON). */
export async function callTool(c: McpCreds, label: string, name: string, args: Record<string, unknown>): Promise<any> {
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now() + 60_000) await refresh(c);
  if (!sessions.has(c)) {
    const init = await rpc(c, label, "initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "Trustpipe", version: "1.0" } }, nextId++);
    if (init?.error) throw new ProviderError(`${label} : ${init.error.message || "connexion refusée"}.`);
    await rpc(c, label, "notifications/initialized", {});
  }
  const res = await rpc(c, label, "tools/call", { name, arguments: args }, nextId++);
  if (!res) throw new ProviderError(`${label} n'a pas répondu.`);
  if (res.error) throw new ProviderError(`${label} : ${res.error.message || "erreur"}.`);
  const out = res.result || {};
  const text = (out.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
  if (out.isError) throw new ProviderError(`${label} : ${text.slice(0, 200) || "erreur"}.`);
  if (out.structuredContent) return out.structuredContent;
  try { return JSON.parse(text); } catch { throw new ProviderError(`${label} a renvoyé une réponse illisible.`); }
}
