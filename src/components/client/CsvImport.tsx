"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

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

export function CsvImport({ clientId }: { clientId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<{ rows?: Record<string, string>[]; headers?: string[]; map?: Record<string, string>; file?: string; err?: string; done?: number; total?: number; status: "idle" | "map" | "run" | "ok" }>({ status: "idle" });
  const [over, setOver] = useState(false);

  function load(f?: File) {
    if (!f) return;
    if (f.size > 25e6) return setSt({ status: "idle", err: "Fichier trop lourd (25 Mo maximum)." });
    Papa.parse<Record<string, string>>(f, { header: true, skipEmptyLines: true, complete: (res) => {
      const headers = (res.meta.fields || []).filter(Boolean);
      const rows = res.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim()));
      if (!rows.length) return setSt({ status: "idle", err: "Ce fichier ne contient pas de lignes lisibles." });
      const map: Record<string, string> = {}, used = new Set<string>();
      for (const [k, , re] of FIELDS) { const h = headers.find((h) => !used.has(h) && re.test(h.trim())); if (h) { map[k] = h; used.add(h); } }
      setSt({ status: "map", rows: rows.slice(0, 5000), headers, map, file: f.name, err: rows.length > 5000 ? "Seules les 5 000 premières lignes seront importées." : undefined });
    }, error: () => setSt({ status: "idle", err: "Impossible de lire ce fichier CSV." }) });
  }

  async function run() {
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

  const mapped = FIELDS.filter(([k]) => st.map?.[k]);
  return (
    <div className="card">
      <div className="row"><span className="logo-src" style={{ background: "linear-gradient(135deg,#34D6A0,#1FB985)" }}>CSV</span><div><h2>Import CSV</h2><span className="muted small">Aircall, Ringover, Excel, CRM… les colonnes sont reconnues automatiquement. Réimporter le même fichier ne crée pas de doublons.</span></div></div>
      <div style={{ marginTop: 14 }} className="stack">
        {st.status === "ok" && <div className="banner ok" style={{ margin: 0 }}><b>{st.done} appels importés</b>&nbsp;depuis {st.file}.</div>}
        {st.err && <div className="banner err" style={{ margin: 0 }}>{st.err}</div>}
        {(st.status === "idle" || st.status === "ok") && (
          <div className={`drop ${over ? "over" : ""}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            <b>Déposez un fichier CSV</b><span className="muted small">ou cliquez pour choisir</span>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
        {st.status === "map" && st.rows && (
          <>
            <p className="muted small" style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>{st.file}</b> · {st.rows.length} lignes. Vérifiez la correspondance des colonnes :</p>
            <div className="form">{FIELDS.map(([k, l]) => (
              <label key={k}>{l}<select className="select" value={st.map?.[k] || ""} onChange={(e) => setSt({ ...st, map: { ...st.map, [k]: e.target.value } })}>
                <option value="">— Ignorer —</option>{st.headers!.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
            ))}</div>
            <div className="scroll-x"><table><thead><tr>{mapped.map(([, l]) => <th key={l} style={{ textAlign: "left" }}>{l.replace(" *", "")}</th>)}</tr></thead>
              <tbody>{st.rows.slice(0, 3).map((r, i) => <tr key={i}>{mapped.map(([k]) => <td key={k} style={{ textAlign: "left", fontFamily: "var(--f-body)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[st.map![k]] ?? "").slice(0, 60)}</td>)}</tr>)}</tbody></table></div>
            <div className="row"><button className="btn primary" onClick={run}>Importer {st.rows.length} appels</button><button className="btn" onClick={() => setSt({ status: "idle" })}>Annuler</button></div>
          </>
        )}
        {st.status === "run" && <><div className="prog"><i style={{ width: `${((st.done || 0) / (st.total || 1)) * 100}%` }} /></div><p className="muted small" style={{ margin: 0 }}>{st.done} / {st.total}</p></>}
      </div>
    </div>
  );
}
