import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "crypto";

process.env.APP_URL = "https://trustpipe.test";
const { db } = await import("../src/lib/db");
const { registerClient, checkAuthorize, issueCode, exchangeToken, verifyAccess } = await import("../src/lib/mcp-server");
const mcp = await import("../src/app/api/mcp/route");

const tag = Date.now().toString(36);
const orgA = await db.organization.create({ data: { name: `MCP A ${tag}`, trialEndsAt: new Date(Date.now() + 864e5) } });
const orgB = await db.organization.create({ data: { name: `MCP B ${tag}`, trialEndsAt: new Date(Date.now() + 864e5) } });
const user = await db.user.create({ data: { email: `mcp_${tag}@exemple.fr` } });
await db.membership.create({ data: { orgId: orgA.id, userId: user.id } });
const client = await db.client.create({ data: { orgId: orgA.id, name: "Atelier Morel SAS" } });
const secretTask = await db.task.create({ data: { orgId: orgB.id, contactKey: "x", contactName: "Secret B", channel: "call", dueAt: new Date(), reason: "ne doit pas fuiter", source: "manual", sourceKind: "manual", sourceId: `b-${tag}` } });
await db.call.create({ data: { orgId: orgA.id, clientId: client.id, provider: "test", externalId: `c-${tag}`, kind: "call", startedAt: new Date(Date.now() - 3600e3), durationSec: 134, status: "connected", connected: true, meetingBooked: true, firstName: "Paul", lastName: "Morel", company: "Atelier Morel", contactKey: `k-${tag}`, summary: "Intéressé, RDV jeudi 15 h 30." } });

after(async () => {
  await db.task.deleteMany({ where: { orgId: { in: [orgA.id, orgB.id] } } });
  await db.call.deleteMany({ where: { orgId: orgA.id } });
  await db.mcpToken.deleteMany({ where: { userId: user.id } });
  await db.mcpCode.deleteMany({ where: { userId: user.id } });
  await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  await db.user.deleteMany({ where: { id: user.id } });
  await db.$disconnect();
});

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
let access = "", refresh = "", clientId = "";

async function rpc(method: string, params: Record<string, unknown> = {}, token = access) {
  const res = await mcp.POST(new Request("https://trustpipe.test/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
  return { status: res.status, headers: res.headers, body: res.status === 202 ? null : await res.json() };
}
const tool = async (name: string, args: Record<string, unknown> = {}) => (await rpc("tools/call", { name, arguments: args })).body.result;

test("OAuth : enregistrement, autorisation PKCE, échange, code à usage unique", async () => {
  assert.equal(await registerClient({ redirect_uris: ["http://evil.example/cb"] }), null, "http hors machine locale refusé");
  const reg = await registerClient({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  assert.ok(reg?.client_id);
  clientId = reg!.client_id;
  const bad = await checkAuthorize({ response_type: "code", client_id: clientId, redirect_uri: "https://evil.example/cb", code_challenge: challenge, code_challenge_method: "S256" });
  assert.ok("error" in bad, "adresse de retour non enregistrée refusée");
  const p = await checkAuthorize({ response_type: "code", client_id: clientId, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" });
  assert.ok(!("error" in p));
  const url = new URL(await issueCode(p as Exclude<typeof p, { error: string }>, user.id, orgA.id));
  assert.equal(url.searchParams.get("state"), "xyz");
  const code = url.searchParams.get("code")!;
  const wrong = await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: "mauvais", client_id: clientId }));
  assert.equal(wrong.ok, false, "mauvais vérificateur PKCE refusé");
  // Le code a été consommé par la tentative ratée : il ne peut plus servir.
  const replay = await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId }));
  assert.equal(replay.ok, false, "code à usage unique");
  const url2 = new URL(await issueCode(p as Exclude<typeof p, { error: string }>, user.id, orgA.id));
  const good = await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code: url2.searchParams.get("code")!, code_verifier: verifier, client_id: clientId, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }));
  assert.equal(good.ok, true);
  access = (good as { body: { access_token: string } }).body.access_token;
  refresh = (good as { body: { refresh_token: string } }).body.refresh_token;
  assert.ok(access.startsWith("tpa_") && refresh.startsWith("tpr_"));
  assert.equal(await db.mcpToken.count({ where: { tokenHash: access } }), 0, "jeton jamais stocké en clair");
});

