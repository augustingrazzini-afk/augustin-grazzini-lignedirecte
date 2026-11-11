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
