import { callTool, listTools, type McpCreds, type McpTool } from "../mcp";
import { mapLemlist } from "./lemlist";
import { mapHubspot } from "./hubspot";
import { ProviderError, str, stripHtml, toDate, type NormalizedCall, type Provider } from "./types";

/**
 * Outils connectés « en un clic » (OAuth via leur serveur MCP, comme Minari) : les appels sont lus avec les outils
 * MCP de l'éditeur au lieu de son API à clé. lemlist a un format connu ; pour les autres, Trustpipe repère l'outil
 * qui liste les appels et lit les champs usuels (identifiant, date, durée, contact, résumé).
 */
const MAX_PAGES = 60;

/** L'outil MCP qui liste les appels : « list_calls », « search_calls », « get_call_activities »… */
export function pickCallTool(tools: McpTool[]): McpTool | null {
  const score = (t: McpTool) => {
    const n = t.name.toLowerCase();
    if (!/call/.test(n) || /(detail|transcript|recording|create|update|delete|start|make|place|dial|log_|schedule|webhook)/.test(n)) return 0;
    let s = 1;
    if (/(list|search|get|find|fetch)/.test(n)) s += 2;
    if (/calls|call_activities|activities/.test(n)) s += 2;
    const props = Object.keys(t.inputSchema?.properties || {}).join(" ").toLowerCase();
    if (/(date|from|since|after|start)/.test(props)) s += 1;
    if ((t.inputSchema?.required || []).some((r) => /id$/i.test(r))) s -= 3; // demande un identifiant précis : pas une liste
    return s;
  };
  const best = tools.map((t) => [t, score(t)] as const).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

const FROM = /^(date_?from|from(_?date)?|start_?date|since|after|created_?after|min_?date|started_?after|start_?time_?from|from_?date_?time|date_?start|start)$/i;
const TO = /^(date_?to|to(_?date)?|end_?date|until|before|created_?before|max_?date|started_?before|start_?time_?to|to_?date_?time|date_?end|end)$/i;
const LIMIT = /^(limit|per_?page|page_?size|count|max_?results)$/i;
const CURSOR = /^(cursor|next_?cursor|page_?token|starting_?after|after_?cursor)$/i;

/** Arguments de l'outil : période, taille de page, curseur ou numéro de page. */
export function callArgs(t: McpTool, since: Date, page: number, cursor: string | null): Record<string, unknown> {
  const props = t.inputSchema?.properties || {};
  const a: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(props)) {
    const day = /YYYY-MM-DD$|date only|format: ?date\b/i.test(str(def?.description)) || def?.format === "date";
    const iso = (d: Date) => (day ? d.toISOString().slice(0, 10) : d.toISOString());
    if (FROM.test(k)) a[k] = def?.type === "number" || def?.type === "integer" ? Math.floor(since.getTime() / 1000) : iso(since);
    else if (TO.test(k)) a[k] = def?.type === "number" || def?.type === "integer" ? Math.floor(Date.now() / 1000) : iso(new Date());
    else if (LIMIT.test(k)) a[k] = Math.min(100, Number(def?.maximum) || 100);
    else if (/^page$/i.test(k)) a[k] = page;
    else if (/^offset$/i.test(k)) a[k] = (page - 1) * 100;
    else if (CURSOR.test(k) && cursor) a[k] = cursor;
  }
  return a;
}

/** Première liste d'objets trouvée dans la réponse. */
export function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return res;
  for (const k of ["calls", "data", "results", "items", "records", "activities", "call_activities", "engagements"]) if (Array.isArray(res?.[k])) return res[k];
  for (const v of Object.values(res || {})) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as any[];
  for (const v of Object.values(res || {})) if (v && typeof v === "object" && !Array.isArray(v)) { const r = rowsOf(v); if (r.length) return r; }
  return [];
}

const nextCursor = (res: any): string | null =>
  str(res?.next_cursor || res?.nextCursor || res?.cursor?.next || res?.pagination?.next_cursor || res?.pagination?.nextCursor || res?.next_page_token || res?.nextPageToken || res?.paging?.next?.after) || null;

const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((x, p) => x?.[p], o); if (v != null && v !== "") return v; } return undefined; };

