import Link from "next/link";
import { notFound } from "next/navigation";
import { callScope, type Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { OBJ_LABEL, dateFR, displayName, fmtDuration, initials, timeFR } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";
import { presignRead } from "@/lib/storage";
import type { ObjDetail, TranscriptLine } from "@/lib/providers/types";
import type { Debrief } from "@/lib/ai";
import { transcribeEnabled } from "@/lib/transcribe";
import { aiEnabled } from "@/lib/ai-config";
import { needsRelay, signedAudioPath } from "@/lib/audio";
import { assignCall } from "@/app/actions";
import { CallActions, CopyButton } from "../client/CallActions";

/** `readOnly` : lien de suivi partagé (aucune action, aucun lien vers des pages réservées). */
export async function CallDetail({ scope, base, id, readOnly = false }: { scope: Scope; base: string; id: string; readOnly?: boolean }) {
  const c = await db.call.findFirst({ where: { id, ...callScope(scope) } });
  if (!c) notFound();
  const tr = (c.transcript as unknown as TranscriptLine[]) || [];
  const det = (c.objDetails as unknown as ObjDetail[]) || [];
  const audio = c.recordingKey ? await presignRead(c.recordingKey) : c.recordingUrl && needsRelay(c.provider) ? signedAudioPath(c.id) : null;
  const clients = scope.kind === "org" ? await db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" } }) : [];
  const trText = tr.map((l) => `${l.ts ? `[${l.ts}] ` : ""}${l.s ? l.s + " : " : ""}${l.t}`).join("\n");
  const clientParam = scope.kind === "client" ? scope.clientId : null;
  const debrief = c.kind === "meeting" ? (c.debrief as unknown as Debrief | null) : null;
  const trMsg = c.transcriptStatus === "pending" ? "Transcription en cours : elle apparaît ici dans quelques minutes."
    : c.transcriptStatus === "failed" ? "La transcription automatique n'a pas pu être faite pour cet enregistrement."
    : (c.recordingUrl || c.recordingKey) && c.durationSec >= 8 && transcribeEnabled() ? "Transcription prévue à la prochaine synchronisation."
    : c.kind === "meeting" ? "Pas de transcription pour ce rendez-vous." : "Pas de transcription pour cet appel.";

  return (
    <div className="grid g-2">
      <div className="stack">
        <div className="card">
          <div className="row" style={{ gap: 14 }}>
            <span className={`av ${c.meetingBooked ? "win" : ""}`} style={{ width: 52, height: 52, fontSize: 18 }}>{initials(c)}</span>
            <div><h2 style={{ fontSize: 24 }}>{displayName(c)}</h2><p className="muted" style={{ margin: "2px 0 0" }}>{[c.jobTitle, c.company].filter(Boolean).join(" · ")}</p></div>
          </div>
          <dl className="dl" style={{ marginTop: 16 }}>
            <dt>Date</dt><dd>{dateFR(c.startedAt)} à {timeFR(c.startedAt)}</dd>
            <dt>Durée</dt><dd>{fmtDuration(c.durationSec)}{c.direction ? ` · ${c.direction === "inbound" ? "entrant" : "sortant"}` : ""}</dd>
            <dt>Résultat</dt><dd>{c.meetingBooked ? <span className="pill win">RDV pris</span> : <span className="pill mute">{c.kind === "meeting" ? "Rendez-vous AE" : c.connected ? "Décroché" : c.status}</span>}</dd>
            <dt>Commercial</dt><dd>{c.repName || "–"}</dd>
            <dt>Source</dt><dd>{SOURCE_LABEL[c.provider] || c.provider}{c.listName ? ` · ${c.listName}` : ""}</dd>
          </dl>
          {(audio || c.recordingUrl) && (
            <div className="sec" style={{ marginTop: 16 }}><h4>Enregistrement</h4>
              {audio ? <audio controls preload="metadata" src={audio} style={{ width: "100%" }} /> : <a className="btn" href={c.recordingUrl!} target="_blank" rel="noopener noreferrer">Écouter l&apos;enregistrement</a>}
            </div>
          )}
          {!readOnly && <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn primary" href={`${base}/brief?q=${encodeURIComponent(displayName(c))}`}>Préparer le brief</Link>
            <Link className="btn" href={`${base}/contacts/${encodeURIComponent(c.contactKey)}`}>Fiche prospect</Link>
            <CallActions id={c.id} canDelete={["csv", "manual"].includes(c.provider)} canAnalyze={tr.length > 0} back={`${base}/calls`} clientId={clientParam} meeting={c.kind === "meeting"} />
          </div>}
        </div>
        {debrief && <DebriefCard d={debrief} />}
        {c.kind === "meeting" && !debrief && tr.length > 0 && <div className="card"><div className="sec"><h4>Débrief IA</h4><p className="muted" style={{ margin: 0 }}>{aiEnabled() ? "Le débrief de ce rendez-vous est en préparation : il apparaît ici dans quelques instants." : "Le débrief IA de ce rendez-vous sera disponible dès l'activation de l'IA. En attendant, la transcription est à droite."}</p></div></div>}
        {c.summary && <div className="card"><div className="sec"><h4>Résumé</h4><div className="sumbox">{c.summary.replace(/^-\s*/gm, "• ")}</div></div></div>}
        {det.length > 0 && (
          <div className="card"><div className="sec"><h4>Objections</h4><div className="stack" style={{ gap: 8 }}>{det.map((o, i) => (
            <div key={i} className="objcard"><div className="row"><b>{OBJ_LABEL[o.category] || o.category}</b><span className="spacer" />{o.passed ? <span className="pill win">Passée</span> : <span className="pill bad">Non passée</span>}</div><span>{o.summary}</span><span className="muted">Réponse : {o.rep_response}</span></div>
          ))}</div></div></div>
        )}
        {!det.length && c.objections.length > 0 && <div className="card"><div className="sec"><h4>Objections</h4><div className="row">{c.objections.map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}</div></div></div>}
        {scope.kind === "org" && (
          <div className="card"><div className="sec"><h4>Client</h4>
            <form action={assignCall} className="row"><input type="hidden" name="callId" value={c.id} />
              <select className="select" name="clientId" defaultValue={c.clientId || ""}><option value="">— Non rangé —</option>{clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}</select>
              <button className="btn sm">Ranger</button></form>
            <p className="muted small" style={{ margin: "8px 0 0" }}>Le client choisi voit cet appel dans son espace.</p></div></div>
        )}
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}><div className="sec"><h4 style={{ margin: 0 }}>Transcription{tr.length ? ` · ${tr.length} répliques` : ""}</h4></div><span className="spacer" />{tr.length > 0 && <CopyButton text={trText} />}</div>
        {tr.length ? (
          <div className="transcript">{tr.map((l, i) => (
            <p key={i} className={l.s === c.repName || /^commercial$/i.test(l.s) ? "rep" : ""}><span className="ts">{l.ts}</span><span>{l.s && <b>{l.s}</b>}{l.t}</span></p>
          ))}</div>
        ) : <div className="empty">{trMsg}</div>}
      </div>
    </div>
  );
}

