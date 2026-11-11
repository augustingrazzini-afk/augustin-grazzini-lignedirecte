"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { convertLinkedin, detectLinkedin, stripLinkedinPreamble, type LinkedinKind } from "@/lib/linkedin-export";

const FIELDS: [string, string, RegExp][] = [
  ["date", "Date de l'appel *", /^(date|jour|created|timestamp|date.?(de l')?appel|call.?date|start)/i],
  ["fullname", "Nom complet", /^(nom complet|full.?name|contact|prospect|nom du contact|name|interlocuteur)$/i],
  ["first", "Prénom", /pr[ée]nom|first.?name/i],
  ["last", "Nom", /^(nom|nom de famille|last.?name|surname)$/i],
  ["company", "Entreprise", /entreprise|soci[ée]t[ée]|company|account|compte|organi[sz]ation/i],
  ["job", "Poste", /poste|titre|title|fonction|job|r[ôo]le/i],
  ["duration", "Durée", /dur[ée]e|duration|length|temps/i],
  ["status", "Statut / résultat", /statut|status|r[ée]sultat|outcome|disposition|issue/i],
  ["meeting", "RDV pris", /rdv|rendez|meeting|booked/i],
  ["summary", "Résumé / notes", /r[ée]sum[ée]|summary|note|comment|compte.?rendu|body/i],
  ["transcript", "Transcription", /transcri/i],
  ["recording", "Lien d'enregistrement", /enregistrement|recording|audio/i],
  ["rep", "Commercial", /commercial|sdr|bdr|\brep\b|agent|owner|appelant|caller|user/i],
];
const AFIELDS: [string, string, RegExp][] = [
  ["date", "Date *", /^(date|jour|created|timestamp|sent.?at|replied.?at|occurred)/i],
  ["event", "Événement * (envoyé, réponse, invitation acceptée…)", /^(event|type|événement|evenement|action|activity|statut|status)$/i],
  ["channel", "Canal (email / linkedin)", /^(channel|canal)$/i],
  ["fullname", "Nom complet", /^(nom complet|full.?name|contact|prospect|name|lead)$/i],
  ["first", "Prénom", /pr[ée]nom|first.?name/i],
  ["last", "Nom", /^(nom|nom de famille|last.?name|surname)$/i],
  ["company", "Entreprise", /entreprise|soci[ée]t[ée]|company|account|organi[sz]ation/i],
  ["job", "Poste", /poste|titre|title|fonction|job/i],
  ["email", "Email du prospect", /^(e-?mail|lead.?email|email address|adresse)/i],
  ["linkedin", "Profil LinkedIn", /linkedin/i],
  ["campaign", "Campagne / séquence", /campa|s[ée]quence/i],
  ["subject", "Objet", /^(subject|objet)/i],
  ["body", "Message / réponse", /message|body|reply|r[ée]ponse|text|contenu/i],
  ["rep", "Commercial", /commercial|sdr|bdr|sender|exp[ée]diteur|owner|user/i],
];
function mapEvent(raw: string, channelHint: string): { channel: "email" | "linkedin"; type: string } | null {
  const t = `${channelHint} ${raw}`.toLowerCase();
  const li = /linkedin|invit|connexion|connection|inmail/.test(t);
  const ch = li ? "linkedin" : "email";
  if (/rdv|rendez|meeting|booked/.test(t)) return { channel: ch, type: "meeting_booked" };
  if (/accept/.test(t)) return { channel: "linkedin", type: "invite_accepted" };
  if (/invit|connection request|connexion/.test(t)) return { channel: "linkedin", type: "invite_sent" };
  if (/visit|vue|view/.test(t)) return { channel: "linkedin", type: "profile_visit" };
  if (/r[ée]pon|repl|answer/.test(t)) return { channel: ch, type: "replied" };
  if (/bounce|rebond/.test(t)) return { channel: "email", type: "bounced" };
  if (/d[ée]sinscri|unsub/.test(t)) return { channel: "email", type: "unsubscribed" };
  if (/ouvert|open/.test(t)) return { channel: "email", type: "opened" };
  if (/cli/.test(t)) return { channel: "email", type: "clicked" };
  if (/envoy|sent|send|message/.test(t)) return { channel: ch, type: li ? "message_sent" : "sent" };
  return null;
}

const RE_OK = /connect|d[ée]croch|answered|r[ée]pondu|joint|rdv|rendez|meeting|interested|int[ée]ress|completed|termin|conversation/i;
const RE_KO = /pas de r[ée]ponse|no.?answer|messagerie|voicemail|occup|busy|[ée]chec|failed|manqu|missed|injoignable|non.?joint|unreachable/i;

function parseDur(v: string) {
  v = v.trim(); if (!v) return 0;
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(v)) { const p = v.split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
  const n = parseFloat(v.replace(",", ".")); if (!Number.isFinite(n)) return 0;
  return Math.round(n > 36000 ? n / 1000 : n);
}
function parseDate(v: string): string | null {
  v = v.trim(); if (!v) return null;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const d = new Date(y, +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)); return isNaN(+d) ? null : d.toISOString(); }
  if (/^\d{10,13}$/.test(v)) { const n = +v; return new Date(n < 1e12 ? n * 1000 : n).toISOString(); }
  const d = new Date(v); return isNaN(+d) ? null : d.toISOString();
}
async function hash(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function parseTranscript(txt: string) {
  return txt.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 3000).map((l) => {
    const m = l.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/); let ts = "", rest = l;
    if (m) { ts = m[1]; rest = m[2]; }
    const s = rest.match(/^([^:]{1,40}?)\s*:\s+(.+)$/);
    return s ? { ts, s: s[1].trim(), t: s[2].slice(0, 5000) } : { ts, s: "", t: rest.slice(0, 5000) };
  });
}

