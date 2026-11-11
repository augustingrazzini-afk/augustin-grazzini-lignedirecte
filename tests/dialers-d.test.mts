import { test } from "node:test";
import assert from "node:assert/strict";

test("allo : appels de la recherche de conversations reconnus (doc officielle)", async () => {
  const { mapAllo } = await import("../src/lib/providers/allo");
  // Exemple de réponse de POST /v2/api/conversations/items/search
  const a = mapAllo({ id: "cll-abc123", type: "CALL", direction: "INBOUND", allo_number: "+14155550100", contact_number: "+14155551234",
    contacts: [{ id: "cnt-abc123", name: "Sarah Johnson", company: { id: "com-xyz789", name: "Acme Corp" } }], user: { id: "usr-abc123", name: "Alex Kim" },
    date: "2026-04-21T14:30:00Z", duration: 145, result: "ANSWERED", recording_url: "https://storage.withallo.com/recordings/cll-abc123.mp3",
    summary: "Customer called about a billing issue on their last invoice.", tags: ["billing", "support"],
    transcript: [{ source: "EXTERNAL", time: "2026-04-21T14:30:02Z", text: "Hello" }, { source: "EXTERNAL", time: "2026-04-21T14:30:04Z", text: "about my invoice" }, { source: "USER", time: "2026-04-21T14:31:05Z", text: "Sure" }] })!;
  assert.equal(a.externalId, "cll-abc123");
  assert.equal(a.direction, "inbound");
  assert.equal(a.durationSec, 145);
  assert.equal(a.connected, true);
  assert.equal(a.firstName, "Sarah");
  assert.equal(a.lastName, "Johnson");
  assert.equal(a.company, "Acme Corp");
  assert.equal(a.phone, "+14155551234");
  assert.equal(a.repName, "Alex Kim");
  assert.equal(a.listName, "Appels directs");
  assert.equal(a.recordingUrl, "https://storage.withallo.com/recordings/cll-abc123.mp3");
  assert.deepEqual(a.tags, ["billing", "support"]);
  assert.equal(a.transcript!.length, 2, "répliques consécutives fusionnées");
  assert.equal(a.transcript![0].s, "Sarah Johnson");
  assert.equal(a.transcript![1].s, "Alex Kim");
  assert.equal(a.transcript![1].ts, "01:05");
  const vm = mapAllo({ id: "cll-2", type: "CALL", direction: "OUTBOUND", date: "2026-04-21T15:00:00Z", duration: 30, recording_duration: 12, result: "ANSWERED", detected_outbound_voicemail: true,
    extracted_data: { contact: { name: "Marie Dupont", company: "Vibrant Events", job_title: "Office manager" } } })!;
  assert.equal(vm.connected, false, "répondeur détecté");
  assert.equal(vm.status, "voicemail");
  assert.equal(vm.durationSec, 12, "temps de parole");
  assert.equal(vm.company, "Vibrant Events");
  assert.equal(vm.jobTitle, "Office manager");
  assert.equal(mapAllo({ id: "cll-3", type: "CALL", date: "2026-04-21T16:00:00Z", duration: 20, result: "CLOSED", recording_url: "http://x" })!.connected, false);
  assert.equal(mapAllo({ id: "cll-3", type: "CALL", date: "2026-04-21T16:00:00Z", recording_url: "http://x" })!.recordingUrl, null, "https uniquement");
  assert.equal(mapAllo({ id: "msg-def456", type: "SMS", date: "2026-04-21T16:00:00Z" }), null, "SMS ignorés");
});

test("gong : appels extensive, participants et transcription (doc officielle)", async () => {
  const { mapGong, gongTranscript } = await import("../src/lib/providers/gong");
  // Valeurs d'exemple de la spécification /v2/calls/extensive
  const parties = [
    { id: "56825452554556", name: "Alice Martin", userId: "234599484848423", speakerId: "6432345678555530067", affiliation: "Internal" },
    { id: "56825452554557", name: "Léa Durand", title: "CEO", phoneNumber: "+33612345678", speakerId: "6432345678555530068", affiliation: "External" },
  ];
  const g = mapGong({ metaData: { id: "7782342274025937895", url: "https://app.gong.io/call?id=7782342274025937895", title: "Example call",
    started: "2018-02-18T08:00:00Z", duration: 460, primaryUserId: "234599484848423", direction: "Outbound", scope: "External", media: "Audio", sdrDisposition: "Got the gatekeeper" },
    parties, content: { brief: "Discussion sur le budget." } })!;
  assert.equal(g.externalId, "7782342274025937895");
  assert.equal(g.durationSec, 460);
  assert.equal(g.direction, "outbound");
  assert.equal(g.connected, true);
  assert.equal(g.kind, "call");
  assert.equal(g.repName, "Alice Martin");
  assert.equal(g.firstName, "Léa");
  assert.equal(g.lastName, "Durand");
  assert.equal(g.jobTitle, "CEO");
  assert.equal(g.phone, "+33612345678");
  assert.equal(g.status, "Got the gatekeeper");
  assert.equal(g.summary, "Discussion sur le budget.");
  assert.equal(g.listName, "Appels directs");
  assert.equal(g.recordingUrl, "https://app.gong.io/call?id=7782342274025937895");
  const z = mapGong({ metaData: { id: "1", started: "2018-02-18T08:00:00Z", duration: 0, direction: "Conference", media: "Video" } })!;
  assert.equal(z.connected, false);
  assert.equal(z.kind, "meeting");
  assert.equal(mapGong({ metaData: { title: "sans id" } }), null);
  const lines = gongTranscript([
    { speakerId: "6432345678555530067", topic: "Intro", sentences: [{ start: 1000, end: 2000, text: "Bonjour" }, { start: 2500, end: 3000, text: "Léa" }] },
    { speakerId: "6432345678555530068", sentences: [{ start: 460230, end: 462000, text: "Oui ?" }] },
    { speakerId: "999", sentences: [{ start: 470000, text: "Inconnu" }] },
  ], parties);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].s, "Alice Martin");
  assert.equal(lines[0].t, "Bonjour Léa");
  assert.equal(lines[1].s, "Léa Durand");
  assert.equal(lines[1].ts, "07:40");
  assert.equal(lines[2].s, "Intervenant 1");
});

test("gong : l'URL de base n'accepte qu'un domaine Gong", async () => {
  const { gong } = await import("../src/lib/providers/gong");
  await assert.rejects(gong.test({ accessKey: "k", accessKeySecret: "s", baseUrl: "https://evil.example.com" }), /URL de base Gong invalide/);
});
