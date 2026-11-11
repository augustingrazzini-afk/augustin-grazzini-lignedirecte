import { test } from "node:test";
import assert from "node:assert/strict";

const { mapSalesloft } = await import("../src/lib/providers/salesloft");
const { mapApollo } = await import("../src/lib/providers/apollo");

test("salesloft : appel de cadence reconnu (exemple de la doc officielle)", () => {
  // Exemple de GET /v2/activities/calls (developers.salesloft.com/docs/api/activities-calls-index)
  const row = {
    id: 1, to: "7705551234", duration: 60, sentiment: "Demo Scheduled", disposition: "Connected", positive: true, connected: true,
    call_data_record_ids: [123, 456], direction: "outbound", log_source: "unknown",
    created_at: "2026-01-01T00:00:00.000000+00:00", updated_at: "2026-01-01T00:00:00.000000+00:00",
    recordings: [{ url: "https://example.com/recording1", recording_status: "completed", status: "completed" }],
    user: { id: 1, _href: "https://api.salesloft.com/v2/users/1" }, action: { id: 1 }, task: { id: 1 },
    called_person: { id: 1, _href: "https://api.salesloft.com/v2/people/1" },
    note: { id: 1, _href: "https://api.salesloft.com/v2/notes/1" },
    cadence: { id: 1, _href: "https://api.salesloft.com/v2/cadences/1" }, step: { id: 1 },
  };
  const a = mapSalesloft(row, {
    people: new Map([["1", { id: 1, first_name: "Pat", last_name: "Johnson", person_company_name: "SalesLoft", title: "Sales Development Representative", phone: "+1 444 555 6666" }]]),
    users: new Map([["1", "Benjamin Franklin"]]),
    cadences: new Map([["1", "Prospecting - VP of Sales"]]),
    notes: new Map([["1", "Was very interested in a demo at a later time"]]),
  })!;
  assert.equal(a.externalId, "1");
  assert.equal(a.startedAt.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(a.durationSec, 60);
  assert.equal(a.direction, "outbound");
  assert.equal(a.status, "connected");
  assert.equal(a.connected, true);
  assert.equal(a.meetingBooked, true, "sentiment « Demo Scheduled »");
  assert.equal(a.firstName, "Pat");
  assert.equal(a.company, "SalesLoft");
  assert.equal(a.phone, "7705551234");
  assert.equal(a.repName, "Benjamin Franklin");
  assert.equal(a.listName, "Prospecting - VP of Sales");
  assert.equal(a.summary, "Was very interested in a demo at a later time");
  assert.equal(a.recordingUrl, "https://example.com/recording1");

  const b = mapSalesloft({ id: 2, duration: 0, disposition: "No Answer", connected: false, direction: "outbound", created_at: "2026-01-01T00:00:00.000000+00:00",
    recordings: [{ url: "http://example.com/recording/1", recording_status: "completed" }] })!;
  assert.equal(b.connected, false);
  assert.equal(b.meetingBooked, false);
  assert.equal(b.listName, "Appels directs");
  assert.equal(b.recordingUrl, null, "http refusé");
  assert.equal(mapSalesloft({ duration: 5 }), null, "sans id : ignoré");
});

test("apollo : appels du dialer reconnus (exemple de la doc officielle)", () => {
  // Extraits de GET /phone_calls/search (docs.apollo.io/reference/search-for-calls)
  const outcomes = new Map([["6095a710bd01d100a506d4c5", "Left Voicemail"], ["6095a710bd01d100a506d4ca", "Connected - Positive"], ["x1", "Meeting booked"]]);
  const users = new Map([["66302798d03b9601c7934ebf", "Anita Rao"]]);
  const a = mapApollo({
    id: "684b5631a57ddb0021985250", user_id: "66302798d03b9601c7934ebf", contact_id: "657a43dd324b9902d0c4dd37", phone_call_outcome_id: null,
    recording_url: null, inbound: false, from_number: "+15735550189", to_number: "+14155550181",
    start_time: "2025-06-12T22:35:29.000+00:00", end_time: "2025-06-12T22:35:35.000+00:00", note: null, status: "no-answer",
    voicemail_dropped: false, note_text: "", duration: 0,
    contact: { id: "657a43dd324b9902d0c4dd37", first_name: "Marcus", last_name: "Hale", title: null, organization_name: "Apollo.io" },
  }, outcomes, users)!;
  assert.equal(a.externalId, "684b5631a57ddb0021985250");
  assert.equal(a.connected, false);
  assert.equal(a.status, "no-answer");
  assert.equal(a.firstName, "Marcus");
  assert.equal(a.company, "Apollo.io");
  assert.equal(a.phone, "+14155550181");
  assert.equal(a.repName, "Anita Rao");
  assert.equal(a.listName, "Appels directs");

  const b = mapApollo({
    id: "683760e6aac06700213aa9d5", user_id: "66302798d03b9601c7934ebc", phone_call_outcome_id: "6095a710bd01d100a506d4ca",
    recording_url: "https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Recordings/RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    inbound: true, from_number: "+19515550199", to_number: "+15625550183",
    start_time: "2025-05-28T19:15:50.000+00:00", end_time: "2025-05-28T19:16:10.000+00:00", status: "completed", voicemail_dropped: false, note_text: "", duration: 20,
  }, outcomes, users)!;
  assert.equal(b.direction, "inbound");
  assert.equal(b.durationSec, 20);
  assert.equal(b.connected, true);
  assert.equal(b.phone, "+19515550199");
  assert.deepEqual(b.tags, ["Connected - Positive"]);
  assert.equal(b.meetingBooked, false);
  assert.ok(b.recordingUrl!.startsWith("https://api.twilio.com/"));

  const v = mapApollo({ id: "v1", start_time: "2025-05-28T16:44:49.000+00:00", status: "completed", duration: 21, phone_call_outcome_id: "6095a710bd01d100a506d4c5" }, outcomes)!;
  assert.equal(v.connected, false, "messagerie");
  const m = mapApollo({ id: "m1", start_time: "2025-05-28T16:44:49.000+00:00", status: "completed", duration: 300, phone_call_outcome_id: "x1" }, outcomes)!;
  assert.equal(m.meetingBooked, true);
  assert.equal(mapApollo({ id: "z" }), null, "sans date : ignoré");
});
