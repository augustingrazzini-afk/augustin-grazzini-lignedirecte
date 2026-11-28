import { test } from "node:test";
import assert from "node:assert/strict";

// Connexion en un clic (serveur MCP de l'éditeur) : repérage de l'outil qui liste les appels et lecture des champs.
const { pickCallTool, callArgs, rowsOf, mapGeneric } = await import("../src/lib/providers/mcp-connect");
const { mapLemlist } = await import("../src/lib/providers/lemlist");
const { getProvider } = await import("../src/lib/providers");

test("on choisit l'outil qui liste les appels, pas celui qui en crée ou en détaille un", () => {
  const tools = [
    { name: "create_call", inputSchema: { properties: { phone: {} } } },
    { name: "get_call_details", inputSchema: { properties: { call_id: {} }, required: ["call_id"] } },
    { name: "list_calls", inputSchema: { properties: { from_date: {}, to_date: {}, cursor: {}, limit: { maximum: 50 } } } },
    { name: "list_contacts", inputSchema: { properties: {} } },
  ];
  assert.equal(pickCallTool(tools)?.name, "list_calls");
  assert.equal(pickCallTool([{ name: "search_people" }]), null);
});

test("les arguments couvrent la période, la taille de page et le curseur", () => {
  const since = new Date("2026-11-01T00:00:00Z");
  const a = callArgs({ name: "list_calls", inputSchema: { properties: { from_date: { description: "YYYY-MM-DD" }, to_date: {}, cursor: {}, limit: { maximum: 50 } } } }, since, 1, "abc");
  assert.equal(a.from_date, "2026-11-01");
  assert.ok(typeof a.to_date === "string");
  assert.equal(a.limit, 50);
  assert.equal(a.cursor, "abc");
});

test("lecture d'un appel au format courant", () => {
  const rows = rowsOf({ data: { calls: [{ id: "c1", started_at: "2026-11-20T10:00:00Z", duration: 125, disposition: "Connected", contact: { name: "Paul Morel", company: "Atelier Morel", phone: "+33600000000" }, user: { name: "Léa" }, summary: "<p>Intéressé</p>" }] } });
  const m = mapGeneric(rows[0])!;
  assert.equal(m.externalId, "c1");
  assert.equal(m.durationSec, 125);
  assert.equal(m.connected, true);
  assert.deepEqual([m.firstName, m.lastName, m.company, m.repName, m.summary], ["Paul", "Morel", "Atelier Morel", "Léa", "Intéressé"]);
  assert.equal(mapGeneric({ id: "c2", started_at: "2026-11-20T10:00:00Z", duration: 20, status: "no-answer" })!.connected, false);
  assert.equal(mapGeneric({ started_at: "2026-11-20" }), null);
});

test("lemlist en un clic : le format de son serveur MCP est bien lu", () => {
  const m = mapLemlist({ activityId: "act_1", createdAt: "2026-11-26T09:07:12.389Z", direction: "outbound", duration: 64, callAnswer: "answered", lead: { firstName: "Julie", lastName: "Roux", phone: "+33611111111", companyName: "Datalia" }, transcriptSummary: "Rappel jeudi" })!;
  assert.deepEqual([m.externalId, m.durationSec, m.connected, m.firstName, m.company, m.summary], ["act_1", 64, true, "Julie", "Datalia", "Rappel jeudi"]);
});

test("avec une clé API, l'outil garde son fonctionnement habituel", () => {
  for (const id of ["lemlist", "dialpad", "close", "salesloft", "apollo", "gong"]) {
    const p = getProvider(id);
    assert.equal(typeof p.list, "function", id);
    assert.ok(p.credentialFields.length > 0, id);
  }
});
