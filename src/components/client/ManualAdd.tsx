"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseTranscript } from "./CsvImport";

const OBJ: Record<string, string> = { relevance: "Pertinence", incumbent: "Solution en place", timing: "Timing", too_busy: "Pas le temps", authority: "Pas décideur", budget: "Budget", other: "Autre" };
const OUTCOMES = { call: [["connected", "Décroché"], ["meeting", "RDV pris"], ["noanswer", "Pas de réponse"]], meeting: [["done", "Rendez-vous effectué"], ["won", "Suite positive / closing"], ["noshow", "No-show"]] } as const;

export function parseVtt(txt: string) {
  txt = txt.replace(/\r/g, "").replace(/^﻿/, "");
  if (!/-->/.test(txt)) return txt.trim();
  const out: { ts: string; sp: string; t: string }[] = [];
  for (const b of txt.split(/\n\s*\n/)) {
    const ls = b.split("\n").filter(Boolean), i = ls.findIndex((l) => /-->/.test(l)); if (i < 0) continue;
    const tm = ls[i].match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,]/); const ts = tm ? (tm[1] && +tm[1] ? tm[1] + ":" : "") + tm[2] + ":" + tm[3] : "";
    let text = ls.slice(i + 1).join(" ").trim(), sp = "";
    const v = text.match(/^<v\s+([^>]+)>/); if (v) sp = v[1].trim();
    text = text.replace(/<[^>]+>/g, "").trim();
    if (!sp) { const m = text.match(/^([^:]{1,40}):\s+(.+)$/); if (m) { sp = m[1].trim(); text = m[2]; } }
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && sp && last.sp === sp) last.t += " " + text; else out.push({ ts, sp, t: text });
  }
  return out.map((l) => `[${l.ts}] ${l.sp ? l.sp + " : " : ""}${l.t}`).join("\n");
}

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

