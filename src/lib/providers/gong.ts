import { http, Provider, NormalizedCall, ProviderError, str, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * Gong (enregistreur d'appels et de réunions) — API publique v2, authentification Basic base64(accessKey:accessKeySecret).
 * Doc officielle (spécification OpenAPI) : https://gong.app.gong.io/settings/api/documentation
 *   (spec brute : https://gong.app.gong.io/ajax/settings/api/documentation/specs?version=)
 * - URL de base propre à chaque compte (« Check here what's your base URL ») : https://app.gong.io/company/api-authentication ; par défaut https://api.gong.io
 * - curseur : champ `records.cursor` à renvoyer tel quel, les autres paramètres inchangés ; 404 = aucun appel sur la période
 * - appels + participants + résumé : POST /v2/calls/extensive (filter.fromDateTime, contentSelector.exposedFields.parties / content.brief),
 *   nécessaire car GET /v2/calls ne renvoie pas les participants (`parties`, `speakerId`)
 * - transcription : POST /v2/calls/transcript (filter.callIds) ; `speakerId` à croiser avec `parties[].speakerId`, `sentences[].start` en ms
 * - test : GET /v2/users
 * Limites : 3 requêtes/s, 10 000/jour.
 */
const LABEL = "Gong";
const DEFAULT_API = "https://api.gong.io";
const base = (c: Record<string, string>) => {
  const u = str(c.baseUrl).replace(/\/+$/, "") || DEFAULT_API;
  // La clé n'est envoyée qu'à un domaine Gong.
  if (!/^https:\/\/([a-z0-9-]+\.)*gong\.io$/i.test(u)) throw new ProviderError("URL de base Gong invalide (ex. https://us-12345.api.gong.io).");
  return u;
};
const headers = (c: Record<string, string>) => ({
  Authorization: `Basic ${Buffer.from(`${str(c.accessKey)}:${str(c.accessKeySecret)}`).toString("base64")}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});

const ts = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const is404 = (e: unknown) => e instanceof ProviderError && e.status === 404;

/** Monologues Gong → lignes {s,t,ts}, en nommant chaque intervenant via `parties[].speakerId`. */
export function gongTranscript(monologues: any[], parties: any[]): TranscriptLine[] {
  const names = new Map<string, string>();
  for (const p of parties || []) if (p?.speakerId) names.set(str(p.speakerId), str(p.name) || (str(p.affiliation) === "Internal" ? "Commercial" : "Prospect"));
  const order: string[] = [];
  const lines: TranscriptLine[] = [];
  for (const m of monologues || []) {
    const sid = str(m?.speakerId);
    if (!names.has(sid)) { if (!order.includes(sid)) order.push(sid); names.set(sid, `Intervenant ${order.length}`); }
    const s = names.get(sid)!;
    for (const sen of m?.sentences || []) {
      const text = str(sen?.text); if (!text) continue;
      const last = lines[lines.length - 1];
      if (last && last.s === s) last.t += " " + text; else lines.push({ s, t: text, ts: ts((Number(sen?.start) || 0) / 1000) });
    }
  }
  return trimTranscript(lines);
}

/** Une entrée `calls[]` de /v2/calls/extensive ({ metaData, parties, content }). */
export function mapGong(row: any): NormalizedCall | null {
  const md = row?.metaData || {};
  const id = str(md.id);
  const startedAt = toDate(md.started) || toDate(md.scheduled);
  if (!id || !startedAt) return null;
  const durationSec = Math.max(0, Math.round(Number(md.duration) || 0));
  const parties: any[] = Array.isArray(row?.parties) ? row.parties : [];
  const rep = parties.find((p) => md.primaryUserId && str(p?.userId) === str(md.primaryUserId)) || parties.find((p) => str(p?.affiliation) === "Internal");
  const prospect = parties.find((p) => str(p?.affiliation) === "External");
  const [firstName, ...rest] = str(prospect?.name).split(/\s+/).filter(Boolean);
  const direction = str(md.direction);
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: direction === "Inbound" ? "inbound" : direction === "Outbound" ? "outbound" : undefined,
    status: str(md.sdrDisposition) || (durationSec > 0 ? "recorded" : "unknown"),
    connected: durationSec > 0, // enregistreur : appel enregistré avec une durée = conversation
    meetingBooked: false,
    kind: direction === "Conference" || str(md.media) === "Video" ? "meeting" : "call",
    firstName: firstName || "",
    lastName: rest.join(" "),
    jobTitle: str(prospect?.title),
    contactRef: str(prospect?.id),
    phone: str(prospect?.phoneNumber),
    repName: str(rep?.name),
    listName: "Appels directs",
    campaign: str(md.title),
    summary: str(row?.content?.brief),
    recordingUrl: /^https:\/\//i.test(str(md.url)) ? str(md.url) : null, // page de l'appel dans Gong (l'audio signé expire au bout de 8 h)
  };
}

const SELECTOR = { exposedFields: { parties: true, content: { brief: true } } };

export const gong: Provider = {
  id: "gong",
  label: "Gong",
  channels: ["call"],
  credentialFields: [
    { key: "accessKey", label: "Access Key", type: "text", help: "Gong › Company Settings › Ecosystem › API › Create (réservé aux administrateurs techniques)" },
    { key: "accessKeySecret", label: "Access Key Secret", type: "password", help: "Affiché une seule fois à la création de la clé, sur la même page API de Gong" },
    { key: "baseUrl", label: "URL de base de l'API", type: "text", optional: true, help: "Indiquée sur la page API de Gong (ex. https://us-12345.api.gong.io). Laisser vide pour https://api.gong.io" },
  ],
  help: "Appels et réunions enregistrés, participants, résumés et transcriptions.",
  async test(c) {
    await http(`${base(c)}/v2/users`, { headers: headers(c), label: LABEL });
  },
  async *list(c, since) {
    let cursor = "";
    for (let page = 0; page < 200; page++) {
      const body: any = { filter: { fromDateTime: since.toISOString() }, contentSelector: SELECTOR };
      if (cursor) body.cursor = cursor;
      let res: any;
      try {
        res = await http(`${base(c)}/v2/calls/extensive`, { method: "POST", headers: headers(c), body: JSON.stringify(body), label: LABEL });
      } catch (e) {
        if (is404(e)) return; // « No calls found for the specified period »
        throw e;
      }
      const rows: any[] = res?.calls || [];
      yield rows.map(mapGong).filter((x): x is NormalizedCall => !!x);
      cursor = str(res?.records?.cursor);
      if (!rows.length || !cursor) break;
    }
  },
  async details(c, id) {
    const out: Partial<NormalizedCall> = { hasDetail: true };
    const filter = { callIds: [id] };
    const ext = (await http(`${base(c)}/v2/calls/extensive`, { method: "POST", headers: headers(c), body: JSON.stringify({ filter, contentSelector: SELECTOR }), label: LABEL }).catch(() => null)) as any;
    const row = ext?.calls?.[0];
    const t = (await http(`${base(c)}/v2/calls/transcript`, { method: "POST", headers: headers(c), body: JSON.stringify({ filter }), label: LABEL }).catch(() => null)) as any;
    const tr = (t?.callTranscripts || []).find((x: any) => str(x?.callId) === id);
    if (tr?.transcript?.length) out.transcript = gongTranscript(tr.transcript, row?.parties || []);
    if (row?.content?.brief) out.summary = str(row.content.brief);
    return out;
  },
};
