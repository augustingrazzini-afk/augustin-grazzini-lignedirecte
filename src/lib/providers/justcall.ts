import { http, num, Provider, NormalizedCall, str, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * JustCall (téléphonie + Sales Dialer) — API REST v2.1 https://api.justcall.io, en-tête « Authorization: api_key:api_secret ».
 * Doc : https://developer.justcall.io/reference/authentication
 * Appels : GET /v2.1/calls (https://developer.justcall.io/reference/call_list_v21), réponse { data, next_page_link },
 * filtre from_datetime (fuseau de l'utilisateur), tri sort=datetime&order=desc, per_page ≤ 100, fetch_ai_data=true.
 * Appels du Sales Dialer : GET /v2.1/sales_dialer/calls (https://developer.justcall.io/reference/sales_dialer_call_list_v21), avec la campagne.
 * IA (résumé, transcription) : GET /v2.1/calls_ai/{id}?platform=justcall|sales_dialer&fetch_transcription=true
 * (https://developer.justcall.io/reference/call_ai_get_v21).
 * Enregistrement : GET /v2.1/calls/{id}/recording/download (https://developer.justcall.io/reference/call_recording_download_v21), protégé par la clé.
 * Historique accessible par l'API : 3 derniers mois.
 */
const API = "https://api.justcall.io";
const LABEL = "JustCall";
const PER_PAGE = 100;
const SD = "sd-"; // préfixe des appels du Sales Dialer (identifiants distincts des appels JustCall)
const headers = (c: Record<string, string>) => ({ Authorization: `${str(c.apiKey)}:${str(c.apiSecret)}`, Accept: "application/json" });

const ts = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const pad = (n: number) => String(n).padStart(2, "0");
const isHttps = (u: unknown) => /^https:\/\//i.test(str(u));
const MEETING = /meeting|rdv|rendez|d[ée]mo.*(book|pris|cal)|booked/i;

/** call_date + call_time sont en UTC (« 2017-12-18 », « 13:55:43 »). */
function utc(date: unknown, time: unknown): Date | null {
  const d = str(date), t = str(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  return toDate(m ? `${d}T${pad(Number(m[1]))}:${m[2]}:${m[3] || "00"}Z` : `${d}T00:00:00Z`);
}

function splitName(n: unknown) {
  const s = str(n);
  const i = s.indexOf(" ");
  return i < 0 ? { firstName: s, lastName: "" } : { firstName: s.slice(0, i), lastName: s.slice(i + 1).trim() };
}

const notes = (...xs: unknown[]) => xs.map(str).filter(Boolean).join("\n");

/** Un appel de GET /v2.1/calls (téléphonie JustCall). */
export function mapJustcall(c: any): NormalizedCall | null {
  const id = str(c?.id);
  const startedAt = utc(c?.call_date, c?.call_time);
  if (!id || !startedAt) return null;
  const info = c?.call_info || {};
  const dur = c?.call_duration || {};
  const durationSec = Math.max(0, Math.round(num(dur.conversation_time ?? dur.total_duration)));
  const type = str(info.type);
  const disposition = str(info.disposition);
  const ai = c?.justcall_ai || {};
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: /^in/i.test(str(info.direction)) ? "inbound" : "outbound",
    status: type.toLowerCase() || "unknown",
    connected: /^answered$/i.test(type) && durationSec > 0,
    meetingBooked: MEETING.test(disposition),
    ...splitName(c?.contact_name),
    phone: str(c?.contact_number),
    repName: str(c?.agent_name),
    listName: str(c?.justcall_line_name) || "Appels directs",
    tags: [disposition, ...(Array.isArray(ai.tags) ? ai.tags.map(str) : [])].filter(Boolean),
    summary: notes(info.notes, ai.call_summary),
    recordingUrl: isHttps(info.recording) ? `${API}/v2.1/calls/${encodeURIComponent(id)}/recording/download` : null,
  };
}

/** Un appel de GET /v2.1/sales_dialer/calls (campagnes du Sales Dialer). */
export function mapJustcallSalesDialer(c: any): NormalizedCall | null {
  const id = str(c?.call_id);
  const startedAt = utc(c?.call_date, c?.call_time);
  if (!id || !startedAt) return null;
  const info = c?.call_info || {};
  const durationSec = Math.max(0, Math.round(num(info.duration)));
  const type = str(info.type);
  const disposition = str(info.disposition);
  const ai = c?.justcall_ai || {};
  const camp = c?.campaign || {};
  return {
    externalId: SD + id,
    startedAt,
    durationSec,
    direction: /^in/i.test(str(info.direction)) ? "inbound" : "outbound",
    status: type.toLowerCase() || "unknown",
    connected: /^connected$/i.test(type) && durationSec > 0,
    meetingBooked: MEETING.test(disposition),
    ...splitName(c?.contact_name),
    contactRef: str(c?.contact_id),
    phone: str(c?.contact_number),
    repName: str(c?.agent_name),
    listName: str(camp.name) || "Appels directs",
    campaign: str(camp.id),
    tags: [disposition, ...(Array.isArray(ai.tags) ? ai.tags.map(str) : [])].filter(Boolean),
    summary: notes(info.notes, ai.call_summary),
    recordingUrl: isHttps(info.recording) ? str(info.recording) : null,
  };
}

/** from_datetime est lu dans le fuseau de l'utilisateur JustCall : on recule de 14 h pour couvrir tous les fuseaux. */
function fromDatetime(since: Date) {
  const d = new Date(since.getTime() - 14 * 3600e3);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function* pages(c: Record<string, string>, path: string, since: Date) {
  const q = new URLSearchParams({ from_datetime: fromDatetime(since), sort: "datetime", order: "desc", per_page: String(PER_PAGE), fetch_ai_data: "true" });
  let url: string | null = `${API}${path}?${q}`;
  for (let i = 0; url && i < 500; i++) {
    const res = (await http(url, { headers: headers(c), label: LABEL })) as any;
    const rows: any[] = Array.isArray(res?.data) ? res.data : [];
    yield rows;
    const next = str(res?.next_page_link);
    url = rows.length >= PER_PAGE && next.startsWith(`${API}/`) ? next : null;
  }
}

export const justcall: Provider = {
  id: "justcall",
  label: "JustCall",
  channels: ["call"],
  credentialFields: [
    { key: "apiKey", label: "Clé API JustCall", type: "text", help: "JustCall › icône de profil › APIs and Webhooks (app.justcall.io/app/developersApiCredentials) › API Key. Formule Team ou supérieure." },
    { key: "apiSecret", label: "Secret API JustCall", type: "password", help: "Même page JustCall (APIs and Webhooks) › API Secret, à copier avec le bouton à côté du champ." },
  ],
  help: "Appels JustCall et campagnes du Sales Dialer (3 derniers mois), résumés et transcriptions JustCall AI, enregistrements. Chaque ligne ou campagne peut être rangée chez un client.",
  async test(c) {
    await http(`${API}/v2.1/calls?per_page=1`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    for await (const rows of pages(c, "/v2.1/calls", since)) {
      yield rows.map(mapJustcall).filter((x): x is NormalizedCall => !!x);
    }
    // Sales Dialer : produit à part, pas toujours souscrit — on l'ignore s'il est refusé.
    try {
      for await (const rows of pages(c, "/v2.1/sales_dialer/calls", since)) {
        yield rows.map(mapJustcallSalesDialer).filter((x): x is NormalizedCall => !!x);
      }
    } catch (e: any) {
      if (![400, 401, 403, 404].includes(Number(e?.status))) throw e;
    }
  },
  async details(c, externalId) {
    const sd = externalId.startsWith(SD);
    const id = sd ? externalId.slice(SD.length) : externalId;
    const q = new URLSearchParams({ platform: sd ? "sales_dialer" : "justcall", fetch_transcription: "true", fetch_summary: "false", fetch_ai_insights: "false", fetch_smart_chapters: "false", fetch_action_items: "false" });
    const res = (await http(`${API}/v2.1/calls_ai/${encodeURIComponent(id)}?${q}`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    const ai = res?.data && !Array.isArray(res.data) ? res.data : res;
    const out: Partial<NormalizedCall> = { hasDetail: true };
    if (!ai) return out;
    if (Array.isArray(ai.call_transcription)) {
      const lines: TranscriptLine[] = [];
      for (const u of ai.call_transcription) {
        const text = str(u?.sentence); if (!text) continue;
        const s = str(u?.speaker_name) || `Intervenant ${str(u?.speaker_id) || "?"}`;
        const last = lines[lines.length - 1];
        if (last && last.s === s) last.t += " " + text; else lines.push({ s, t: text, ts: ts(num(u?.timestamp?.starttime)) });
      }
      if (lines.length) out.transcript = trimTranscript(lines);
    }
    // Le résumé JustCall AI arrive déjà avec la liste (fetch_ai_data) ; on ne garde ici que la transcription.
    return out;
  },
  /** L'enregistrement se télécharge avec la clé (GET /v2.1/calls/{id}/recording/download) : relayé par /api/calls/[id]/audio. */
  async fetchAudio(c, url, range) {
    if (/^https:\/\/api\.justcall\.io\//.test(url)) {
      return fetch(url, { headers: { ...headers(c), Accept: "*/*", ...(range ? { Range: range } : {}) }, signal: AbortSignal.timeout(60_000) });
    }
    // Lien d'enregistrement du Sales Dialer (hébergé par JustCall) : lu tel quel, sans la clé.
    if (/^https:\/\/(([a-z0-9-]+\.)*justcall\.io|jc-recordings\.s3\.amazonaws\.com)\//i.test(url)) {
      return fetch(url, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(60_000) });
    }
    return null;
  },
};
