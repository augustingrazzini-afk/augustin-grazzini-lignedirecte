import { http, num, Provider, NormalizedCall, ProviderError, str, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * « Mon outil » : n'importe quel outil d'appel qui a une API.
 * L'utilisateur donne l'adresse qui liste ses appels et sa clé ; Trustpipe trouve la liste dans la réponse
 * et reconnaît les champs usuels (date, durée, prospect, résumé, transcription, enregistrement…).
 */

const ARRAY_KEYS = ["data", "calls", "items", "results", "records", "rows", "list", "objects", "entries"];

/** Valeur à un chemin « a.b.c » (insensible à la casse). */
function at(o: any, path: string): unknown {
  let cur = o;
  for (const k of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    const key = Object.keys(cur).find((x) => x.toLowerCase() === k.toLowerCase());
    cur = key === undefined ? undefined : cur[key];
  }
  return cur;
}
const first = (o: any, paths: string[]) => {
  for (const p of paths) {
    const v = at(o, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/** Trouve le tableau d'appels dans une réponse JSON. */
export function findRows(res: any): any[] | null {
  if (Array.isArray(res)) return res;
  if (!res || typeof res !== "object") return null;
  for (const k of ARRAY_KEYS) { const v = at(res, k); if (Array.isArray(v)) return v; }
  for (const k of ARRAY_KEYS) { const v = at(res, k); if (v && typeof v === "object") { const r = findRows(v); if (r) return r; } }
  const arr = Object.values(res).find((v) => Array.isArray(v) && v.length && typeof v[0] === "object");
  return (arr as any[]) || null;
}

function transcriptOf(c: any): TranscriptLine[] {
  const t = first(c, ["transcript", "transcription", "transcript.utterances", "transcription.utterances", "utterances", "transcript.segments", "segments"]);
  if (typeof t === "string") return trimTranscript(t.split(/\n+/).map((l) => { const m = l.match(/^\s*(?:\[([\d:.]+)\]\s*)?([^:]{1,40}):\s*(.+)$/); return m ? { ts: m[1] || "", s: m[2].trim(), t: m[3] } : { ts: "", s: "", t: l.trim() }; }).filter((l) => l.t));
  if (Array.isArray(t)) return trimTranscript(t.map((u: any) => ({
    s: str(u?.speaker ?? u?.speaker_name ?? u?.participant ?? u?.role ?? ""),
    t: str(u?.text ?? u?.content ?? u?.sentence ?? ""),
    ts: (() => { const v = Number(u?.start ?? u?.start_time ?? u?.timestamp); if (!Number.isFinite(v)) return str(u?.timestamp).slice(0, 8); const s = Math.round(v > 1e5 ? v / 1000 : v); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; })(),
  })).filter((l) => l.t));
  return [];
}

export function mapCustom(c: any): NormalizedCall | null {
  const id = str(first(c, ["id", "call_id", "callId", "uuid", "uid", "_id"]));
  const startedAt = toDate(first(c, ["started_at", "start_time", "startedAt", "startTime", "start_date", "date", "created_at", "createdAt", "timestamp", "call_date"]));
  if (!id || !startedAt) return null;
  let dur = num(first(c, ["duration_seconds", "duration_sec", "durationSec", "duration", "length", "talk_time", "call_duration"]));
  if (dur > 36000) dur = Math.round(dur / 1000); // millisecondes
  const status = str(first(c, ["status", "outcome", "disposition", "result", "state"])).toLowerCase();
  const answered = first(c, ["answered", "connected", "is_answered", "picked_up"]);
  const failed = /miss|no.?answer|unanswer|busy|fail|voicemail|messagerie|cancel|rejet|refus|occup/.test(status);
  const connected = typeof answered === "boolean" ? answered : !failed && (/answer|connect|done|complet|décroch|decroch|meeting|rdv/.test(status) || dur >= 20);
  const meetingBooked = !!first(c, ["meeting_booked", "meetingBooked", "booked"]) || /meeting|rdv|rendez/.test(status);
  const dir = str(first(c, ["direction", "type"])).toLowerCase();
  let firstName = str(first(c, ["prospect.first_name", "contact.first_name", "contact.firstName", "lead.first_name", "first_name", "firstName"]));
  let lastName = str(first(c, ["prospect.last_name", "contact.last_name", "contact.lastName", "lead.last_name", "last_name", "lastName"]));
  if (!firstName && !lastName) {
    const full = str(first(c, ["contact.name", "prospect.name", "lead.name", "contact_name", "name", "callee_name", "to_name"]));
    if (full) { const p = full.split(/\s+/); firstName = p.shift() || ""; lastName = p.join(" "); }
  }
  return {
    externalId: id, startedAt, durationSec: dur, status: status || (connected ? "connected" : "no-answer"), connected, meetingBooked,
    direction: /in/.test(dir) && !/out/.test(dir) ? "inbound" : /out/.test(dir) ? "outbound" : undefined,
    firstName, lastName,
    company: str(first(c, ["prospect.company", "contact.company", "contact.company_name", "lead.company", "company", "company_name", "account.name"])),
    jobTitle: str(first(c, ["prospect.job_title", "contact.job_title", "contact.title", "job_title", "title"])),
    phone: str(first(c, ["to_number", "to", "phone", "phone_number", "number", "callee", "contact.phone"])),
    repName: str(first(c, ["user.name", "agent.name", "owner.name", "user_name", "agent", "rep", "caller_name", "user"])),
    listName: str(first(c, ["list.list_name", "list.name", "list_name", "campaign.name", "campaign", "list"])),
    summary: str(first(c, ["summary", "notes", "note", "comment", "description"])),
    transcript: transcriptOf(c),
    recordingUrl: (() => { const u = str(first(c, ["recording_url", "recordingUrl", "recording", "record_url", "record", "audio_url", "audio", "media_url", "public_call_link"])); return /^https:\/\//i.test(u) ? u : null; })(),
  };
}

const headersFor = (c: Record<string, string>) => {
  const h: Record<string, string> = { Accept: "application/json" };
  const name = str(c.header) || "Authorization";
  h[name] = /^authorization$/i.test(name) && !/^(bearer|basic|token)\s/i.test(c.apiKey) ? `Bearer ${c.apiKey}` : c.apiKey;
  return h;
};

function pageUrl(c: Record<string, string>, since: Date | null, cursor = "") {
  const u = new URL(c.url);
  if (since && c.sinceParam) u.searchParams.set(c.sinceParam, since.toISOString());
  if (cursor) u.searchParams.set(c.cursorParam || "cursor", cursor);
  return u.toString();
}

function nextOf(res: any, current: string): { url?: string; cursor?: string } {
  const link = first(res, ["next", "next_page_url", "links.next", "paging.next.link", "meta.next"]);
  if (typeof link === "string" && /^https:\/\//.test(link) && link !== current) return { url: link };
  const cur = first(res, ["next_cursor", "nextCursor", "cursor.next", "meta.next_cursor", "paging.next.after", "pagination.next_cursor"]);
  if (cur && (typeof cur === "string" || typeof cur === "number")) return { cursor: String(cur) };
  return {};
}

export const custom: Provider = {
  id: "custom",
  label: "Mon outil (clé API)",
  channels: ["call"],
  credentialFields: [
    { key: "url", label: "Adresse de l'API qui liste vos appels", type: "text", help: "Ex. : https://api.monoutil.com/v1/calls (voir la documentation API de votre outil)" },
    { key: "apiKey", label: "Clé API", type: "password" },
    { key: "header", label: "Nom de l'en-tête de la clé", optional: true, help: "Laissez vide pour « Authorization: Bearer … ». Sinon, ex. : X-API-Key" },
    { key: "sinceParam", label: "Paramètre de date de début", optional: true, help: "Ex. : start_date, from, since (pour ne récupérer que les nouveaux appels)" },
    { key: "detailUrl", label: "Adresse du détail d'un appel (pour la transcription)", optional: true, help: "Avec {id} à la place de l'identifiant, ex. : https://api.monoutil.com/v1/calls/{id}" },
  ],
  help: "N'importe quel outil d'appel qui a une API : collez l'adresse qui liste vos appels et votre clé, les champs sont reconnus automatiquement.",
  async test(c) {
    if (!/^https:\/\//i.test(str(c.url))) throw new ProviderError("L'adresse de l'API doit commencer par https://");
    const res = await http(pageUrl(c, null), { headers: headersFor(c), label: "Votre outil" });
    const rows = findRows(res);
    if (!rows) throw new ProviderError("Aucune liste d'appels trouvée dans la réponse de votre outil. Vérifiez l'adresse.");
    if (rows.length && !rows.some((r) => mapCustom(r))) throw new ProviderError("Les appels ont été trouvés, mais sans identifiant ou sans date reconnus. Écrivez-nous : on ajoute votre outil.");
  },
  async *list(c, since) {
    let url = pageUrl(c, since);
    for (let page = 0; page < 40; page++) {
      const res = (await http(url, { headers: headersFor(c), label: "Votre outil" })) as any;
      const rows = findRows(res) || [];
      const calls = rows.map(mapCustom).filter((x): x is NormalizedCall => !!x);
      yield calls.filter((x) => x.startedAt >= new Date(since.getTime() - 864e5));
      if (!rows.length || calls.every((x) => x.startedAt < since)) break;
      const n = nextOf(res, url);
      if (n.url) url = n.url; else if (n.cursor) url = pageUrl(c, since, n.cursor); else break;
    }
  },
  async details(c, id) {
    if (!c.detailUrl || !c.detailUrl.includes("{id}")) return null;
    const res = (await http(c.detailUrl.replace("{id}", encodeURIComponent(id)), { headers: headersFor(c), label: "Votre outil" })) as any;
    const d = res?.data && !Array.isArray(res.data) ? res.data : res;
    const m = mapCustom(d);
    return m ? { ...m, hasDetail: true } : null;
  },
};
