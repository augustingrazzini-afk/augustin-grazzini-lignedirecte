import { http, num, Provider, NormalizedCall, str, toDate, trimTranscript } from "./types";

// Format des appels Minari (observé sur leurs données) : { data: [...], has_more, next_cursor }.
// L'URL de base est configurable : à confirmer dans Minari > Settings > API & webhook.
const base = (c: Record<string, string>) => (c.baseUrl || process.env.MINARI_API_BASE || "https://api.minari.ai/v1").replace(/\/$/, "");
const headers = (c: Record<string, string>) => ({ Authorization: `Bearer ${c.apiKey}`, "x-api-key": c.apiKey, Accept: "application/json" });
const day = (d: Date) => d.toISOString().slice(0, 10);

type MinariCall = Record<string, any>;

function map(c: MinariCall): NormalizedCall {
  const st = str(c.status);
  const p = c.prospect || {};
  return {
    externalId: str(c.call_id || c.id),
    startedAt: toDate(c.started_at) || new Date(),
    durationSec: num(c.duration_seconds),
    direction: c.direction === "incoming" ? "inbound" : c.direction === "outgoing" ? "outbound" : undefined,
    status: st || "unknown",
    connected: st === "connected" || st === "meeting-booked",
    meetingBooked: !!c.meeting_booked || st === "meeting-booked",
    firstName: str(p.first_name),
    lastName: str(p.last_name),
    company: str(p.company),
    jobTitle: str(p.job_title),
    contactRef: str(p.contact_id),
    phone: str(c.direction === "incoming" ? c.from_number : c.to_number),
    repName: str(c.user?.name),
    listName: str(c.list?.list_name),
    campaign: str(c.list?.list_id),
    summary: str(c.summary),
    objections: Array.isArray(c.objections) ? c.objections.map((o: any) => (typeof o === "string" ? o : str(o?.category))).filter(Boolean) : [],
    recordingUrl: c.public_call_link || null,
  };
}

export const minari: Provider = {
  id: "minari",
  label: "Minari",
  channels: ["call"],
  credentialFields: [
    { key: "apiKey", label: "Clé API Minari", type: "password", help: "Minari > Settings > API & webhook" },
    { key: "baseUrl", label: "URL de l'API", optional: true, help: "Laissez vide sauf indication de Minari" },
    { key: "listIds", label: "Ne synchroniser que ces listes (ids séparés par des virgules)", optional: true },
  ],
  help: "Appels, résumés, objections et transcriptions. Pour du temps réel, ajoutez aussi l'URL de webhook dans Minari.",
  async test(c) {
    const end = new Date(Date.now() + 864e5), start = new Date(Date.now() - 864e5);
    await http(`${base(c)}/calls?start_date=${day(start)}&end_date=${day(end)}`, { headers: headers(c), label: "Minari" });
  },
  async *list(c, since) {
    const end = new Date(Date.now() + 864e5);
    const lists = str(c.listIds).split(",").map((s) => s.trim()).filter(Boolean);
    let cursor = "";
    for (let page = 0; page < 40; page++) {
      const q = new URLSearchParams({ start_date: day(since), end_date: day(end) });
      if (cursor) q.set("cursor", cursor);
      lists.forEach((l) => q.append("list_id", l));
      const res = (await http(`${base(c)}/calls?${q}`, { headers: headers(c), label: "Minari" })) as any;
      const rows: MinariCall[] = res.data || res.calls || [];
      yield rows.filter((r) => !lists.length || lists.includes(str(r.list?.list_id))).map(map);
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
  },
  async details(c, id) {
    const res = (await http(`${base(c)}/calls/${encodeURIComponent(id)}`, { headers: headers(c), label: "Minari" })) as any;
    const d = res.data || res;
    if (!d) return null;
    return {
      ...map(d),
      transcript: trimTranscript((d.transcript || []).map((l: any) => ({ s: str(l.speaker), t: str(l.text), ts: str(l.timestamp).slice(3, 8) }))),
      objDetails: (d.objections || []).filter((o: any) => typeof o === "object").map((o: any) => ({ category: str(o.category), summary: str(o.summary), rep_response: str(o.rep_response), passed: !!o.passed })),
      hasDetail: true,
    };
  },
  webhookCallId(p: any) {
    return str(p?.call_id || p?.data?.call_id || p?.call?.call_id || p?.data?.id) || null;
  },
};