export function ManualAdd({ clientId, uploads, only, shareToken }: { clientId: string | null; uploads: boolean; only?: "meeting"; shareToken?: string }) {
  const router = useRouter();
  const trFile = useRef<HTMLInputElement>(null), recFile = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"call" | "meeting">(only || "call");
  const [outcome, setOutcome] = useState(only ? "done" : "connected");
  const [objs, setObjs] = useState<string[]>([]);
  const [tr, setTr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) || "").trim();
    if (!v("first") && !v("last") && !v("company")) return setMsg({ err: "Indiquez au moins le nom du prospect ou l'entreprise." });
    const link = v("link");
    if (link && !/^https:\/\//i.test(link)) return setMsg({ err: "Le lien doit commencer par https://" });
    setMsg({});
    let recordingKey: string | null = null;
    try {
      if (file) {
        setBusy("Envoi de l'enregistrement…");
        const type = file.type || (/\.m4a$/i.test(file.name) ? "audio/mp4" : /\.mp3$/i.test(file.name) ? "audio/mpeg" : /\.wav$/i.test(file.name) ? "audio/wav" : "");
        const r = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: type, size: file.size, clientId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Envoi impossible");
        const put = await fetch(j.url, { method: "PUT", headers: { "Content-Type": type }, body: file });
        if (!put.ok) throw new Error("Le fichier n'a pas pu être envoyé.");
        recordingKey = j.key;
      }
      setBusy("Enregistrement…");
      const dur = v("dur");
      const durationSec = /^\d+:\d{1,2}$/.test(dur) ? +dur.split(":")[0] * 60 + +dur.split(":")[1] : Math.round(parseFloat(dur || "0") * 60) || 0;
      const isCall = kind === "call";
      const row = {
        externalId: "man_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        startedAt: new Date(v("date") || Date.now()).toISOString(), durationSec,
        status: isCall ? (outcome === "meeting" ? "meeting-booked" : outcome === "noanswer" ? "no-answer" : "connected") : outcome,
        connected: isCall ? outcome !== "noanswer" : true, meetingBooked: isCall && outcome === "meeting", kind,
        firstName: v("first"), lastName: v("last"), company: v("company"), jobTitle: v("job"), repName: v("rep"),
        listName: isCall ? "Ajout manuel" : "Rendez-vous", summary: v("summary"), objections: objs,
        transcript: tr.trim() ? parseTranscript(tr) : [], recordingUrl: link || null, recordingKey,
      };
      const r = await fetch("/api/calls/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "manual", clientId, rows: [row], ...(shareToken ? { shareToken } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Enregistrement impossible");
      (e.target as HTMLFormElement).reset(); setTr(""); setFile(null); setObjs([]);
      setMsg({ ok: isCall ? "Appel ajouté. L'IA l'analysera si vous avez fourni une transcription." : "Rendez-vous ajouté. Le débrief IA arrive dans une minute environ." });
      router.refresh();
    } catch (err) {
      setMsg({ err: err instanceof Error ? err.message : "Erreur" });
    } finally { setBusy(""); }
  }

  return (
    <div className="card" id="ajout">
      <div className="head"><div><h2>{only ? "Ajouter un rendez-vous" : "Ajouter un appel ou un rendez-vous AE"}</h2><p className="sub">{only ? "Collez la transcription (Google Meet, Teams, Zoom…) ou vos notes : l'IA en fait le débrief et le relie à l'appel de prospection." : "Avec l'enregistrement, la transcription et vos notes."}</p></div>
        {!only && <div className="seg"><button type="button" aria-pressed={kind === "call"} onClick={() => { setKind("call"); setOutcome("connected"); }}>Appel</button><button type="button" aria-pressed={kind === "meeting"} onClick={() => { setKind("meeting"); setOutcome("done"); }}>Rendez-vous AE</button></div>}</div>
      <form className="form" onSubmit={submit}>
        <label>Date et heure<input className="input" type="datetime-local" name="date" defaultValue={localNow()} required /></label>
        <label>{kind === "meeting" ? (only ? "Mené par" : "AE") : "Commercial"}<input className="input" name="rep" placeholder="Prénom Nom" /></label>
        <label>Prénom du prospect<input className="input" name="first" /></label>
        <label>Nom du prospect<input className="input" name="last" /></label>
        <label>Entreprise<input className="input" name="company" /></label>
        <label>Poste<input className="input" name="job" /></label>
        <label>Durée (min:sec)<input className="input" name="dur" placeholder="12:30" /></label>
        <label>Résultat<select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES[kind].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <div className="full field">Enregistrement
          {uploads ? (
            <div className="row">{file ? <><span className="pill">{file.name}</span><span className="muted small">{(file.size / 1048576).toFixed(1)} Mo</span><button type="button" className="btn sm" onClick={() => setFile(null)}>Retirer</button></>
              : <button type="button" className="btn sm" onClick={() => recFile.current?.click()}>Choisir un fichier audio ou vidéo</button>}</div>
          ) : null}
          <input className="input" name="link" placeholder={uploads ? "…ou collez un lien (https://…)" : "Lien vers l'enregistrement (https://…)"} />
          <input ref={recFile} type="file" hidden accept="audio/*,video/mp4,video/webm,video/quicktime,.m4a,.mp3,.wav" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && f.size > 200 * 1048576) return setMsg({ err: "Fichier trop lourd (200 Mo maximum)." }); setFile(f || null); }} />
        </div>
        <div className="full field"><div className="row">Transcription<span className="spacer" /><button type="button" className="btn sm" onClick={() => trFile.current?.click()}>Importer .txt / .vtt / .srt</button></div>
          <textarea className="input" rows={6} value={tr} onChange={(e) => setTr(e.target.value)} placeholder="Une ligne par réplique, ex. « [01:12] Julie : Bonjour… »" />
          <input ref={trFile} type="file" hidden accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setTr(parseVtt(await f.text())); }} />
        </div>
        <label className="full">Résumé / notes<textarea className="input" name="summary" rows={3} placeholder="Points clés, besoins, prochaine étape" /></label>
        <div className="full field">Objections<div className="row">{Object.entries(OBJ).map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={objs.includes(k)} onClick={() => setObjs((o) => o.includes(k) ? o.filter((x) => x !== k) : [...o, k])}>{l}</button>)}</div></div>
        <div className="full row"><button className="btn primary" disabled={!!busy}>{busy || "Enregistrer"}</button>
          {msg.err && <span className="pill bad">{msg.err}</span>}{msg.ok && <span className="pill win">{msg.ok}</span>}</div>
      </form>
    </div>
  );
}
