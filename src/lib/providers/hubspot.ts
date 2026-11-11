import { http, num, Provider, NormalizedCall, str, stripHtml, toDate } from "./types";

const API = "https://api.hubapi.com";
const headers = (c: Record<string, string>) => ({ Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" });
const CONNECTED = "f240bbac-87c9-4f6e-bf70-924b57d47db7"; // disposition HubSpot « Connected »
const PROPS = ["hs_call_title", "hs_call_body", "hs_call_duration", "hs_call_disposition", "hs_call_direction", "hs_timestamp", "hs_call_recording_url", "hs_call_status", "hubspot_owner_id"];

function map(r: any): NormalizedCall {
  const p = r.properties || {};
  const dur = Math.round(num(p.hs_call_duration) / 1000);
  const connected = p.hs_call_disposition === CONNECTED || dur > 0;
  const title = str(p.hs_call_title);
  return {
    externalId: str(r.id),
    startedAt: toDate(p.hs_timestamp) || new Date(),
    durationSec: dur,
    direction: p.hs_call_direction === "INBOUND" ? "inbound" : "outbound",
    status: connected ? "connected" : "no-answer",
    connected,
    meetingBooked: /rdv|rendez|meeting|booked/i.test(title),
    company: title.replace(/^(appel|call)\s+(avec|with)\s+/i, "").slice(0, 120),
    summary: stripHtml(p.hs_call_body),
    recordingUrl: p.hs_call_recording_url || null,
  };
}

export const hubspot: Provider = {
  id: "hubspot",
  label: "HubSpot",
  credentialFields: [{ key: "token", label: "Jeton d'application privée", type: "password", help: "HubSpot > Paramètres > Intégrations > Applications privées (droit crm.objects.calls.read)" }],
  help: "Appels journalisés dans votre CRM : notes, durée, résultat et enregistrement.",
  async test(c) {
    await http(`${API}/crm/v3/objects/calls?limit=1`, { headers: headers(c), label: "HubSpot" });
  },
  async *list(c, since) {
    let after: string | undefined;
    for (let i = 0; i < 50; i++) {
      const body = {
        filterGroups: [{ filters: [{ propertyName: "hs_timestamp", operator: "GTE", value: String(since.getTime()) }] }],
        sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
        properties: PROPS,
        limit: 100,
        ...(after ? { after } : {}),
      };
      const res = (await http(`${API}/crm/v3/objects/calls/search`, { method: "POST", headers: headers(c), body: JSON.stringify(body), label: "HubSpot" })) as any;
      yield (res.results || []).map(map);
      after = res.paging?.next?.after;
      if (!after) break;
    }
  },
};
