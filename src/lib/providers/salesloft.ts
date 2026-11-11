import { http, num, Provider, NormalizedCall, str, toDate, stripHtml } from "./types";

/**
 * Salesloft (cadences + dialer) — API https://api.salesloft.com, clé API « Bearer ak_… ».
 * Doc : https://developers.salesloft.com/docs/platform/api-basics/api-key-authentication/
 *       https://developers.salesloft.com/docs/platform/api-basics/filtering-paging-sorting/
 *       https://developers.salesloft.com/docs/platform/api-basics/request-response-format/ (réponses { data, metadata.paging })
 *       https://developers.salesloft.com/docs/platform/api-basics/rate-limits/ (pages > 100 surtaxées : curseur sur updated_at)
 * Appels : GET /v2/activities/calls (scope calls:read) — https://developers.salesloft.com/docs/api/activities-calls-index/
 *   filtre updated_at[gt], tri sort_by=updated_at / sort_direction=ASC, pagination page/per_page (≤ 100).
 * Compléments : GET /v2/people?ids[]= (people:read) — https://developers.salesloft.com/docs/api/people-index/
 *   GET /v2/users (team:read) — https://developers.salesloft.com/docs/api/users-index/
 *   GET /v2/cadences (cadences:read) — https://developers.salesloft.com/docs/api/cadences-index/
 *   GET /v2/notes?ids[]= (notes:read) — https://developers.salesloft.com/docs/api/notes-index/
 * Les transcriptions Salesloft (Conversations, scope conversations:read) ne sont pas reliées à un appel dans la doc : non importées.
 */
const API = "https://api.salesloft.com";
const LABEL = "Salesloft";
const headers = (c: Record<string, string>) => ({ Authorization: `Bearer ${c.apiKey}`, Accept: "application/json" });
const MEETING = /meeting|demo scheduled|rendez|rdv|booked/i;

export type SalesloftLookups = {
  people?: Map<string, any>;
  users?: Map<string, string>;
  cadences?: Map<string, string>;
  notes?: Map<string, string>;
};

export function mapSalesloft(c: any, lk: SalesloftLookups = {}): NormalizedCall | null {
  const id = str(c?.id);
  const startedAt = toDate(c?.created_at) || toDate(c?.updated_at);
  if (!id || !startedAt) return null;
  const durationSec = Math.max(0, Math.round(num(c?.duration)));
  const disposition = str(c?.disposition);
  const sentiment = str(c?.sentiment);
  const connected = (c?.connected === true || /^connected/i.test(disposition)) && durationSec > 0;
  const personId = str(c?.called_person?.id);
  const p = personId ? lk.people?.get(personId) : null;
  const cadence = str(c?.cadence?.id);
  const noteId = str(c?.note?.id);
  const rec = (Array.isArray(c?.recordings) ? c.recordings : []).find((r: any) => /^https:\/\//.test(str(r?.url)) && (!r?.recording_status || r.recording_status === "completed"));
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: str(c?.direction) === "inbound" ? "inbound" : "outbound",
    status: (disposition || (connected ? "connected" : "unknown")).toLowerCase(),
    connected,
    meetingBooked: MEETING.test(sentiment) || MEETING.test(disposition),
    firstName: str(p?.first_name),
    lastName: str(p?.last_name),
    company: str(p?.person_company_name),
    jobTitle: str(p?.title),
    contactRef: personId,
    phone: str(c?.to) || str(p?.phone) || str(p?.mobile_phone),
    repName: lk.users?.get(str(c?.user?.id)) || "",
    listName: cadence ? lk.cadences?.get(cadence) || "Cadence Salesloft" : "Appels directs",
    campaign: cadence,
    tags: [disposition, sentiment].filter(Boolean),
    summary: noteId ? stripHtml(lk.notes?.get(noteId)) : "",
    recordingUrl: rec ? str(rec.url) : null,
  };
}

/** Parcourt une liste paginée Salesloft ({ data, metadata.paging.next_page }). */
async function allPages(c: Record<string, string>, path: string, max = 20) {
  const out: any[] = [];
  for (let page = 1; page <= max; page++) {
    const res = (await http(`${API}${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, { headers: headers(c), label: LABEL })) as any;
    out.push(...(res?.data || []));
    if (!res?.metadata?.paging?.next_page) break;
  }
  return out;
}

async function nameMap(c: Record<string, string>, path: string) {
  const map = new Map<string, string>();
  for (const r of await allPages(c, path)) if (r?.id != null) map.set(String(r.id), str(r.name));
  return map;
}

async function byIds(c: Record<string, string>, path: string, ids: string[]) {
  const map = new Map<string, any>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const q = uniq.slice(i, i + 100).map((x) => `ids[]=${encodeURIComponent(x)}`).join("&");
    const res = (await http(`${API}${path}?per_page=100&${q}`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
    for (const r of res?.data || []) if (r?.id != null) map.set(String(r.id), r);
  }
  return map;
}

export const salesloft: Provider = {
  id: "salesloft",
  label: "Salesloft",
  channels: ["call"],
  credentialFields: [{
    key: "apiKey", label: "Clé API Salesloft", type: "password",
    help: "Salesloft › Your Applications › API Keys › Create New (clé « ak_… »). Cochez les scopes calls:read, people:read, team:read, cadences:read et notes:read.",
  }],
  help: "Appels journalisés (dialer Salesloft ou téléphone externe) : disposition, sentiment, durée, contact, commercial, cadence, note et enregistrement. Chaque cadence Salesloft peut être rangée chez un client.",
  async test(c) {
    await http(`${API}/v2/activities/calls?per_page=1`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    const [users, cadences] = await Promise.all([
      nameMap(c, "/v2/users").catch(() => new Map<string, string>()),
      nameMap(c, "/v2/cadences").catch(() => new Map<string, string>()),
    ]);
    const filter = `updated_at[gt]=${encodeURIComponent(since.toISOString())}&sort_by=updated_at&sort_direction=ASC`;
    for (let page = 1; page <= 100; page++) {
      const res = (await http(`${API}/v2/activities/calls?${filter}&per_page=100&page=${page}`, { headers: headers(c), label: LABEL })) as any;
      const rows: any[] = res?.data || [];
      const [people, notesRaw] = await Promise.all([
        byIds(c, "/v2/people", rows.map((r) => str(r?.called_person?.id))),
        byIds(c, "/v2/notes", rows.map((r) => str(r?.note?.id))),
      ]);
      const notes = new Map<string, string>([...notesRaw].map(([k, v]) => [k, str(v?.content)]));
      yield rows.map((r) => mapSalesloft(r, { people, users, cadences, notes })).filter((x): x is NormalizedCall => !!x);
      if (!rows.length || !res?.metadata?.paging?.next_page) break;
    }
  },
};
