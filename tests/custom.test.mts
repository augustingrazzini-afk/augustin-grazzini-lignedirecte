import { test } from "node:test";
import assert from "node:assert/strict";

const { findRows, mapCustom } = await import("../src/lib/providers/custom");
const { toTranscript } = await import("../src/lib/transcribe");

test("mon outil : la liste d'appels est trouvée et les champs reconnus", () => {
  const res = { meta: { next_cursor: "abc" }, data: [
    { id: 42, started_at: "2026-11-10T09:00:00Z", duration: 185, status: "answered", contact: { first_name: "Léa", last_name: "Martin", company: "Hexalis" }, user: { name: "Augustin" }, list: { name: "Hexalis - novembre" }, recording_url: "https://cdn.example.com/a.mp3", transcript: [{ speaker: "Augustin", text: "Bonjour", start: 1.2 }, { speaker: "Léa", text: "Oui ?", start: 3 }] },
    { id: 43, created_at: 1794300000, duration: 0, status: "no-answer" },
    { nothing: true },
  ] };
  const rows = findRows(res)!;
  assert.equal(rows.length, 3);
  const a = mapCustom(rows[0])!;
  assert.equal(a.externalId, "42");
  assert.equal(a.connected, true);
  assert.equal(a.firstName, "Léa");
  assert.equal(a.company, "Hexalis");
  assert.equal(a.repName, "Augustin");
  assert.equal(a.listName, "Hexalis - novembre");
  assert.equal(a.recordingUrl, "https://cdn.example.com/a.mp3");
  assert.equal(a.transcript!.length, 2);
  const b = mapCustom(rows[1])!;
  assert.equal(b.connected, false);
  assert.equal(mapCustom(rows[2]), null, "sans id ni date : ignoré");
  assert.deepEqual(findRows([{ id: 1 }]), [{ id: 1 }]);
});

test("transcription automatique : interlocuteurs et horodatage", () => {
  const lines = toTranscript({ transcription: { utterances: [
    { speaker: 0, start: 0.5, text: "Bonjour Madame" }, { speaker: 0, start: 2, text: "je vous appelle" }, { speaker: 1, start: 65, text: "Oui ?" },
  ] } });
  assert.equal(lines.length, 2, "répliques consécutives fusionnées");
  assert.equal(lines[0].s, "Intervenant 1");
  assert.equal(lines[1].ts, "01:05");
});

test("skipcall : appels de séquence reconnus (doc officielle)", async () => {
  const { mapSkipcall } = await import("../src/lib/providers/skipcall");
  const seqs = new Map([["seq-1", "Hexalis - novembre"]]);
  const a = mapSkipcall({ id: "c1", status: "COMPLETED", type: "outbound", startedAt: "2026-11-10T09:00:00.000Z", endedAt: "2026-11-10T09:04:30.000Z",
    sequenceId: "seq-1", notes: "Rappeler jeudi", contact: { id: "k1", firstName: "Léa", lastName: "Martin" }, phoneNumber: { value: "+33612345678" }, caller: { firstName: "Alice", lastName: "Martin" } }, seqs)!;
  assert.equal(a.durationSec, 270);
  assert.equal(a.connected, true);
  assert.equal(a.listName, "Hexalis - novembre");
  assert.equal(a.repName, "Alice Martin");
  assert.equal(a.summary, "Rappeler jeudi");
  const b = mapSkipcall({ id: "c2", status: "NO_ANSWER", startedAt: "2026-11-10T09:10:00.000Z", endedAt: "2026-11-10T09:10:25.000Z" }, seqs)!;
  assert.equal(b.connected, false);
  assert.equal(b.listName, "Appels directs");
});

test("lemlist : appel du dialer (aircallEnded) et transcription par canal", async () => {
  const { mapLemlist, lemlistTranscript } = await import("../src/lib/providers/lemlist");
  const a = mapLemlist({ _id: "act_W1", type: "aircallEnded", createdAt: "2026-11-10T14:31:30.359Z", startedAt: "2026-11-10T14:31:30.359Z", duration: 212, direction: "outbound",
    callAnswer: "answered", callStatus: null, sendUserName: "Grazzini Augustin", contactId: "ctc_1", leadPhone: "+33633269719", callS3Ready: true, campaignName: "LINKEDIN",
    leadFirstName: "Simon", leadLastName: "Mahé", leadCompanyName: "Faks", callTranscriptSummary: "<strong>Points clés</strong>\n<ul><li>Budget validé</li></ul>" })!;
  assert.equal(a.externalId, "act_W1");
  assert.equal(a.connected, true);
  assert.equal(a.durationSec, 212);
  assert.equal(a.listName, "LINKEDIN");
  assert.equal(a.company, "Faks");
  assert.match(a.summary || "", /Budget validé/);
  assert.match(a.recordingUrl || "", /^https:\/\/api\.lemlist\.com\/api\/activities\?.*#act_W1$/);
  const missed = mapLemlist({ _id: "act_K", createdAt: "2026-11-10T12:15:46Z", duration: 0, callAnswer: "missed", callStatus: "no-answer" })!;
  assert.equal(missed.connected, false);
  assert.equal(missed.status, "no-answer");
  assert.equal(missed.listName, "Appels directs");
  const t = lemlistTranscript({ utterances: [{ start: 2625, text: "Bonjour Nisrine", channel: 0 }, { start: 5187, text: "Oui, salut.", channel: 1 }, { start: 6200, text: "Ça va ?", channel: 1 }] }, "Augustin");
  assert.deepEqual(t, [{ s: "Augustin", t: "Bonjour Nisrine", ts: "00:03" }, { s: "Prospect", t: "Oui, salut. Ça va ?", ts: "00:05" }]);
});
