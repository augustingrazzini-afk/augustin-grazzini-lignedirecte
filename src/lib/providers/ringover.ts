import { http, num, Provider, NormalizedCall, str, toDate } from "./types";

const API = "https://public-api.ringover.com/v2";
const headers = (c: Record<string, string>) => ({ Authorization: c.apiKey, Accept: "application/json" });

function map(c: any): NormalizedCall {
  const answered = c.is_answered === true || c.is_answered === 1 || /answered|hangup/i.test(str(c.last_state)) && num(c.incall_duration) > 0;
  const dirIn = /^in/i.test(str(c.direction));
  const contact = c.contact || {};
  const user = c.user || {};
  return {
    externalId: str(c.cdr_id || c.call_id || c.id),
    startedAt: toDate(c.start_time) || new Date(),
    durationSec: num(c.incall_duration ?? c.total_duration),
    direction: dirIn ? "inbound" : "outbound",
    status: answered ? "connected" : str(c.last_state) || "no-answer",
    connected: !!answered,
    meetingBooked: (c.tags || []).some((t: any) => /rdv|rendez|meeting|booked/i.test(str(t?.name ?? t))),
    firstName: str(contact.firstname || contact.first_name),
    lastName: str(contact.lastname || contact.last_name),
    company: str(contact.company),
    contactRef: str(contact.contact_id || contact.id),
    phone: str(dirIn ? c.from_number : c.to_number),
    repName: [str(user.firstname), str(user.lastname)].filter(Boolean).join(" "),
    tags: (c.tags || []).map((t: any) => str(t?.name ?? t)).filter(Boolean),
    summary: [str(c.note), ...(c.comments || []).map((x: any) => str(x?.comment ?? x))].filter(Boolean).map((x) => "- " + x).join("\n"),
    recordingUrl: c.record || c.record_url || null,
  };
}

export const ringover: Provider = {
  id: "ringover",
  label: "Ringover",
  beta: true,
  credentialFields: [{ key: "apiKey", label: "Clé API", type: "password", help: "Ringover > Développeur > Créer une clé API (droit lecture des appels)" }],
  help: "Appels, notes, tags et enregistrements.",
  async test(c) {
    await http(`${API}/calls?limit_count=1`, { headers: headers(c), label: "Ringover" });
  },
  async *list(c, since) {
    const end = new Date();
    for (let offset = 0, i = 0; i < 50; i++) {
      const q = new URLSearchParams({ start_date: since.toISOString(), end_date: end.toISOString(), limit_count: "500", limit_offset: String(offset) });
      const res = (await http(`${API}/calls?${q}`, { headers: headers(c), label: "Ringover" })) as any;
      const rows = res.call_list || res.calls || [];
      yield rows.map(map);
      if (rows.length < 500) break;
      offset += rows.length;
    }
  },
  webhookCallId(p: any) {
    return str(p?.data?.cdr_id || p?.data?.call_id) || null;
  },
};
