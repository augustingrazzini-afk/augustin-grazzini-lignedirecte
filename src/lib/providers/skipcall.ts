import { http, Provider, NormalizedCall, str, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * Skipcall (power dialer) — API publique https://api-public.skipcall.app, clé « Bearer sk_live_… ».
 * Doc : https://docs.skipcall.app — appels : GET /v1/calls (paginé par page/limit, filtre JSON sur createdAt),
 * transcription : GET /v1/calls/{id}/transcription, enregistrement : GET /v1/calls/{id}/recording (audio protégé par la clé).
 */
const API = "https://api-public.skipcall.app";
const LABEL = "Skipcall";
const headers = (c: Record<string, string>) => ({ Authorization: `Bearer ${c.apiKey}`, Accept: "application/json" });
const CONNECTED = new Set(["CONNECTED", "COMPLETED", "IN_PROGRESS"]);

const ts = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const fullName = (o: any) => [str(o?.firstName), str(o?.lastName)].filter(Boolean).join(" ");

export function mapSkipcall(c: any, sequences: Map<string, string>): NormalizedCall | null {
  const id = str(c?.id);
  const startedAt = toDate(c?.startedAt) || toDate(c?.createdAt);
  if (!id || !startedAt) return null;
  const ended = toDate(c?.endedAt);
  const status = str(c?.status).toUpperCase();
  const durationSec = ended ? Math.max(0, Math.round((ended.getTime() - startedAt.getTime()) / 1000)) : 0;
  const connected = CONNECTED.has(status) && durationSec > 0;
  const seq = str(c?.sequenceId);
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: /in/i.test(str(c?.type)) ? "inbound" : "outbound",
    status: status.toLowerCase() || "unknown",
    connected,
    meetingBooked: false,
    firstName: str(c?.contact?.firstName),
    lastName: str(c?.contact?.lastName),
    contactRef: str(c?.contact?.id),
    phone: str(c?.phoneNumber?.value),
    repName: fullName(c?.caller),
    listName: seq ? sequences.get(seq) || "Séquence Skipcall" : "Appels directs",
    campaign: seq,
    summary: str(c?.notes),
  };
}

async function sequenceNames(c: Record<string, string>) {
  const map = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const res = (await http(`${API}/v1/sequences?page=${page}&limit=100`, { headers: headers(c), label: LABEL })) as any;
    for (const s of res?.data || []) if (s?.id) map.set(String(s.id), str(s.name));
    if (page >= Number(res?.totalPages || 1)) break;
  }
  return map;
}

export const skipcall: Provider = {
  id: "skipcall",
  label: "Skipcall",
  channels: ["call"],
  credentialFields: [{ key: "apiKey", label: "Clé API Skipcall", type: "password", help: "Skipcall › Paramètres › Clés API (formule Starter ou supérieure)" }],
  help: "Appels de vos séquences, transcriptions, résumés et enregistrements. Chaque séquence Skipcall peut être rangée chez un client.",
  async test(c) {
    await http(`${API}/v1/calls?page=1&limit=1`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    const seqs = await sequenceNames(c).catch(() => new Map<string, string>());
    const filters = encodeURIComponent(JSON.stringify({ createdAt: { op: "gt", from: since.toISOString() } }));
    const sort = encodeURIComponent(JSON.stringify({ orderBy: "createdAt", order: "desc" }));
    for (let page = 1; page <= 100; page++) {
      const res = (await http(`${API}/v1/calls?page=${page}&limit=100&sort=${sort}&filters=${filters}`, { headers: headers(c), label: LABEL })) as any;
      const rows: any[] = res?.data || [];
      yield rows.map((r) => mapSkipcall(r, seqs)).filter((x): x is NormalizedCall => !!x && !x.status.startsWith("not_initiated"));
      if (!rows.length || page >= Number(res?.totalPages || 1)) break;
    }
  },
  async details(c, id) {
    const out: Partial<NormalizedCall> = { hasDetail: true };
    const call = (await http(`${API}/v1/calls/${encodeURIComponent(id)}`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    const t = (await http(`${API}/v1/calls/${encodeURIComponent(id)}/transcription`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    if (t?.status === "COMPLETED" && Array.isArray(t.transcript)) {
      const lines: TranscriptLine[] = [];
      for (const u of t.transcript) {
        const text = str(u?.text); if (!text) continue;
        const s = `Intervenant ${Number(u?.speaker ?? 0) + 1}`;
        const last = lines[lines.length - 1];
        if (last && last.s === s) last.t += " " + text; else lines.push({ s, t: text, ts: ts(Number(u?.start) || 0) });
      }
      out.transcript = trimTranscript(lines);
      const notes = str(call?.notes);
      if (t.summary) out.summary = [notes, str(t.summary)].filter(Boolean).join("\n");
    }
    const rec = (await http(`${API}/v1/calls/${encodeURIComponent(id)}/recording`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    if (rec?.audioUrl && /^https:\/\/api-public\.skipcall\.app\//.test(rec.audioUrl)) out.recordingUrl = rec.audioUrl;
    const contactId = str(call?.contact?.id);
    if (contactId) {
      const ct = (await http(`${API}/v1/contacts/${encodeURIComponent(contactId)}`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
      const d = ct?.data && !Array.isArray(ct.data) ? ct.data : ct;
      if (d?.company) out.company = str(d.company);
      if (d?.role) out.jobTitle = str(d.role);
    }
    return out;
  },
  /** L'audio Skipcall n'est pas public : il se lit avec la clé (via notre relais, voir /api/calls/[id]/audio). */
  async fetchAudio(c, url, range) {
    if (!/^https:\/\/api-public\.skipcall\.app\//.test(url)) return null;
    return fetch(url, { headers: { Authorization: `Bearer ${c.apiKey}`, ...(range ? { Range: range } : {}) }, signal: AbortSignal.timeout(60_000) });
  },
};
