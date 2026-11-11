import { http, msToTs, num, Provider, NormalizedCall, str, toDate, trimTranscript } from "./types";

const API = "https://api.aircall.io/v1";
const headers = (c: Record<string, string>) => ({ Authorization: "Basic " + Buffer.from(`${c.apiId}:${c.apiToken}`).toString("base64"), Accept: "application/json" });

function map(c: any): NormalizedCall {
  const answered = !!c.answered_at || (c.status === "done" && !c.missed_call_reason && num(c.duration) > 0);
  const tags: string[] = (c.tags || []).map((t: any) => str(t?.name ?? t)).filter(Boolean);
  const comments = (c.comments || []).map((x: any) => str(x?.content)).filter(Boolean);
  const started = toDate(c.started_at) || new Date();
  const talk = c.answered_at && c.ended_at ? Math.max(0, num(c.ended_at) - num(c.answered_at)) : answered ? num(c.duration) : 0;
  return {
    externalId: str(c.id),
    startedAt: started,
    durationSec: talk,
    direction: c.direction === "inbound" ? "inbound" : "outbound",
    status: answered ? "connected" : str(c.missed_call_reason) || "no-answer",
    connected: answered,
    meetingBooked: tags.some((t) => /rdv|rendez|meeting|booked/i.test(t)),
    firstName: str(c.contact?.first_name),
    lastName: str(c.contact?.last_name),
    company: str(c.contact?.company_name),
    contactRef: str(c.contact?.id),
    phone: str(c.raw_digits),
    repName: str(c.user?.name),
    listName: str(c.number?.name),
    tags,
    summary: comments.map((x: string) => "- " + x).join("\n"),
    recordingUrl: c.asset || c.recording || null,
  };
}

export const aircall: Provider = {
  id: "aircall",
  label: "Aircall",
  channels: ["call"],
  credentialFields: [
    { key: "apiId", label: "API ID" },
    { key: "apiToken", label: "API Token", type: "password", help: "Aircall > Intégrations & API > Clés API" },
  ],
  help: "Appels, tags, commentaires et enregistrements. Transcriptions et résumés si vous avez l'option AI Assist.",
  async test(c) {
    await http(`${API}/ping`, { headers: headers(c), label: "Aircall" });
  },
  async *list(c, since) {
    let url: string | null = `${API}/calls?from=${Math.floor(since.getTime() / 1000)}&per_page=50&order=asc`;
    for (let i = 0; url && i < 60; i++) {
      const res = (await http(url, { headers: headers(c), label: "Aircall" })) as any;
      yield (res.calls || []).map(map);
      url = res.meta?.next_page_link || null;
    }
  },
  async details(c, id) {
    const out: Partial<NormalizedCall> = { hasDetail: true };
    try {
      const t = (await http(`${API}/calls/${id}/transcription`, { headers: headers(c), label: "Aircall" })) as any;
      const utt = t?.transcription?.content?.utterances || t?.content?.utterances || [];
      out.transcript = trimTranscript(utt.map((u: any) => ({ s: u.participant_type === "internal" ? "Commercial" : "Prospect", t: str(u.text), ts: msToTs(num(u.start_time) * (num(u.start_time) < 1e5 ? 1000 : 1)) })));
    } catch { /* pas d'AI Assist ou pas de transcription */ }
    try {
      const s = (await http(`${API}/calls/${id}/summary`, { headers: headers(c), label: "Aircall" })) as any;
      const content = str(s?.summary?.content || s?.content);
      if (content) out.summary = content;
    } catch { /* pas de résumé */ }
    return out;
  },
  webhookCallId(p: any) {
    return str(p?.data?.id) || null;
  },
};
