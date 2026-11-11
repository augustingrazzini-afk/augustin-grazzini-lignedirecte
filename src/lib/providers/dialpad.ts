import { http, Provider, NormalizedCall, str, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * Dialpad — API v2 https://dialpad.com/api/v2, clé API en « Authorization: Bearer <api_key> ».
 * Doc : https://developers.dialpad.com/llms.txt
 * - appels : GET /api/v2/call (filtre started_after en ms UTC, pagination par cursor ; uniquement les appels terminés)
 *   https://developers.dialpad.com/reference/calllist
 * - transcription Dialpad AI : GET /api/v2/transcripts/{call_id} https://developers.dialpad.com/reference/transcriptsget
 * - résumé Ai Recap : GET /api/v2/call/{id}/ai_recap (scope ai_recap, 12/min) https://developers.dialpad.com/reference/callget_ai_recap
 * - test : GET /api/v2/company https://developers.dialpad.com/reference/companyget
 * - enregistrements : recording_details[].url (https://dialpad.com/r/…), à lire avec la clé (scope recordings_export)
 *   https://developers.dialpad.com/docs/downloading-call-recordings
 * - états d'appel : https://developers.dialpad.com/docs/call-events
 */
const API = "https://dialpad.com/api/v2";
const LABEL = "Dialpad";
const headers = (c: Record<string, string>) => ({ Authorization: `Bearer ${c.apiKey}`, Accept: "application/json" });
// Seuls les enregistrements d'appel (/r/) et de messagerie (/v/) se lisent avec la clé ; les enregistrements admin sont réservés au navigateur.
const AUDIO = /^https:\/\/dialpad\.com\/(r|v)\//;

const ts = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
/** Dialpad met souvent le numéro à la place du nom : on ne garde qu'un vrai nom. */
const realName = (v: unknown) => { const n = str(v); return /\p{L}/u.test(n) ? n : ""; };
/** « 2018-05-08T21:33:19.300000 » (UTC, microsecondes) → ms. */
const lineMs = (v: unknown) => { const m = str(v).match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?/); return m ? Date.parse(`${m[1]}${(m[2] || "").slice(0, 4)}Z`) : NaN; };

export function mapDialpad(c: any): NormalizedCall | null {
  const id = str(c?.call_id);
  const startedAt = toDate(c?.date_started);
  if (!id || !startedAt) return null;
  const durationSec = Math.max(0, Math.round((Number(c?.duration) || 0) / 1000));
  const answered = toDate(c?.date_connected) != null;
  const connected = answered && durationSec > 0;
  const state = str(c?.state).toLowerCase();
  const name = realName(c?.contact?.name);
  const [firstName, ...rest] = name.split(/\s+/);
  const rec = (Array.isArray(c?.recording_details) ? c.recording_details : []).find((r: any) => str(r?.recording_type) === "callrecording" && AUDIO.test(str(r?.url)));
  const labels = (Array.isArray(c?.labels) ? c.labels : []).map(str).filter(Boolean);
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: str(c?.direction).toLowerCase() === "inbound" ? "inbound" : "outbound",
    status: state === "missed" || state === "voicemail_uploaded" ? state : answered ? "connected" : state || "unknown",
    connected,
    meetingBooked: false,
    firstName: firstName || "",
    lastName: rest.join(" "),
    contactRef: str(c?.contact?.id),
    phone: str(c?.external_number) || str(c?.contact?.phone),
    repName: str(c?.target?.type) === "user" ? str(c?.target?.name) : "",
    listName: "Appels directs",
    tags: labels.length ? labels : undefined,
    recordingUrl: rec ? str(rec.url) : null,
  };
}

/** Lignes Dialpad AI (type « transcript ») → répliques horodatées depuis le début de la conversation. */
export function dialpadTranscript(t: any): TranscriptLine[] {
  const rows = (Array.isArray(t?.lines) ? t.lines : [])
    .filter((l: any) => str(l?.type) === "transcript" && str(l?.content))
    .map((l: any) => ({ s: str(l?.name) || (l?.user_id ? "Commercial" : "Contact"), t: str(l.content), ms: lineMs(l?.time) }))
    .sort((a: any, b: any) => (a.ms || 0) - (b.ms || 0));
  const t0 = rows.find((r: any) => Number.isFinite(r.ms))?.ms ?? 0;
  const lines: TranscriptLine[] = [];
  for (const r of rows) {
    const last = lines[lines.length - 1];
    if (last && last.s === r.s) last.t += " " + r.t;
    else lines.push({ s: r.s, t: r.t, ts: ts(Number.isFinite(r.ms) ? (r.ms - t0) / 1000 : 0) });
  }
  return trimTranscript(lines);
}

export const dialpad: Provider = {
  id: "dialpad",
  label: "Dialpad",
  channels: ["call"],
  credentialFields: [{ key: "apiKey", label: "Clé API Dialpad", type: "password", help: "Clé API Dialpad de niveau entreprise (créée par un administrateur) pour voir les appels de toute l'équipe, avec les droits calls:list et recordings_export (ai_recap pour les résumés)" }],
  help: "Appels Dialpad terminés, transcriptions Dialpad AI, résumés Ai Recap et enregistrements.",
  async test(c) {
    await http(`${API}/company`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    let cursor = "";
    for (let page = 0; page < 500; page++) {
      const q = new URLSearchParams({ started_after: String(since.getTime()) });
      if (cursor) q.set("cursor", cursor);
      const res = (await http(`${API}/call?${q}`, { headers: headers(c), label: LABEL })) as any;
      const rows: any[] = Array.isArray(res?.items) ? res.items : [];
      yield rows.map(mapDialpad).filter((x): x is NormalizedCall => !!x);
      cursor = str(res?.cursor);
      if (!rows.length || !cursor) break;
    }
  },
  async details(c, id) {
    const out: Partial<NormalizedCall> = { hasDetail: true };
    const t = (await http(`${API}/transcripts/${encodeURIComponent(id)}`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    const lines = dialpadTranscript(t);
    if (lines.length) out.transcript = lines;
    const recap = (await http(`${API}/call/${encodeURIComponent(id)}/ai_recap`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    const summary = recap?.summary?.null_summary ? "" : str(recap?.summary?.content);
    const disposition = str(recap?.disposition?.content);
    const text = [summary, disposition && `Issue : ${disposition}`].filter(Boolean).join("\n");
    if (text) out.summary = text;
    return out;
  },
  /** Les enregistrements Dialpad se téléchargent avec la clé (via notre relais, voir /api/calls/[id]/audio). */
  async fetchAudio(c, url, range) {
    if (!AUDIO.test(url)) return null;
    return fetch(url, { headers: { Authorization: `Bearer ${c.apiKey}`, ...(range ? { Range: range } : {}) }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  },
};
