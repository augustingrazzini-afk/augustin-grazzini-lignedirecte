import { http, Provider, NormalizedCall, ProviderError, str, stripHtml, toDate, trimTranscript, type TranscriptLine } from "./types";

/**
 * lemlist (dialer intégré) — API https://api.lemlist.com/api, authentification Basic « :clé » (identifiant vide).
 * Doc : https://developer.lemlist.com/api-reference — appels : GET /activities?version=v2&type=aircallEnded
 * (pagination offset/limit 100, filtre minDate), un appel par activité avec durée, réponse (callAnswer),
 * statut (callStatus), enregistrement (recording.url) et transcription (lien JSON signé, valable 24 h).
 * Seuls les appels sont repris : ni emails ni LinkedIn.
 */
const API = "https://api.lemlist.com/api";
const LABEL = "lemlist";
const headers = (c: Record<string, string>) => ({ Authorization: "Basic " + Buffer.from(`:${c.apiKey}`).toString("base64"), Accept: "application/json" });
const CALL_TYPE = "aircallEnded"; // nom historique : c'est l'appel terminé du dialer lemlist (et d'Aircall / Ringover reliés)

const ts = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** Transcription lemlist : { utterances: [{ start (ms), text, channel 0 = commercial, 1 = prospect }] }. */
export function lemlistTranscript(j: any, rep = "Commercial"): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const u of j?.utterances || []) {
    const text = str(u?.text).trim();
    if (!text) continue;
    const s = Number(u?.channel) === 1 ? "Prospect" : rep;
    const last = lines[lines.length - 1];
    if (last && last.s === s) last.t += " " + text; else lines.push({ s, t: text, ts: ts(Number(u?.start) || 0) });
  }
  return trimTranscript(lines);
}

/** Adresse stable pour relire l'enregistrement (le lien signé de lemlist expire au bout de 24 h). */
const audioRef = (id: string, at: Date) => {
  const q = new URLSearchParams({ version: "v2", type: CALL_TYPE, minDate: new Date(at.getTime() - 1000).toISOString(), maxDate: new Date(at.getTime() + 1000).toISOString(), limit: "100" });
  return `${API}/activities?${q}#${id}`;
};

export function mapLemlist(a: any): NormalizedCall | null {
  const id = str(a?._id || a?.id || a?.activityId);
  const startedAt = toDate(a?.startedAt) || toDate(a?.createdAt);
  if (!id || !startedAt) return null;
  const durationSec = Math.max(0, Math.round(Number(a?.duration) || 0));
  const answer = str(a?.callAnswer).toLowerCase();
  const status = str(a?.callStatus).toLowerCase();
  const connected = answer === "answered" && durationSec > 0;
  const lead = a?.lead || {};
  const campaign = str(a?.campaignName || a?.name);
  return {
    externalId: id,
    startedAt,
    durationSec,
    direction: /in/i.test(str(a?.direction)) ? "inbound" : "outbound",
    status: status || (connected ? "connected" : answer || "no-answer"),
    connected,
    meetingBooked: /meeting|rdv|rendez|booked/.test(status),
    firstName: str(a?.leadFirstName || lead.firstName || lead.variables?.firstName),
    lastName: str(a?.leadLastName || lead.lastName || lead.variables?.lastName),
    company: str(a?.leadCompanyName || lead.companyName || lead.variables?.companyName),
    jobTitle: str(lead.variables?.jobTitle),
    contactRef: str(a?.contactId || a?.leadId),
    phone: str(a?.leadPhone || lead.phone),
    repName: str(a?.sendUserName || a?.userName),
    listName: campaign || "Appels directs",
    campaign: str(a?.campaignId),
    summary: stripHtml(str(a?.callTranscriptSummary || a?.transcriptSummary)),
    recordingUrl: a?.callS3Ready || a?.recording?.url ? audioRef(id, toDate(a?.createdAt) || startedAt) : null,
  };
}

/** Nom, entreprise et poste d'un contact (appels hors campagne, sans lead). */
async function contactInfo(c: Record<string, string>, id: string) {
  const r = (await http(`${API}/contacts/${encodeURIComponent(id)}`, { headers: headers(c), label: LABEL }).catch(() => null)) as any;
  const d = r?.data && !Array.isArray(r.data) ? r.data : r;
  if (!d) return null;
  const f = d.fields || {};
  const full = str(d.fullName || f.fullName);
  const [fn = "", ...ln] = full.split(/\s+/);
  return {
    firstName: str(d.firstName || f.firstName) || fn, lastName: str(d.lastName || f.lastName) || ln.join(" "),
    company: str(d.companyName || f.companyName || d.company?.name), jobTitle: str(d.jobTitle || f.jobTitle),
  };
}

async function transcriptOf(url: string, rep: string): Promise<TranscriptLine[]> {
  if (!/^https:\/\//.test(url)) return [];
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return r.ok ? lemlistTranscript(await r.json(), rep) : [];
  } catch { return []; }
}

export const lemlist: Provider = {
  id: "lemlist",
  label: "lemlist",
  channels: ["call"],
  credentialFields: [{ key: "apiKey", label: "Clé API lemlist", type: "password", help: "lemlist › Paramètres › Intégrations › API : « Générer une clé »" }],
  help: "Appels du dialer lemlist : durée, statut, transcription, résumé et enregistrement. Chaque campagne peut être rangée chez un client.",
  async test(c) {
    await http(`${API}/team`, { headers: headers(c), label: LABEL });
    const r = await fetch(`${API}/activities?version=v2&type=${CALL_TYPE}&limit=1`, { headers: headers(c), signal: AbortSignal.timeout(30_000) });
    if (r.status === 402) throw new ProviderError("Votre formule lemlist n'inclut pas l'API des appels.");
  },
  async *list(c, since) {
    const contacts = new Map<string, Awaited<ReturnType<typeof contactInfo>>>();
    for (let offset = 0; offset < 6000; offset += 100) {
      const q = new URLSearchParams({ version: "v2", type: CALL_TYPE, limit: "100", offset: String(offset), minDate: since.toISOString() });
      const res = (await http(`${API}/activities?${q}`, { headers: headers(c), label: LABEL })) as any;
      const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      const out: NormalizedCall[] = [];
      for (const a of rows) {
        const m = mapLemlist(a);
        if (!m) continue;
        const cid = str(a?.contactId);
        if (cid && m.connected && !m.firstName && !m.lastName) {
          if (!contacts.has(cid)) contacts.set(cid, await contactInfo(c, cid));
          const info = contacts.get(cid);
          if (info) Object.assign(m, Object.fromEntries(Object.entries(info).filter(([, v]) => v)));
        }
        if (m.connected && m.durationSec >= 30 && a?.callTranscriptS3Ready && typeof a?.transcription === "string") {
          const t = await transcriptOf(a.transcription, m.repName || "Commercial");
          if (t.length) { m.transcript = t; m.hasDetail = true; }
        }
        out.push(m);
      }
      yield out;
      if (rows.length < 100) break;
    }
  },
  /** Le lien d'écoute lemlist expire : on relit l'activité pour obtenir un lien frais, puis on relaie l'audio. */
  async fetchAudio(c, url, range) {
    if (!url.startsWith(`${API}/activities?`)) return null;
    const [list, id] = url.split("#");
    const res = (await http(list, { headers: headers(c), label: LABEL })) as any;
    const rows: any[] = Array.isArray(res) ? res : res?.data || [];
    const rec = str(rows.find((a) => str(a?._id) === id)?.recording?.url);
    if (!/^https:\/\//.test(rec)) return null;
    return fetch(rec, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(60_000) });
  },
};
