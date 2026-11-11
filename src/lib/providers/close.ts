import { http, Provider, NormalizedCall, str, toDate, stripHtml, trimTranscript, type TranscriptLine } from "./types";

/**
 * Close (CRM) — API https://api.close.com/api/v1, clé API en authentification Basic (clé = identifiant, mot de passe vide).
 * Doc : https://developer.close.com/llms.txt
 * - authentification : https://developer.close.com/api/overview/api-key-authentication
 * - appels : GET /activity/call/ (filtre date_created__gte, pagination _skip/_limit + has_more)
 *   https://developer.close.com/api/resources/activities/calls/list — https://developer.close.com/api/overview/pagination
 * - transcription / résumé : champs recording_transcript (utterances, summary_text) chargés via _fields
 *   https://developer.close.com/api/resources/activities/calls — https://developer.close.com/api/resources/activities/calls/get
 * - contact : GET /contact/{id}/ ; lead : GET /lead/{id}/ ; Smart Views : GET /saved_search/ ; issues : GET /outcome/
 * - test : GET /me/ https://developer.close.com/api/resources/users/get-me
 */
const API = "https://api.close.com/api/v1";
const LABEL = "Close";
const headers = (c: Record<string, string>) => ({ Authorization: `Basic ${btoa(`${c.apiKey}:`)}`, Accept: "application/json" });
const AUDIO = /^https:\/\/api\.close\.com\//;

const ts = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export type CloseRefs = {
  outcomes?: Map<string, string>; // outcome_id → nom
  views?: Map<string, string>; // dialer_saved_search_id → nom de la Smart View
  contacts?: Map<string, { name: string; title: string }>;
  leads?: Map<string, string>; // lead_id → display_name
};

export function mapClose(c: any, refs: CloseRefs = {}): NormalizedCall | null {
  const id = str(c?.id);
  const startedAt = toDate(c?.activity_at) || toDate(c?.date_created);
  if (!id || !startedAt) return null;
  const durationSec = Math.max(0, Math.round(Number(c?.duration) || 0));
  const disposition = str(c?.disposition).toLowerCase();
  const connected = disposition === "answered" && durationSec > 0;
  const contact = refs.contacts?.get(str(c?.contact_id));
  const [firstName, ...rest] = str(contact?.name).split(/\s+/);
  const view = str(c?.dialer_saved_search_id);
  const seq = str(c?.sequence_name);
  const outcome = refs.outcomes?.get(str(c?.outcome_id)) || "";
  const note = str(c?.note) || stripHtml(c?.note_html);
  const rec = str(c?.recording_url);
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: str(c?.direction).toLowerCase() === "inbound" ? "inbound" : "outbound",
    status: disposition || str(c?.status).toLowerCase() || "unknown",
    connected,
    meetingBooked: false,
    firstName: firstName || "",
    lastName: rest.join(" "),
    company: refs.leads?.get(str(c?.lead_id)) || "",
    jobTitle: contact?.title || "",
    contactRef: str(c?.contact_id) || str(c?.lead_id),
    phone: str(c?.remote_phone) || str(c?.phone),
    repName: str(c?.user_name),
    listName: view ? refs.views?.get(view) || "Smart View Close" : seq || "Appels directs",
    campaign: view || str(c?.sequence_id),
    tags: outcome ? [outcome] : undefined,
    summary: [outcome && `Issue : ${outcome}`, note].filter(Boolean).join("\n"),
    recordingUrl: rec.startsWith("https://") ? rec : null,
  };
}

/** recording_transcript.utterances → répliques horodatées (fusion des répliques consécutives). */
export function closeTranscript(t: any): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const u of Array.isArray(t?.utterances) ? t.utterances : []) {
    const text = str(u?.text); if (!text) continue;
    const s = str(u?.speaker_label) || (str(u?.speaker_side) === "close-user" ? "Commercial" : "Contact");
    const last = lines[lines.length - 1];
    if (last && last.s === s) last.t += " " + text; else lines.push({ s, t: text, ts: ts(Number(u?.start) || 0) });
  }
  return trimTranscript(lines);
}

async function names(c: Record<string, string>, path: string) {
  const map = new Map<string, string>();
  for (let skip = 0; skip < 2000; skip += 100) {
    const res = (await http(`${API}${path}${path.includes("?") ? "&" : "?"}_skip=${skip}&_limit=100`, { headers: headers(c), label: LABEL })) as any;
    for (const o of res?.data || []) if (o?.id) map.set(String(o.id), str(o.name));
    if (!res?.has_more) break;
  }
  return map;
}

export const close: Provider = {
  id: "close",
  label: "Close",
  channels: ["call"],
  credentialFields: [{ key: "apiKey", label: "Clé API Close", type: "password", help: "Close › Settings › Developer › API Keys" }],
  help: "Appels Close (appels directs, power et predictive dialer), notes, issues, transcriptions et résumés d'appel. Chaque Smart View du dialer peut être rangée chez un client.",
  async test(c) {
    await http(`${API}/me/?_fields=id`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    const refs: Required<CloseRefs> = {
      outcomes: await names(c, "/outcome/").catch(() => new Map<string, string>()),
      views: await names(c, "/saved_search/?type__in=lead,contact").catch(() => new Map<string, string>()),
      contacts: new Map(),
      leads: new Map(),
    };
    const after = encodeURIComponent(since.toISOString());
    for (let skip = 0; skip < 35_000; skip += 100) {
      const res = (await http(`${API}/activity/call/?date_created__gte=${after}&_skip=${skip}&_limit=100`, { headers: headers(c), label: LABEL })) as any;
      const rows: any[] = res?.data || [];
      for (const r of rows) {
        const cid = str(r?.contact_id), lid = str(r?.lead_id);
        if (cid && !refs.contacts.has(cid)) {
          const ct = (await http(`${API}/contact/${encodeURIComponent(cid)}/?_fields=id,name,title`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
          refs.contacts.set(cid, { name: str(ct?.name), title: str(ct?.title) });
        }
        if (lid && !refs.leads.has(lid)) {
          const ld = (await http(`${API}/lead/${encodeURIComponent(lid)}/?_fields=id,display_name`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
          refs.leads.set(lid, str(ld?.display_name));
        }
      }
      yield rows.map((r) => mapClose(r, refs)).filter((x): x is NormalizedCall => !!x);
      if (!rows.length || !res?.has_more) break;
    }
  },
  async details(c, id) {
    const out: Partial<NormalizedCall> = { hasDetail: true };
    const call = (await http(`${API}/activity/call/${encodeURIComponent(id)}/?_fields=id,note,outcome_id,recording_transcript`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    const t = call?.recording_transcript;
    const lines = closeTranscript(t);
    if (lines.length) out.transcript = lines;
    const sum = str(t?.summary_text) || stripHtml(t?.summary_html);
    if (sum) {
      const oid = str(call?.outcome_id);
      const oc = oid ? ((await http(`${API}/outcome/${encodeURIComponent(oid)}/?_fields=id,name`, { headers: headers(c), label: LABEL }).catch(() => null)) as any) : null;
      out.summary = [str(oc?.name) && `Issue : ${str(oc.name)}`, str(call?.note), sum].filter(Boolean).join("\n");
    }
    return out;
  },
  /** Enregistrement hébergé par l'API Close : lu avec la clé (via notre relais, voir /api/calls/[id]/audio). */
  async fetchAudio(c, url, range) {
    if (!AUDIO.test(url)) return null;
    return fetch(url, { headers: { Authorization: headers(c).Authorization, ...(range ? { Range: range } : {}) }, signal: AbortSignal.timeout(60_000) });
  },
};
