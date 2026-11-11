import { http, Provider, NormalizedCall, str, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * Allo (téléphonie IA) — API publique https://api.withallo.com, en-tête « Authorization: Api-Key ak_live_… » (pas Bearer).
 * Doc : https://help.withallo.com/en/v2/api-reference/introduction.md
 * - authentification / portées : https://help.withallo.com/en/v2/api-reference/guides/authentication.md (portée CONVERSATIONS_READ)
 * - pagination page/size (max 100), objet `pagination.has_more` : https://help.withallo.com/en/v2/api-reference/guides/pagination.md
 * - appels : POST /v2/api/conversations/items/search (type CALL, date {from,to}) :
 *   https://help.withallo.com/en/v2/api-reference/conversations/search-conversation-items.md
 * - détail + transcription : GET /v2/api/conversations/items/{id}?extend=transcript :
 *   https://help.withallo.com/en/v2/api-reference/conversations/get-item.md
 * - valeurs de `result` : https://help.withallo.com/en/v2/api-reference/webhooks/event-catalog.md
 * - test : GET /v2/api/me (aucune portée requise) : https://help.withallo.com/en/v2/api-reference/users/me.md
 */
const API = "https://api.withallo.com";
const LABEL = "Allo";
const headers = (c: Record<string, string>) => ({ Authorization: `Api-Key ${c.apiKey}`, Accept: "application/json", "Content-Type": "application/json" });

const ts = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const day = (d: Date) => d.toISOString().slice(0, 10);
const https = (u: unknown) => (/^https:\/\//i.test(str(u)) ? str(u) : null);

/** Transcription Allo : `source` USER (notre commercial) ou EXTERNAL (le prospect), `time` en date ISO. */
function alloTranscript(entries: any[], start: Date, rep: string, prospect: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const e of entries) {
    const text = str(e?.text); if (!text) continue;
    const s = str(e?.source).toUpperCase() === "USER" ? rep || "Commercial" : prospect || "Prospect";
    const at = toDate(e?.time);
    const last = lines[lines.length - 1];
    if (last && last.s === s) last.t += " " + text;
    else lines.push({ s, t: text, ts: ts(at ? (at.getTime() - start.getTime()) / 1000 : 0) });
  }
  return trimTranscript(lines);
}

export function mapAllo(r: any): NormalizedCall | null {
  const id = str(r?.id);
  const startedAt = toDate(r?.date);
  if (!id || !startedAt || (r?.type && str(r.type).toUpperCase() !== "CALL")) return null;
  const result = str(r?.result).toUpperCase();
  // `recording_duration` = temps de parole ; `duration` inclut la sonnerie (doc « Field notes »).
  const durationSec = Math.max(0, Math.round(Number(r?.recording_duration ?? r?.duration) || 0));
  const machine = r?.detected_outbound_voicemail === true; // répondeur : `result` reste ANSWERED
  const connected = result === "ANSWERED" && !machine && durationSec > 0;
  const contact = Array.isArray(r?.contacts) ? r.contacts[0] : null;
  const extracted = r?.extracted_data?.contact || {};
  const name = str(contact?.name) || str(extracted.name);
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
  const repName = str(r?.user?.name);
  const tags: string[] = Array.isArray(r?.tags) ? r.tags.map(str).filter(Boolean) : [];
  const out: NormalizedCall = {
    externalId: id,
    startedAt,
    durationSec,
    direction: str(r?.direction).toUpperCase() === "INBOUND" ? "inbound" : "outbound",
    status: machine ? "voicemail" : result.toLowerCase() || "unknown",
    connected,
    meetingBooked: false,
    firstName: firstName || "",
    lastName: rest.join(" "),
    company: str(contact?.company?.name) || str(extracted.company),
    jobTitle: str(extracted.job_title),
    contactRef: str(contact?.id),
    phone: str(r?.contact_number),
    repName,
    listName: "Appels directs",
    tags,
    summary: str(r?.summary),
    recordingUrl: https(r?.recording_url),
  };
  if (Array.isArray(r?.transcript) && r.transcript.length) {
    out.transcript = alloTranscript(r.transcript, startedAt, repName, name);
    out.hasDetail = true;
  }
  return out;
}

export const allo: Provider = {
  id: "allo",
  label: "Allo",
  channels: ["call"],
  credentialFields: [{ key: "apiKey", label: "Clé API Allo", type: "password", help: "Allo › Settings › API (web.withallo.com/settings/api) › Create API Key, avec la portée CONVERSATIONS_READ (compte Admin ou Manager)" }],
  help: "Appels entrants et sortants, résumés IA, transcriptions et liens d'enregistrement.",
  async test(c) {
    await http(`${API}/v2/api/me`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    const to = new Date(Date.now() + 86_400_000); // borne haute : demain, pour inclure toute la journée
    for (let page = 1; page <= 200; page++) {
      const body = { type: "CALL", sort: "DATE_DESC", page, size: 100, date: { from: day(since), to: day(to) } };
      const res = (await http(`${API}/v2/api/conversations/items/search`, { method: "POST", headers: headers(c), body: JSON.stringify(body), label: LABEL })) as any;
      const rows: any[] = res?.data || [];
      yield rows.map(mapAllo).filter((x): x is NormalizedCall => !!x && x.startedAt >= since);
      if (!rows.length || !res?.pagination?.has_more) break;
    }
  },
  async details(c, id) {
    const res = (await http(`${API}/v2/api/conversations/items/${encodeURIComponent(id)}?extend=transcript`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    const m = res?.data ? mapAllo(res.data) : null;
    if (!m) return { hasDetail: true };
    const out: Partial<NormalizedCall> = { hasDetail: true };
    if (m.transcript?.length) out.transcript = m.transcript;
    if (m.summary) out.summary = m.summary;
    if (m.recordingUrl) out.recordingUrl = m.recordingUrl;
    if (m.company) out.company = m.company;
    if (m.jobTitle) out.jobTitle = m.jobTitle;
    return out;
  },
};
