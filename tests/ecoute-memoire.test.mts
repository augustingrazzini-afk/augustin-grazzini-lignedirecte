import { test, after } from "node:test";
import assert from "node:assert/strict";

// Écoute : l'enregistrement n'est téléchargé qu'une fois chez l'outil d'appel, puis servi par morceaux depuis la mémoire
// (le navigateur demande l'audio en plusieurs fois : au chargement, à la lecture, à chaque saut).
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
process.env.AUTH_SECRET ||= "x".repeat(40);
const { db } = await import("../src/lib/db");
const { PROVIDERS } = await import("../src/lib/providers");
const { signedAudioPath } = await import("../src/lib/audio");
const { GET } = await import("../src/app/api/calls/[id]/audio/route");
const org = await db.organization.create({ data: { name: `ec_${Date.now()}`, plan: "premium", subscriptionStatus: "active", trialEndsAt: new Date() } });
after(async () => { await db.organization.delete({ where: { id: org.id } }); await db.$disconnect(); });
const call = await db.call.create({ data: { orgId: org.id, provider: "minari", externalId: "e1", startedAt: new Date(), durationSec: 90, status: "connected", connected: true, recordingUrl: "https://app.minari.ai/shared/00000000-0000-0000-0000-000000000000" } });
const audio = new Uint8Array(5000).map((_, i) => i % 251);
let downloads = 0;
const real = PROVIDERS.minari.fetchAudio;
PROVIDERS.minari.fetchAudio = async () => { downloads++; await new Promise((r) => setTimeout(r, 60)); return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "content-length": String(audio.length) } }); };
after(() => { PROVIDERS.minari.fetchAudio = real; });
const get = (range?: string) => GET(new Request(`http://localhost${signedAudioPath(call.id)}`, { headers: range ? { range } : {} }), { params: Promise.resolve({ id: call.id }) });

test("plusieurs morceaux demandés en même temps : un seul téléchargement chez l'outil", async () => {
  const [a, b, c] = await Promise.all([get("bytes=0-"), get("bytes=0-1"), get("bytes=4000-")]);
  assert.deepEqual([a.status, b.status, c.status], [206, 206, 206]);
  assert.equal(downloads, 1);
  assert.equal(b.headers.get("content-range"), "bytes 0-1/5000");
  assert.deepEqual([...new Uint8Array(await c.arrayBuffer())], [...audio.slice(4000)]);
});

test("les écoutes et les sauts suivants ne retéléchargent rien", async () => {
  for (const r of ["bytes=100-199", "bytes=2500-", undefined]) { const res = await get(r); assert.ok(res.status === 206 || res.status === 200); await res.arrayBuffer(); }
  assert.equal(downloads, 1);
  assert.equal((await get("bytes=9999-")).status, 416);
});

test("l'écoute reste réservée à Premium, même avec l'enregistrement en mémoire", async () => {
  await db.organization.update({ where: { id: org.id }, data: { plan: "agency" } });
  assert.equal((await get("bytes=0-")).status, 402);
});