/** Appel au format Trustpipe, à partir des champs les plus courants des outils d'appel. */
export function mapGeneric(r: any): NormalizedCall | null {
  const id = str(pick(r, "id", "call_id", "callId", "activityId", "uuid", "sid"));
  const startedAt = toDate(pick(r, "started_at", "startedAt", "start_time", "startTime", "date", "created_at", "createdAt", "timestamp", "scheduled", "started"));
  if (!id || !startedAt) return null;
  let dur = Number(pick(r, "duration", "duration_sec", "durationSec", "duration_seconds", "durationSeconds", "talk_time", "length")) || 0;
  if (Number(pick(r, "duration_ms", "durationMs"))) dur = Number(pick(r, "duration_ms", "durationMs")) / 1000;
  const durationSec = Math.max(0, Math.round(dur));
  const status = str(pick(r, "disposition", "outcome", "status", "result", "callStatus", "call_status", "callAnswer")).toLowerCase();
  const missed = /(no.?answer|not.?answer|unanswer|voice.?mail|busy|missed|fail|cancel|reject)/.test(status);
  const connected = !missed && (/(answer|connect|complet|done|talk|conversation|interested|meeting)/.test(status) ? durationSec > 0 : durationSec >= 10);
  const who = pick(r, "contact", "lead", "prospect", "person", "to", "callee") || {};
  const full = str(pick(who, "name", "full_name", "fullName") || pick(r, "contact_name", "contactName", "lead_name"));
  const [fn = "", ...ln] = full.split(/\s+/);
  const rep = pick(r, "user", "owner", "rep", "agent", "caller") || {};
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: /in/i.test(str(pick(r, "direction", "type"))) && !/out/i.test(str(pick(r, "direction"))) ? "inbound" : "outbound",
    status: status || (connected ? "connected" : "no-answer"),
    connected,
    meetingBooked: /(meeting|rdv|rendez|booked|appointment)/.test(status),
    firstName: str(pick(who, "first_name", "firstName")) || fn,
    lastName: str(pick(who, "last_name", "lastName")) || ln.join(" "),
    company: str(pick(who, "company", "company_name", "companyName", "organization_name", "account.name") || pick(r, "company", "company_name", "account_name")),
    jobTitle: str(pick(who, "title", "job_title", "jobTitle")),
    contactRef: str(pick(who, "id") || pick(r, "contact_id", "contactId", "lead_id", "leadId")),
    phone: str(pick(who, "phone", "phone_number", "number") || pick(r, "phone", "phone_number", "to_number", "number", "remote_number")),
    email: str(pick(who, "email") || pick(r, "email")) || undefined,
    repName: typeof rep === "string" ? rep : str(pick(rep, "name", "full_name", "email") || pick(r, "user_name", "userName", "rep_name", "agent_name")),
    listName: str(pick(r, "list_name", "listName", "campaign_name", "campaignName", "cadence_name", "sequence_name")),
    summary: stripHtml(str(pick(r, "summary", "ai_summary", "transcriptSummary", "note", "notes", "description"))),
  };
}

/** Vérifie la connexion : la session MCP s'ouvre et l'outil propose bien une liste d'appels. */
const HS_PROPS = ["hs_call_title", "hs_call_body", "hs_call_duration", "hs_call_disposition", "hs_call_direction", "hs_timestamp", "hs_call_recording_url", "hs_call_status", "hubspot_owner_id"];
const hsArgs = (since: Date, offset?: number) => ({
  objectType: "CALL", limit: 100, properties: HS_PROPS, ...(offset ? { offset } : {}),
  filterGroups: [{ filters: [{ propertyName: "hs_timestamp", operator: "GTE", value: String(since.getTime()) }] }],
  sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
  chatInsights: { userIntent: "Synchronisation des appels vers Trustpipe", satisfaction: "NEUTRAL" },
});

async function test(id: string, label: string, c: McpCreds) {
  if (id === "lemlist") { await callTool(c, label, "get_call_activities", { limit: 1 }); return; }
  if (id === "hubspot") { await callTool(c, label, "search_crm_objects", { ...hsArgs(new Date(Date.now() - 864e5)), limit: 1 }); return; }
  const tools = await listTools(c, label);
  if (!pickCallTool(tools)) throw new ProviderError(`${label} est bien connecté, mais son accès en un clic ne donne pas encore la liste des appels. Utilisez une clé API pour l'instant.`);
}

async function* list(id: string, label: string, c: McpCreds, since: Date): AsyncGenerator<NormalizedCall[]> {
  if (id === "lemlist") {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await callTool(c, label, "get_call_activities", { dateFrom: since.toISOString(), limit: 100, page });
      const rows = rowsOf(res);
      yield rows.map((a) => mapLemlist({ ...a, transcriptSummary: a?.transcriptSummary })).filter((x): x is NormalizedCall => !!x);
      if (rows.length < 100 || page >= Number(res?.pagination?.totalPages || page)) break;
    }
    return;
  }
  if (id === "hubspot") {
    let offset: number | undefined;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await callTool(c, label, "search_crm_objects", hsArgs(since, offset));
      const rows = rowsOf(res);
      yield rows.map(mapHubspot);
      offset = Number(res?.offset || res?.paging?.next?.after) || undefined;
      if (rows.length < 100 || !offset) break;
    }
    return;
  }
  const tool = pickCallTool(await listTools(c, label));
  if (!tool) throw new ProviderError(`${label} : liste des appels indisponible en un clic. Utilisez une clé API.`);
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await callTool(c, label, tool.name, callArgs(tool, since, page, cursor));
    const rows = rowsOf(res);
    const out = rows.map(mapGeneric).filter((x): x is NormalizedCall => !!x && x.startedAt >= since && !seen.has(x.externalId));
    out.forEach((x) => seen.add(x.externalId));
    yield out;
    cursor = nextCursor(res);
    const paged = cursor || Object.keys(tool.inputSchema?.properties || {}).some((k) => /^(page|offset)$/i.test(k));
    if (!rows.length || !out.length || !paged) break;
  }
}

/** Même outil, mais lu par son serveur MCP quand il a été connecté en un clic (jeton OAuth au lieu d'une clé). */
export function withOneClick(p: Provider): Provider {
  return {
    ...p,
    test: (c) => (c.accessToken ? test(p.id, p.label, c as McpCreds) : p.test(c)),
    list: (c, since) => (c.accessToken ? list(p.id, p.label, c as McpCreds, since) : p.list!(c, since)),
    details: p.details ? (c, ext) => (c.accessToken ? Promise.resolve(null) : p.details!(c, ext)) : undefined,
    fetchAudio: p.fetchAudio ? (c, url, range, ext) => (c.accessToken ? Promise.resolve(null) : p.fetchAudio!(c, url, range, ext)) : undefined,
  };
}