/** Import emails / LinkedIn : désactivé (Trustpipe se concentre sur les appels). */
const SOCIAL_IMPORT: boolean = false;

export function CsvImport({ clientId }: { clientId: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"call" | "activity">("call");
  const fields = mode === "call" ? FIELDS : AFIELDS;
  const input = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<{ rows?: Record<string, string>[]; headers?: string[]; map?: Record<string, string>; file?: string; err?: string; done?: number; total?: number; li?: LinkedinKind; status: "idle" | "map" | "li" | "run" | "ok" }>({ status: "idle" });
  const [over, setOver] = useState(false);

  function load(f?: File) {
    if (!f) return;
    if (f.size > 25e6) return setSt({ status: "idle", err: "Fichier trop lourd (25 Mo maximum)." });
    Papa.parse<Record<string, string>>(f, { header: true, skipEmptyLines: true, beforeFirstChunk: stripLinkedinPreamble, complete: (res) => {
      const headers = (res.meta.fields || []).filter(Boolean);
      const rows = res.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim()));
      if (!rows.length) return setSt({ status: "idle", err: "Ce fichier ne contient pas de lignes lisibles." });
      const li = detectLinkedin(headers);
      if (li && SOCIAL_IMPORT) { setMode("activity"); return setSt({ status: "li", li, rows: rows.slice(0, 20000), headers, file: f.name, err: rows.length > 20000 ? "Seules les 20 000 premières lignes seront importées." : undefined }); }
      const map: Record<string, string> = {}, used = new Set<string>();
      for (const [k, , re] of fields) { const h = headers.find((h) => !used.has(h) && re.test(h.trim())); if (h) { map[k] = h; used.add(h); } }
      setSt({ status: "map", rows: rows.slice(0, 5000), headers, map, file: f.name, err: rows.length > 5000 ? "Seules les 5 000 premières lignes seront importées." : undefined });
    }, error: () => setSt({ status: "idle", err: "Impossible de lire ce fichier CSV." }) });
  }

  async function runLinkedin() {
    const { rows = [], li, file = "" } = st;
    if (!li) return;
    const { out: conv, skipped } = convertLinkedin(li, rows);
    const out = [];
    for (const a of conv) out.push({ externalId: "li_" + (await hash(a.key)), channel: "linkedin", type: a.type, occurredAt: a.occurredAt,
      firstName: a.firstName.slice(0, 120), lastName: a.lastName.slice(0, 120), company: a.company.slice(0, 200), jobTitle: a.jobTitle.slice(0, 200),
      email: a.email?.slice(0, 254), linkedinUrl: a.linkedinUrl?.slice(0, 500), repName: "", campaign: li === "connections" ? "Relations LinkedIn" : "Messagerie LinkedIn", subject: a.subject.slice(0, 300), body: a.body.slice(0, 8000) });
    return send(out, file, skipped);
  }

  async function send(out: Record<string, unknown>[], file: string, skipped: number) {
    if (!out.length) return setSt({ ...st, err: "Aucune ligne reconnue dans ce fichier." });
    setSt({ ...st, status: "run", done: 0, total: out.length, err: undefined });
    let done = 0;
    for (let i = 0; i < out.length; i += 300) {
      const r = await fetch("/api/activities/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "csv", clientId, rows: out.slice(i, i + 300) }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return setSt({ ...st, status: "idle", err: (j.error || "Import interrompu") + ` (${done} lignes importées avant l'erreur).` }); }
      done += Math.min(300, out.length - i);
      setSt((s) => ({ ...s, done }));
    }
    setSt({ status: "ok", done, file, err: skipped ? `${skipped} ligne(s) ignorée(s) : date ou contact manquant.` : undefined });
    router.refresh();
  }

  async function runActivities() {
    const { rows = [], map = {}, file = "" } = st;
    if (!map.date || !map.event) return setSt({ ...st, err: "Indiquez les colonnes de date et d'événement." });
    const g = (r: Record<string, string>, k: string) => (map[k] ? String(r[map[k]] ?? "").trim() : "");
    const out = [];
    let skipped = 0;
    for (const r of rows) {
      const occurredAt = parseDate(g(r, "date")); const ev = mapEvent(g(r, "event"), g(r, "channel"));
      if (!occurredAt || !ev) { skipped++; continue; }
      let first = g(r, "first"), last = g(r, "last");
      if (!first && !last && g(r, "fullname")) { const p = g(r, "fullname").split(/\s+/); first = p.shift() || ""; last = p.join(" "); }
      out.push({ externalId: "csv_" + (await hash([occurredAt, ev.type, first, last, g(r, "company"), g(r, "email"), g(r, "subject")].join("|"))), ...ev, occurredAt,
        firstName: first.slice(0, 120), lastName: last.slice(0, 120), company: g(r, "company").slice(0, 200), jobTitle: g(r, "job").slice(0, 200),
        email: g(r, "email").slice(0, 254) || undefined, linkedinUrl: g(r, "linkedin").slice(0, 500) || undefined, repName: g(r, "rep").slice(0, 120),
        campaign: (g(r, "campaign") || file).slice(0, 200), subject: g(r, "subject").slice(0, 300), body: g(r, "body").slice(0, 8000) });
    }
    if (!out.length) return setSt({ ...st, err: "Aucune ligne reconnue : vérifiez les colonnes de date et d'événement." });
    setSt({ ...st, status: "run", done: 0, total: out.length, err: undefined });
    let done = 0;
    for (let i = 0; i < out.length; i += 300) {
      const r = await fetch("/api/activities/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "csv", clientId, rows: out.slice(i, i + 300) }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return setSt({ ...st, status: "map", err: (j.error || "Import interrompu") + ` (${done} lignes importées avant l'erreur).` }); }
      done += Math.min(300, out.length - i);
      setSt((s) => ({ ...s, done }));
    }
    setSt({ status: "ok", done, file, err: skipped ? `${skipped} ligne(s) ignorée(s) : date ou événement non reconnu.` : undefined });
    router.refresh();
  }

  async function run() {
    if (mode === "activity") return runActivities();
    const { rows = [], map = {}, file = "" } = st;
    if (!map.date) return setSt({ ...st, err: "Indiquez la colonne qui contient la date de l'appel." });
    const g = (r: Record<string, string>, k: string) => (map[k] ? String(r[map[k]] ?? "").trim() : "");
    const out = [];
    for (const r of rows) {
      const startedAt = parseDate(g(r, "date")); if (!startedAt) continue;
      let first = g(r, "first"), last = g(r, "last");
      if (!first && !last && g(r, "fullname")) { const p = g(r, "fullname").split(/\s+/); first = p.shift() || ""; last = p.join(" "); }
      const status = g(r, "status"), dur = parseDur(g(r, "duration"));
      const meeting = /^(oui|yes|true|vrai|1|x)$/i.test(g(r, "meeting")) || /rdv|rendez|meeting|booked/i.test(status);
      const connected = meeting || (status ? (RE_OK.test(status) && !RE_KO.test(status)) || (!RE_KO.test(status) && dur > 0) : dur > 0);
      const rec = g(r, "recording");
      out.push({
        externalId: "csv_" + (await hash([startedAt, first, last, g(r, "company"), dur].join("|"))),
        startedAt, durationSec: dur, status: (meeting ? "meeting-booked" : connected ? "connected" : status || "no-answer").slice(0, 60), connected, meetingBooked: meeting, kind: "call",
        firstName: first.slice(0, 120), lastName: last.slice(0, 120), company: g(r, "company").slice(0, 200), jobTitle: g(r, "job").slice(0, 200), repName: g(r, "rep").slice(0, 120), listName: file.slice(0, 200),
        summary: g(r, "summary").slice(0, 8000), objections: [], transcript: g(r, "transcript") ? parseTranscript(g(r, "transcript")) : [],
        recordingUrl: /^https:\/\//i.test(rec) ? rec : null,
      });
    }
    if (!out.length) return setSt({ ...st, err: "Aucune date lisible dans la colonne choisie." });
    setSt({ ...st, status: "run", done: 0, total: out.length, err: undefined });
    let done = 0;
    for (let i = 0; i < out.length; i += 200) {
      const r = await fetch("/api/calls/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "csv", clientId, rows: out.slice(i, i + 200) }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return setSt({ ...st, status: "map", err: (j.error || "Import interrompu") + ` (${done} appels importés avant l'erreur).` }); }
      done += Math.min(200, out.length - i);
      setSt((s) => ({ ...s, done }));
    }
    setSt({ status: "ok", done, file });
    router.refresh();
  }

  const mapped = fields.filter(([k]) => st.map?.[k]);
  return (
    <div className="card">
      <div className="row"><span className="logo-src" style={{ background: "linear-gradient(135deg,#34D6A0,#1FB985)" }}>CSV</span><div><h2>Import CSV</h2><span className="muted small">Exports de n&apos;importe quel outil : les colonnes sont reconnues automatiquement. Réimporter le même fichier ne crée pas de doublons.</span></div></div>
      {mode === "activity" && (
        <details className="csv-help" style={{ marginTop: 12 }}>
          <summary>Où trouver mon fichier LinkedIn ou email ?</summary>
          <div className="small">
            <p><b>Depuis LinkedIn</b> (gratuit) : photo de profil › <b>Préférences et confidentialité</b> › <b>Confidentialité des données</b> › <b>Obtenir une copie de vos données</b> › cochez <b>Relations</b> et/ou <b>Messages</b> › <b>Demander l&apos;archive</b>. LinkedIn vous envoie un email (10 min à 24 h) ; dans le ZIP, déposez ici <code>Connections.csv</code> (vos relations, comptées comme invitations acceptées) ou <code>messages.csv</code> (vos messages envoyés et les réponses de vos prospects, que l&apos;IA classe). Ces deux fichiers sont reconnus automatiquement.</p>
            <p><b>Depuis votre outil LinkedIn</b> : Waalaxy › Prospects › liste › <b>Exporter en CSV</b> ; La Growth Machine › Leads › <b>Export CSV</b>.</p>
            <p><b>Campagnes email</b> : lemlist › campagne › Leads › <b>Exporter</b> ; Instantly › campagne › <b>Download CSV</b> ; Smartlead › campagne › <b>Export</b>. Le plus simple reste de connecter l&apos;outil dans « Connecteurs » : tout remonte seul.</p>
            <p>Votre fichier doit indiquer, ligne par ligne, une <b>date</b>, un <b>événement</b> (envoyé, ouvert, réponse, invitation envoyée / acceptée, RDV) et le <b>prospect</b>.</p>
          </div>
        </details>
      )}
      <div style={{ marginTop: 14 }} className="stack">
        {st.status === "ok" && <div className="banner ok" style={{ margin: 0 }}><b>{st.done} {mode === "call" ? "appels" : "lignes"} importé(e)s</b>&nbsp;depuis {st.file}.</div>}
        {st.err && <div className="banner err" style={{ margin: 0 }}>{st.err}</div>}
        {(st.status === "idle" || st.status === "ok") && (
          <div className={`drop ${over ? "over" : ""}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            <b>Déposez un fichier CSV</b><span className="muted small">ou cliquez pour choisir</span>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
        {st.status === "li" && st.rows && (
          <>
            <div className="banner ok" style={{ margin: 0 }}><b>Export LinkedIn reconnu</b>&nbsp;: {st.li === "connections" ? `${st.rows.length} relations (comptées comme invitations acceptées, à leur date de connexion)` : `${st.rows.length} messages (vos envois et les réponses de vos prospects ; l'IA classera les réponses)`}.</div>
            {st.li === "messages" && <p className="muted small" style={{ margin: 0 }}>Toutes les conversations du fichier sont importées, y compris les échanges qui ne relèvent pas de la prospection.</p>}
            <div className="row"><button className="btn primary" onClick={runLinkedin}>Importer {st.rows.length} lignes</button><button className="btn" onClick={() => setSt({ status: "idle" })}>Annuler</button></div>
          </>
        )}
        {st.status === "map" && st.rows && (
          <>
            <p className="muted small" style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>{st.file}</b> · {st.rows.length} lignes. Vérifiez la correspondance des colonnes :</p>
            <div className="form">{fields.map(([k, l]) => (
              <label key={k}>{l}<select className="select" value={st.map?.[k] || ""} onChange={(e) => setSt({ ...st, map: { ...st.map, [k]: e.target.value } })}>
                <option value="">— Ignorer —</option>{st.headers!.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
            ))}</div>
            <div className="scroll-x"><table><thead><tr>{mapped.map(([, l]) => <th key={l} style={{ textAlign: "left" }}>{l.replace(" *", "")}</th>)}</tr></thead>
              <tbody>{st.rows.slice(0, 3).map((r, i) => <tr key={i}>{mapped.map(([k]) => <td key={k} style={{ textAlign: "left", fontFamily: "var(--f-body)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[st.map![k]] ?? "").slice(0, 60)}</td>)}</tr>)}</tbody></table></div>
            <div className="row"><button className="btn primary" onClick={run}>Importer {st.rows.length} {mode === "call" ? "appels" : "lignes"}</button><button className="btn" onClick={() => setSt({ status: "idle" })}>Annuler</button></div>
          </>
        )}
        {st.status === "run" && <><div className="prog"><i style={{ width: `${((st.done || 0) / (st.total || 1)) * 100}%` }} /></div><p className="muted small" style={{ margin: 0 }}>{st.done} / {st.total}</p></>}
      </div>
    </div>
  );
}
