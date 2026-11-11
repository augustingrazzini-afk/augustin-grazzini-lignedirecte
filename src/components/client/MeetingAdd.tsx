"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseTranscript } from "./CsvImport";
import { parseVtt } from "./ManualAdd";

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
/** Durée déduite du dernier horodatage de la transcription. */
function durationOf(lines: { ts: string }[]) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = lines[i].ts.split(":").map(Number);
    if (p.length >= 2 && p.every((n) => Number.isFinite(n))) return p.reduce((a, n) => a * 60 + n, 0);
  }
  return 0;
}

/**
 * Ajout d'un rendez-vous : tout part de la transcription (ou de l'enregistrement, transcrit automatiquement).
 * Rien n'est saisi à la main : résumé, objections et débrief sont produits par l'IA.
 */
export function MeetingAdd({ clientId, uploads, shareToken }: { clientId: string | null; uploads: boolean; shareToken?: string }) {
  const router = useRouter();
  const trFile = useRef<HTMLInputElement>(null), recFile = useRef<HTMLInputElement>(null);
  const [tr, setTr] = useState("");
  const [trName, setTrName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) || "").trim();
    if (!v("first") && !v("last") && !v("company")) return setMsg({ err: "Indiquez le prospect ou son entreprise, pour relier le rendez-vous à son appel de prospection." });
    if (!tr.trim() && !file && !link) return setMsg({ err: "Ajoutez la transcription du rendez-vous, ou son enregistrement." });
    if (link && !/^https:\/\//i.test(link)) return setMsg({ err: "Le lien de l'enregistrement doit commencer par https://" });
    setMsg({});
    try {
      let recordingKey: string | null = null;
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
      const transcript = tr.trim() ? parseTranscript(tr) : [];
      const row = {
        externalId: "rdv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        startedAt: new Date(v("date") || Date.now()).toISOString(), durationSec: durationOf(transcript) || (file || link ? 60 : 0),
        status: "done", connected: true, meetingBooked: false, kind: "meeting",
        firstName: v("first"), lastName: v("last"), company: v("company"), jobTitle: "", repName: "", listName: "Rendez-vous",
        summary: "", objections: [], transcript, recordingUrl: link || null, recordingKey,
      };
      const r = await fetch("/api/calls/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "manual", clientId, rows: [row], ...(shareToken ? { shareToken } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Enregistrement impossible");
      (e.target as HTMLFormElement).reset(); setTr(""); setTrName(""); setFile(null); setLink("");
      setMsg({ ok: transcript.length ? "Rendez-vous ajouté : le débrief de l'IA arrive dans une minute environ." : "Rendez-vous ajouté : l'enregistrement est en cours de transcription, puis l'IA en fera le débrief." });
      router.refresh();
    } catch (err) {
      setMsg({ err: err instanceof Error ? err.message : "Erreur" });
    } finally { setBusy(""); }
  }

  return (
    <div className="card" id="ajout">
      <h2>Ajouter un rendez-vous</h2>
      <p className="sub">Déposez la transcription de votre visio (Google Meet, Teams, Zoom…) ou son enregistrement. L&apos;IA fait le reste : résumé, objections et débrief, relié à l&apos;appel de prospection.</p>
      <form className="form" onSubmit={submit}>
        <label>Prénom du prospect<input className="input" name="first" /></label>
        <label>Nom du prospect<input className="input" name="last" /></label>
        <label>Entreprise<input className="input" name="company" /></label>
        <label>Date du rendez-vous<input className="input" type="datetime-local" name="date" defaultValue={localNow()} required /></label>
        <div className="full field">Transcription
          <div className="row">
            <button type="button" className="btn primary sm" onClick={() => trFile.current?.click()}>Déposer le fichier de transcription</button>
            {trName && <span className="pill">{trName}</span>}
            <span className="muted small">.vtt, .srt ou .txt</span>
          </div>
          <textarea className="input" rows={5} value={tr} onChange={(e) => { setTr(e.target.value); setTrName(""); }} placeholder="…ou collez-la ici" />
          <input ref={trFile} type="file" hidden accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setTr(parseVtt(await f.text())); setTrName(f.name); } }} />
          <span className="small" style={{ color: "var(--dim)" }}>Google Meet : Drive › Meet Recordings › transcription · Teams : réunion › Transcription › Télécharger · Zoom : Enregistrements › fichier .vtt</span>
        </div>
        <div className="full field">Pas de transcription ? L&apos;enregistrement suffit, il sera transcrit automatiquement
          {uploads && <div className="row">{file ? <><span className="pill">{file.name}</span><button type="button" className="btn sm" onClick={() => setFile(null)}>Retirer</button></> : <button type="button" className="btn sm" onClick={() => recFile.current?.click()}>Choisir un fichier audio ou vidéo</button>}</div>}
          <input className="input" value={link} onChange={(e) => setLink(e.target.value.trim())} placeholder="Lien direct vers le fichier audio (https://…)" />
          <input ref={recFile} type="file" hidden accept="audio/*,video/mp4,video/webm,video/quicktime,.m4a,.mp3,.wav" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && f.size > 200 * 1048576) return setMsg({ err: "Fichier trop lourd (200 Mo maximum)." }); setFile(f || null); }} />
        </div>
        {msg.err && <div className="full banner err" role="alert">{msg.err}</div>}
        {msg.ok && <div className="full banner ok" role="status">✓ {msg.ok}</div>}
        <div className="full row"><button className="btn primary" disabled={!!busy}>{busy || "Ajouter le rendez-vous"}</button></div>
      </form>
    </div>
  );
}
