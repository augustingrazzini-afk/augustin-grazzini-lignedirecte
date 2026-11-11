import { http, num, Provider, NormalizedCall, str, toDate, stripHtml } from "./types";

/**
 * Apollo (dialer Apollo) — API https://api.apollo.io/api/v1, clé dans l'en-tête « x-api-key ».
 * Doc : https://docs.apollo.io/reference/authentication — https://docs.apollo.io/docs/create-api-key
 * Appels : GET /phone_calls/search (clé maître obligatoire, 0 crédit) — https://docs.apollo.io/reference/search-for-calls
 *   filtre date_range[min] / date_range[max] (AAAA-MM-JJ), pagination page/per_page, réponse { pagination, phone_calls, faceting }.
 *   Les libellés de disposition (phone_call_outcome_id) arrivent dans faceting.phone_call_stats_facets (value → display_name).
 * Commerciaux : GET /users/search — https://docs.apollo.io/reference/get-a-list-of-users
 * Pas de séquence sur un appel dans la doc, et les transcriptions (Conversations) coûtent des crédits : non importées.
 */
const API = "https://api.apollo.io/api/v1";
const LABEL = "Apollo";
const headers = (c: Record<string, string>) => ({ "x-api-key": c.apiKey, "Content-Type": "application/json", "Cache-Control": "no-cache", Accept: "application/json" });
const MEETING = /meeting|rendez|rdv|booked/i;
const day = (d: Date) => d.toISOString().slice(0, 10);

export function mapApollo(c: any, outcomes: Map<string, string> = new Map(), users: Map<string, string> = new Map()): NormalizedCall | null {
  const id = str(c?.id);
  const startedAt = toDate(c?.start_time);
  if (!id || !startedAt) return null;
  const ended = toDate(c?.end_time);
  const durationSec = c?.duration != null ? Math.max(0, Math.round(num(c.duration))) : ended ? Math.max(0, Math.round((ended.getTime() - startedAt.getTime()) / 1000)) : 0;
  const status = str(c?.status).toLowerCase();
  const inbound = c?.inbound === true;
  const outcome = outcomes.get(str(c?.phone_call_outcome_id)) || "";
  const connected = status === "completed" && !c?.voicemail_dropped && durationSec > 0 && !/voicemail|messagerie/i.test(outcome);
  const ct = c?.contact || {};
  const rec = str(c?.recording_url);
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: inbound ? "inbound" : "outbound",
    status: status || "unknown",
    connected,
    meetingBooked: MEETING.test(outcome),
    firstName: str(ct.first_name),
    lastName: str(ct.last_name),
    company: str(ct.organization_name),
    jobTitle: str(ct.title),
    contactRef: str(c?.contact_id) || str(ct.id),
    phone: inbound ? str(c?.from_number) : str(c?.to_number),
    repName: users.get(str(c?.user_id)) || "",
    listName: "Appels directs",
    tags: outcome ? [outcome] : [],
    summary: stripHtml(str(c?.note_text) || str(c?.note)),
    recordingUrl: /^https:\/\//.test(rec) ? rec : null,
  };
}

async function userNames(c: Record<string, string>) {
  const map = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const res = (await http(`${API}/users/search?page=${page}&per_page=100`, { headers: headers(c), label: LABEL })) as any;
    for (const u of res?.users || []) {
      if (!u?.id) continue;
      map.set(String(u.id), str(u.name) || [str(u.first_name), str(u.last_name)].filter(Boolean).join(" ") || str(u.email));
    }
    if (page >= Number(res?.pagination?.total_pages || 1)) break;
  }
  return map;
}

export const apollo: Provider = {
  id: "apollo",
  label: "Apollo",
  channels: ["call"],
  credentialFields: [{
    key: "apiKey", label: "Clé API Apollo (clé maître)", type: "password",
    help: "Apollo › Settings › Integrations › API Keys › Create new key, puis activez « Set as master key » : la recherche d'appels n'accepte que la clé maître.",
  }],
  help: "Appels passés et reçus avec le dialer Apollo : statut, durée, disposition, contact, commercial, note et enregistrement.",
  async test(c) {
    await http(`${API}/phone_calls/search?page=1&per_page=1`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    const users = await userNames(c).catch(() => new Map<string, string>());
    const outcomes = new Map<string, string>();
    const max = day(new Date(Date.now() + 86_400_000));
    const range = `date_range[min]=${day(since)}&date_range[max]=${max}`;
    for (let page = 1; page <= 100; page++) {
      const res = (await http(`${API}/phone_calls/search?${range}&page=${page}&per_page=100`, { headers: headers(c), label: LABEL })) as any;
      for (const f of res?.faceting?.phone_call_stats_facets || []) if (f?.value) outcomes.set(String(f.value), str(f.display_name));
      const rows: any[] = res?.phone_calls || [];
      yield rows.map((r) => mapApollo(r, outcomes, users)).filter((x): x is NormalizedCall => !!x);
      if (!rows.length || page >= Number(res?.pagination?.total_pages || 1)) break;
    }
  },
};