function DebriefCard({ d }: { d: Debrief }) {
  const tone = d.score >= 7 ? "win" : d.score >= 5 ? "" : "bad";
  return (
    <div className="card debrief">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="sec" style={{ flex: 1 }}><h4>Débrief IA du rendez-vous</h4><p className="debrief-verdict">{d.verdict}</p></div>
        <span className={`debrief-score ${tone}`}>{d.score}<small>/10</small></span>
      </div>
      <div className="grid g-2e" style={{ gap: 12, marginTop: 10 }}>
        <div className="debrief-box ok"><b>✓ Ce qui a marché</b><ul>{d.worked.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div className="debrief-box ko"><b>✗ Ce qui a manqué</b><ul>{d.missed.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      {d.objections.length > 0 && <div className="sec" style={{ marginTop: 14 }}><h4>Objections</h4><div className="stack" style={{ gap: 6 }}>{d.objections.map((o, i) => (
        <div key={i} className="objcard"><div className="row"><b>{o.objection}</b><span className="spacer" />{o.handled ? <span className="pill win">Traitée</span> : <span className="pill bad">Non traitée</span>}</div><span className="muted">{o.comment}</span></div>
      ))}</div></div>}
      {d.coherence && <div className="sec" style={{ marginTop: 14 }}><h4>Par rapport à l&apos;appel de prospection</h4><p style={{ margin: 0, lineHeight: 1.55 }}>{d.coherence}</p></div>}
      <div className="sec" style={{ marginTop: 14 }}><h4>Conseils</h4><ol className="debrief-advice">{d.advice.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
      {d.next_step && <div className="banner info" style={{ marginTop: 12 }}><b>Prochaine étape :</b>&nbsp;{d.next_step}</div>}
    </div>
  );
}