test("MCP : sans jeton → 401 avec l'adresse d'autorisation", async () => {
  const r = await rpc("tools/list", {}, "");
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate") || "", /resource_metadata="https:\/\/trustpipe\.test\/\.well-known\/oauth-protected-resource"/);
  assert.equal((await rpc("tools/list", {}, "tpa_faux")).status, 401);
});

test("MCP : initialisation et liste des outils", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.body.result.protocolVersion, "2025-06-18");
  assert.equal((await rpc("notifications/initialized")).status, 200, "réponse à une requête avec id");
  const names = (await rpc("tools/list")).body.result.tools.map((t: { name: string }) => t.name);
  assert.deepEqual(names.sort(), ["creer_relance", "historique_prospect", "lister_clients", "lister_relances", "modifier_relance"]);
});

test("MCP : créer, lister, reporter, terminer une relance — sans jamais voir un autre espace", async () => {
  const created = await tool("creer_relance", { prospect: "Paul Morel", entreprise: "Atelier Morel", date: "2026-12-03", motif: "Confirmer le RDV de jeudi" });
  assert.match(created.content[0].text, /Rattachée à la fiche du prospect/);
  const id = created.structuredContent.resultat.id as string;
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(task.orgId, orgA.id);
  assert.equal(task.clientId, client.id, "rattachée au client du prospect");
  assert.equal(task.contactKey, `k-${tag}`);
  assert.equal(task.dueAt.toISOString(), "2026-12-03T08:00:00.000Z", "9 h à Paris (heure d'hiver)");

  const list = await tool("lister_relances", { statut: "toutes" });
  assert.match(list.content[0].text, /Paul Morel/);
  assert.doesNotMatch(list.content[0].text, /Secret B/, "rien d'un autre espace");
  assert.match((await tool("lister_relances", { client: "atelier morel" })).content[0].text, /Paul Morel/, "filtre client par nom");

  const other = await tool("modifier_relance", { id: secretTask.id, action: "faite" });
  assert.match(other.content[0].text, /introuvable/, "impossible de modifier la relance d'un autre espace");
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: secretTask.id } })).status, "open");

  await tool("modifier_relance", { id, action: "reporter", nouvelle_date: "2026-12-05" });
  assert.equal((await db.task.findUniqueOrThrow({ where: { id } })).dueAt.toISOString(), "2026-12-05T08:00:00.000Z");
  await tool("modifier_relance", { id, action: "faite" });
  assert.equal((await db.task.findUniqueOrThrow({ where: { id } })).status, "done");

  const hist = await tool("historique_prospect", { recherche: "Morel" });
  assert.match(hist.content[0].text, /RDV PRIS/);
  assert.match((await tool("lister_clients")).content[0].text, /Atelier Morel SAS/);
});

test("OAuth : renouvellement avec rotation, puis révocation", async () => {
  const r = await exchangeToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }));
  assert.equal(r.ok, true);
  const newAccess = (r as { body: { access_token: string } }).body.access_token;
  assert.equal(await verifyAccess(new Request("https://x", { headers: { authorization: `Bearer ${access}` } })), null, "ancien jeton révoqué après rotation");
  assert.deepEqual(await verifyAccess(new Request("https://x", { headers: { authorization: `Bearer ${newAccess}` } })), { orgId: orgA.id, userId: user.id });
  assert.equal((await exchangeToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }))).ok, false, "ancien jeton de renouvellement inutilisable");
  await db.membership.deleteMany({ where: { userId: user.id } });
  assert.equal(await verifyAccess(new Request("https://x", { headers: { authorization: `Bearer ${newAccess}` } })), null, "plus membre de l'espace = plus d'accès");
});
