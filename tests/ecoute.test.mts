import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

// Écoute des conversations dans Trustpipe : lecture de l'enregistrement de chaque outil d'appel.
const { audioFetch, isAudio, publicHttps } = await import("../src/lib/providers/types");
const { getProvider } = await import("../src/lib/providers");

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const mp3 = () => new Response(new Uint8Array([255, 243, 1, 2]), { status: 200, headers: { "content-type": "audio/mpeg" } });
const html = () => new Response("<html>Connexion</html>", { status: 200, headers: { "content-type": "text/html" } });
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
/** Remplace fetch et note chaque appel (adresse + en-tête d'autorisation). */
function mock(fn: (url: string, auth: string) => Response) {
  const calls: { url: string; auth: string }[] = [];
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const h = new Headers(init?.headers); const auth = h.get("authorization") || h.get("x-api-key") || "";
    calls.push({ url: String(u), auth });
    return fn(String(u), auth);
  }) as typeof fetch;
  return calls;
}

test("une page de connexion ou une erreur n'est pas du son", () => {
  assert.equal(isAudio(mp3()), true);
  assert.equal(isAudio(html()), false);
  assert.equal(isAudio(new Response("", { status: 403 })), false);
  assert.equal(isAudio(null), false);
});

test("jamais d'adresse interne", () => {
  for (const ok of ["https://cdn.ringover.com/a.mp3", "https://s3.eu-west-1.amazonaws.com/x/y.mp3?sig=1"]) assert.equal(publicHttps(ok), true, ok);
  for (const bad of ["http://cdn.ringover.com/a.mp3", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.5/a", "https://[::1]/a", "https://base.internal/a", "file:///etc/passwd", "pas une adresse"]) assert.equal(publicHttps(bad), false, bad);
});

test("lien public : lu sans identifiants", async () => {
  const calls = mock(() => mp3());
  const r = await audioFetch("https://cdn.ringover.com/rec/1.mp3", "bytes=0-1", { hosts: /ringover\.com$/, headers: { Authorization: "CLE" } });
  assert.equal(isAudio(r), true);
  assert.deepEqual(calls.map((c) => c.auth), [""], "la clé n'est pas envoyée quand le lien est public");
});

test("lien protégé : la clé n'est envoyée qu'au domaine de l'outil", async () => {
  let calls = mock((_u, auth) => (auth ? mp3() : html()));
  assert.equal(isAudio(await audioFetch("https://api.salesloft.com/rec/1", null, { hosts: /(^|\.)salesloft\.com$/, headers: { Authorization: "Bearer CLE" } })), true);
  assert.deepEqual(calls.map((c) => c.auth), ["", "Bearer CLE"]);
  calls = mock((_u, auth) => (auth ? mp3() : html()));
  assert.equal(await audioFetch("https://ailleurs.exemple.com/rec/1", null, { hosts: /(^|\.)salesloft\.com$/, headers: { Authorization: "Bearer CLE" } }), null);
  assert.deepEqual(calls.map((c) => c.auth), [""], "aucune clé vers un autre domaine");
});

test("tous les outils d'appel branchés savent lire leur enregistrement", () => {
  for (const id of ["minari", "aircall", "ringover", "allo", "salesloft", "apollo", "gong", "hubspot", "skipcall", "lemlist", "justcall", "dialpad", "close", "custom"])
    assert.equal(typeof getProvider(id).fetchAudio, "function", id);
});

test("Aircall : un lien frais est redemandé à chaque écoute", async () => {
  const calls = mock((u) => (u.includes("api.aircall.io/v1/calls/42") ? json({ call: { recording: "https://aircall-rec.s3.amazonaws.com/frais.mp3" } }) : u.includes("frais.mp3") ? mp3() : html()));
  const r = await getProvider("aircall").fetchAudio!({ apiId: "a", apiToken: "b" }, "https://assets.aircall.io/calls/42/recording", null, "42");
  assert.equal(isAudio(r), true);
  assert.equal(calls.at(-1)!.url, "https://aircall-rec.s3.amazonaws.com/frais.mp3");
  assert.equal(calls.at(-1)!.auth, "", "le lien signé est lu sans la clé Aircall");
});

test("Gong : lien audio signé quand la clé y a droit, sinon rien", async () => {
  mock((u) => (u.endsWith("/v2/calls/extensive") ? json({ calls: [{ media: { audioUrl: "https://gong-media.s3.amazonaws.com/a.mp3" } }] }) : mp3()));
  assert.equal(isAudio(await getProvider("gong").fetchAudio!({ accessKey: "k", accessKeySecret: "s" }, "https://app.gong.io/call?id=7", null, "7")), true);
  mock((u) => (u.endsWith("/v2/calls/extensive") ? json({ calls: [{}] }) : mp3()));
  assert.equal(await getProvider("gong").fetchAudio!({ accessKey: "k", accessKeySecret: "s" }, "https://app.gong.io/call?id=7", null, "7"), null);
});

test("Minari : le fichier audio vient de la page de partage", async () => {
  const id = "816c5feb-2b59-4ba5-80bb-2ee6d73c1088";
  const calls = mock((u) => (u.includes("/api/public/call/") ? json({ recordingPublicUrl: `/api/webhook-assets/recording/${id}?expires=1&sig=x` }) : mp3()));
  assert.equal(isAudio(await getProvider("minari").fetchAudio!({}, `https://app.minari.ai/shared/${id}`, null)), true);
  assert.equal(calls.at(-1)!.url, `https://app.minari.ai/api/webhook-assets/recording/${id}?expires=1&sig=x`);
  assert.equal(await getProvider("minari").fetchAudio!({}, "https://exemple.com/shared/x", null), null);
});
