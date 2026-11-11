import { test } from "node:test";
import assert from "node:assert/strict";

const { mapDialpad, dialpadTranscript } = await import("../src/lib/providers/dialpad");
const { mapClose, closeTranscript } = await import("../src/lib/providers/close");

test("dialpad : appel sortant décroché (exemple « Outbound Hangup » de la doc)", () => {
  const a = mapDialpad({
    master_call_id: null, date_ended: 1582853818129, internal_number: "+16010123456", duration: 16464.904000000002, total_duration: 19303.775000000001,
    call_id: 4978137078431744, state: "hangup", date_started: 1582853788099, direction: "outbound", date_connected: 1582853801664, was_recorded: false,
    target: { phone: "+16010123456", type: "user", id: 5908860123456789, name: "sample", email: "test@dialpad.com" },
    contact: { phone: "+16043111111", type: "google", id: "http://www.google.com/m8/feeds/contacts/test@dialpad.com/base/21042cfc8b367347", name: "Test for a Long Name", email: "" },
    external_number: "+16043111111",
    recording_details: [{ id: "REC1", recording_type: "callrecording", url: "https://dialpad.com/r/REC1" }, { id: "ADM", recording_type: "admincallrecording", url: "https://dialpad.com/blob/adminrecording/ADM.mp3" }],
  })!;
  assert.equal(a.externalId, "4978137078431744");
  assert.equal(a.startedAt.getTime(), 1582853788099);
  assert.equal(a.durationSec, 16);
  assert.equal(a.direction, "outbound");
  assert.equal(a.connected, true);
  assert.equal(a.status, "connected");
  assert.equal(a.meetingBooked, false);
  assert.equal(a.firstName, "Test");
  assert.equal(a.lastName, "for a Long Name");
  assert.equal(a.phone, "+16043111111");
  assert.equal(a.repName, "sample");
  assert.equal(a.listName, "Appels directs");
  assert.equal(a.recordingUrl, "https://dialpad.com/r/REC1");
});

test("dialpad : appel manqué, nom = numéro, sans enregistrement", () => {
  const b = mapDialpad({ call_id: "1002", contact: { id: "1001", name: "(415) 555-7777", phone: "+14155557777", type: "local" }, date_started: "1356998400000", direction: "inbound", state: "missed", target: { name: "テÉst Bot", type: "user" } })!;
  assert.equal(b.connected, false);
  assert.equal(b.status, "missed");
  assert.equal(b.direction, "inbound");
  assert.equal(b.firstName, "", "un numéro n'est pas un nom");
  assert.equal(b.phone, "+14155557777");
  assert.equal(b.recordingUrl, null);
  assert.equal(mapDialpad({ state: "hangup" }), null, "sans id ni date : ignoré");
});

test("dialpad : transcription Dialpad AI (exemple de la doc)", () => {
  const lines = dialpadTranscript({ call_id: "1001", lines: [
    { contact_id: "ag5k", content: "hi", name: "(415) 555-6666", time: "2018-05-08T21:33:19.300000", type: "transcript" },
    { content: "hello", name: "テÉst Bot", time: "2018-05-08T21:33:15.300000", type: "transcript", user_id: "2" },
    { content: "price_inquiry", name: "テÉst Bot", time: "2018-05-08T21:33:17.300000", type: "moment", user_id: "2" },
  ] });
  assert.equal(lines.length, 2, "les « moments » sont ignorés");
  assert.deepEqual(lines[0], { s: "テÉst Bot", t: "hello", ts: "00:00" });
  assert.equal(lines[1].ts, "00:04");
});

test("close : activité d'appel (exemple de la doc)", () => {
  const row = {
    _type: "Call", activity_at: "2013-02-01T00:51:33+00:00", contact_id: "cont_q4x", date_created: "2013-02-20T06:34:33.637000+00:00",
    id: "acti_Ay0", lead_id: "lead_s6v", outcome_id: "outcome_031", source: "Close.io", status: "completed", user_id: "user_N6K", users: [],
    call_method: "regular", cost: "2", dialer_id: null, dialer_saved_search_id: null, direction: "outbound", disposition: "answered", duration: 10,
    note: "", note_html: "<body><p>Rappeler jeudi</p></body>", phone: "+16503334444", recording_url: null, remote_phone: "+16503334444", user_name: "Jane User",
  };
  const a = mapClose(row, { outcomes: new Map([["outcome_031", "Intéressé"]]), contacts: new Map([["cont_q4x", { name: "John Lead", title: "CEO" }]]), leads: new Map([["lead_s6v", "Wayne Enterprises"]]) })!;
  assert.equal(a.externalId, "acti_Ay0");
  assert.equal(a.startedAt.toISOString(), "2013-02-01T00:51:33.000Z");
  assert.equal(a.durationSec, 10);
  assert.equal(a.connected, true);
  assert.equal(a.status, "answered");
  assert.equal(a.meetingBooked, false);
  assert.equal(a.firstName, "John");
  assert.equal(a.lastName, "Lead");
  assert.equal(a.company, "Wayne Enterprises");
  assert.equal(a.jobTitle, "CEO");
  assert.equal(a.repName, "Jane User");
  assert.equal(a.phone, "+16503334444");
  assert.equal(a.listName, "Appels directs");
  assert.equal(a.summary, "Issue : Intéressé\nRappeler jeudi");
  assert.equal(a.recordingUrl, null);

  const b = mapClose({ ...row, id: "acti_2", disposition: "no-answer", duration: 0, dialer_saved_search_id: "save_1", recording_url: "http://x.test/a.mp3" }, { views: new Map([["save_1", "Hexalis - novembre"]]) })!;
  assert.equal(b.connected, false);
  assert.equal(b.status, "no-answer");
  assert.equal(b.listName, "Hexalis - novembre");
  assert.equal(b.campaign, "save_1");
  assert.equal(b.recordingUrl, null, "https uniquement");
  assert.equal(mapClose({ id: "" }), null);
});

test("close : transcription d'enregistrement (exemple de la doc)", () => {
  const lines = closeTranscript({ utterances: [
    { speaker_label: "John Lead", speaker_side: "contact", start: 0.1, end: 1.2, text: "Hey, what's up? How is it going?" },
    { speaker_label: "Jane User", speaker_side: "close-user", start: 1.3, end: 2.4, text: "Hey John, I'm doing great." },
    { speaker_label: "Jane User", speaker_side: "close-user", start: 65, end: 66, text: "How about you?" },
  ], summary_text: "Summary text", summary_html: "<p>Summary text</p>" });
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { s: "John Lead", t: "Hey, what's up? How is it going?", ts: "00:00" });
  assert.equal(lines[1].t, "Hey John, I'm doing great. How about you?");
  assert.equal(lines[1].ts, "00:01");
});
