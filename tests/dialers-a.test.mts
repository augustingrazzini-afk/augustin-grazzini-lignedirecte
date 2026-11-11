import { test } from "node:test";
import assert from "node:assert/strict";

const { mapJustcall, mapJustcallSalesDialer } = await import("../src/lib/providers/justcall");

// Exemple repris des valeurs par défaut de la doc : https://developer.justcall.io/reference/call_list_v21
test("justcall : appel JustCall reconnu (doc officielle)", () => {
  const row = {
    id: 123456, call_sid: "CA0247d967e9bb3c284163a37a43XXXX", contact_number: "13801136XXX", contact_name: "Rachel G.", contact_email: "john@suits.co",
    justcall_number: "12707705XXX", justcall_line_name: "Sales Line", agent_id: 1308, agent_name: "John Smith", agent_email: "john@abc.com", agent_active: "Active",
    call_date: "2017-12-18", call_time: "13:55:43", call_user_date: "2017-12-17", call_user_time: "8:25:43", cost_incurred: 0.005,
    call_duration: { friendly_duration: "00:00:05", total_duration: 155, conversation_time: 150, ring_time: 5, hold_time: 5, queue_wait_time: 5, wrap_up_time: 5, handle_time: 5 },
    call_info: { direction: "Outgoing", type: "Answered", disposition: "Sales: Lead", notes: "abc", rating: "5", status: "Unarchived",
      recording: "https://bifrost.justcall.io/voice-tools-calling/v1/recording/get-presigned-url?recSid=REXXXXXac0aae0fXXXXXXedXXXXXa90&redirect=1&getSize=0&companyId=XXXX49" },
    justcall_ai: { call_score: 0, call_summary: "Call summary", customer_sentiment: "Positive", tags: ["demo", "follow-up"] },
  };
  const a = mapJustcall(row)!;
  assert.equal(a.externalId, "123456");
  assert.equal(a.startedAt.toISOString(), "2017-12-18T13:55:43.000Z");
  assert.equal(a.durationSec, 150);
  assert.equal(a.direction, "outbound");
  assert.equal(a.status, "answered");
  assert.equal(a.connected, true);
  assert.equal(a.meetingBooked, false);
  assert.equal(a.firstName, "Rachel");
  assert.equal(a.lastName, "G.");
  assert.equal(a.phone, "13801136XXX");
  assert.equal(a.repName, "John Smith");
  assert.equal(a.listName, "Sales Line");
  assert.equal(a.summary, "abc\nCall summary");
  assert.equal(a.recordingUrl, "https://api.justcall.io/v2.1/calls/123456/recording/download");
  const b = mapJustcall({ ...row, id: 7, justcall_line_name: "", call_info: { direction: "Incoming", type: "Missed", disposition: "Sales: Meeting booked" }, call_duration: { conversation_time: 0 } })!;
  assert.equal(b.connected, false);
  assert.equal(b.direction, "inbound");
  assert.equal(b.listName, "Appels directs");
  assert.equal(b.meetingBooked, true);
  assert.equal(b.recordingUrl, null);
  assert.equal(mapJustcall({ call_sid: "x" }), null, "sans id ni date : ignoré");
});

// Exemple repris de la doc : https://developer.justcall.io/reference/sales_dialer_call_list_v21
test("justcall : appel Sales Dialer avec sa campagne (doc officielle)", () => {
  const a = mapJustcallSalesDialer({
    call_id: 95676, call_sid: "CA0247d967e9bb3c284163a37a43XXXX", contact_id: 15162, contact_name: "Rachel G.", contact_number: "13801136XXX", contact_email: "john@suits.co",
    sales_dialer_number: "12707705XXX", agent_id: 1308, agent_name: "John Smith", agent_email: "john@abc.com", call_date: "2017-12-18", call_time: "13:55:43",
    call_info: { direction: "Outgoing", type: "Connected", call_answered_by: "Human Pickup", disposition: "Sales: Lead", duration: 130, friendly_duration: "0:02:10", notes: "abc", rating: 5, vmdrop: false,
      recording: "https://jc-recordings.s3.amazonaws.com/RE09b557475af8cxxxxxxxxx.mp3" },
    campaign: { id: 173, name: "Website Leads", type: "PowerDial" },
  })!;
  assert.equal(a.externalId, "sd-95676");
  assert.equal(a.durationSec, 130);
  assert.equal(a.connected, true);
  assert.equal(a.contactRef, "15162");
  assert.equal(a.listName, "Website Leads");
  assert.equal(a.campaign, "173");
  assert.equal(a.recordingUrl, "https://jc-recordings.s3.amazonaws.com/RE09b557475af8cxxxxxxxxx.mp3");
});
