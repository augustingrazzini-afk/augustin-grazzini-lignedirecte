import { createHash } from "crypto";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

/**
 * Connecteur Claude (serveur MCP de Trustpipe) : OAuth 2.1 avec enregistrement dynamique (RFC 7591),
 * PKCE obligatoire (S256) et jetons stockés hachés. Un jeton donne accès à UNE organisation :
 * celle de l'utilisateur qui a autorisé la connexion.
 */

export const ACCESS_TTL_S = 60 * 60 * 24 * 30; // 30 jours
const REFRESH_TTL_S = 60 * 60 * 24 * 180; // 6 mois
const CODE_TTL_MS = 10 * 60e3;

export function baseUrl(req?: Request): string {
  const env = (process.env.APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  return req ? new URL(req.url).origin : "http://localhost:3000";
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export function resourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    resource_name: "Trustpipe",
    resource_documentation: `${base}/`,
  };
}

export function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["trustpipe"],
  };
}

/** Adresse de retour autorisée : https, ou http sur la machine locale (applications de bureau). */
export function validRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch { return false; }
}

export async function registerClient(body: unknown) {
  const b = (body || {}) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return null;
  const name = typeof b.client_name === "string" ? b.client_name.slice(0, 80) : "";
  const id = `tp_${randomToken(18)}`;
  await db.mcpClient.create({ data: { id, name, redirectUris: uris } });
  return { client_id: id, client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", client_id_issued_at: Math.floor(Date.now() / 1000) };
}

export type AuthorizeParams = { clientId: string; redirectUri: string; challenge: string; state: string; clientName: string };

/** Vérifie une demande d'autorisation. Renvoie un message d'erreur lisible, ou les paramètres validés. */
export async function checkAuthorize(sp: Record<string, string | undefined>): Promise<{ error: string } | AuthorizeParams> {
  const clientId = sp.client_id || "", redirectUri = sp.redirect_uri || "";
  if (sp.response_type !== "code") return { error: "Type de réponse non pris en charge." };
  const client = clientId ? await db.mcpClient.findUnique({ where: { id: clientId } }) : null;
  if (!client) return { error: "Application inconnue. Recommencez la connexion depuis Claude." };
  if (!client.redirectUris.includes(redirectUri)) return { error: "Adresse de retour non autorisée pour cette application." };
  if (!sp.code_challenge || sp.code_challenge_method !== "S256") return { error: "Demande incomplète (PKCE manquant)." };
  return { clientId, redirectUri, challenge: sp.code_challenge, state: sp.state || "", clientName: client.name || "Claude" };
}

export async function issueCode(p: AuthorizeParams, userId: string, orgId: string): Promise<string> {
  const code = randomToken(32);
  await db.mcpCode.create({ data: { codeHash: sha256(code), clientId: p.clientId, userId, orgId, redirectUri: p.redirectUri, challenge: p.challenge, expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  const u = new URL(p.redirectUri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  return u.toString();
}

const s256 = (v: string) => createHash("sha256").update(v).digest("base64url");

async function newTokens(clientId: string, userId: string, orgId: string) {
  const access = `tpa_${randomToken(32)}`, refresh = `tpr_${randomToken(32)}`;
  const client = await db.mcpClient.findUnique({ where: { id: clientId }, select: { name: true } });
  await db.mcpToken.create({ data: {
    tokenHash: sha256(access), refreshHash: sha256(refresh), clientId, clientName: client?.name || "", userId, orgId,
    expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
  } });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "trustpipe" };
}

type TokenResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string; description: string };

/** Point d'échange des jetons : code d'autorisation (avec vérification PKCE) ou jeton de renouvellement. */
export async function exchangeToken(f: URLSearchParams): Promise<TokenResult> {
  const grant = f.get("grant_type");
  if (grant === "authorization_code") {
    const code = f.get("code") || "", verifier = f.get("code_verifier") || "";
    const row = code ? await db.mcpCode.findUnique({ where: { codeHash: sha256(code) } }) : null;
    if (!row || row.usedAt || row.expiresAt < new Date()) return { ok: false, error: "invalid_grant", description: "Code expiré ou déjà utilisé." };
    // Usage unique, même si la suite échoue.
    const used = await db.mcpCode.updateMany({ where: { codeHash: row.codeHash, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) return { ok: false, error: "invalid_grant", description: "Code déjà utilisé." };
    if (f.get("client_id") && f.get("client_id") !== row.clientId) return { ok: false, error: "invalid_grant", description: "Application différente." };
    if (f.get("redirect_uri") && f.get("redirect_uri") !== row.redirectUri) return { ok: false, error: "invalid_grant", description: "Adresse de retour différente." };
    if (!verifier || s256(verifier) !== row.challenge) return { ok: false, error: "invalid_grant", description: "Vérification PKCE échouée." };
    return { ok: true, body: await newTokens(row.clientId, row.userId, row.orgId) };
  }
  if (grant === "refresh_token") {
    const rt = f.get("refresh_token") || "";
    const row = rt ? await db.mcpToken.findUnique({ where: { refreshHash: sha256(rt) } }) : null;
    if (!row || row.revokedAt || row.refreshExpiresAt < new Date()) return { ok: false, error: "invalid_grant", description: "Session expirée : reconnectez Trustpipe dans Claude." };
    // Rotation : l'ancien jeton est révoqué, un nouveau couple est émis.
    await db.mcpToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return { ok: true, body: await newTokens(row.clientId, row.userId, row.orgId) };
  }
  return { ok: false, error: "unsupported_grant_type", description: "Type d'échange non pris en charge." };
}

/** Jeton présenté au serveur MCP → organisation et utilisateur, si le jeton est valide et l'utilisateur toujours membre. */
export async function verifyAccess(req: Request): Promise<{ orgId: string; userId: string } | null> {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return null;
  const row = await db.mcpToken.findUnique({ where: { tokenHash: sha256(m[1]) } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  const member = await db.membership.findFirst({ where: { userId: row.userId, orgId: row.orgId }, select: { id: true } });
  if (!member) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60e3) await db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { orgId: row.orgId, userId: row.userId };
}
