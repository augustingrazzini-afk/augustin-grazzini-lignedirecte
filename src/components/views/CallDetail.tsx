import { Btn } from "@/components/client/Btn";
import Link from "next/link";
import { openContact, prettyPhone } from "@/lib/contact";
import { planOf } from "@/lib/plan";
import { notFound } from "next/navigation";
import { callScope, type Scope, callAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { OBJ_LABEL, dateFR, displayName, fmtDuration, initials, timeFR } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";
import { presignRead } from "@/lib/storage";
import type { ObjDetail, TranscriptLine } from "@/lib/providers/types";
import type { Debrief } from "@/lib/ai";
import { transcribeEnabled } from "@/lib/transcribe";
import { aiEnabled } from "@/lib/ai-config";
import { needsRelay, signedAudioPath } from "@/lib/audio";
import { shareCall, unshareCall, assignCall, confirmMeeting } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";
import { hasRecordings } from "@/lib/listening";
import { ListenPlayer } from "@/components/client/ListenPlayer";
import { CallActions, CopyButton } from "../client/CallActions";

/** `readOnly` : lien de suivi partagé (aucune action, aucun lien vers des pages réservées). */
export async function CallDetail({ scope, base, id, readOnly = false }: { scope: Scope; base: string; id: string; readOnly?: boolean }) {
  // Le commercial invité voit ses appels, et ceux que l'entreprise lui a envoyés à écouter (lecture seule).
  const c = await db.call.findFirst({ where: callAccess(scope, id), include: { shares: { include: { client: { select: { name: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!c) notFound();
  const sharedWithMe = scope.kind === "client" && c.clientId !== scope.clientId ? c.shares.find((x) => x.clientId === scope.clientId) : undefined;
  if (sharedWithMe) readOnly = true;
  // Formule Découverte : ni résumé, ni objections, ni transcription, ni écoute (inclus à partir d'Essentiel).
  const plan = await planOf(scope.orgId), lite = !plan.ai;
  if (lite) { c.summary = ""; c.aiSummary = ""; c.objections = []; c.aiMeeting = false; }
  // Coordonnées du prospect : pour l'entreprise et le commercial, jamais sur un lien de suivi partagé ni pour un appel reçu « à écouter ».
  const contact = readOnly ? null : openContact(c.contactSealed);
  const tr = lite ? [] : (c.transcript as unknown as TranscriptLine[]) || [];
  const det = lite ? [] : (c.objDetails as unknown as ObjDetail[]) || [];
  // Lecture dans Trustpipe : fichier stocké chez nous, relais signé (outils dont l'audio demande une clé), sinon le lien de l'outil.
  const recLink = c.recordingUrl && /^https:\/\//.test(c.recordingUrl) ? c.recordingUrl : null;
  // L'écoute des enregistrements est réservée à la formule Premium (Essentiel : transcription seule).
  const audio = !plan.premium || c.durationSec <= 0 ? null : c.recordingUrl?.startsWith("/demo/audio/") ? c.recordingUrl: c.recordingKey ? await presignRead(c.recordingKey) : c.recordingUrl && needsRelay(c.provider) ? signedAudioPath(c.id) : recLink;
  // Secours si la lecture échoue ici : la page d'écoute de l'outil (jamais une adresse interne de relais).
  const recFallback = recLink && !/^https:\/\/api[.-]/.test(recLink) && recLink !== audio ? recLink : null;
  const clients = scope.kind === "org" ? await db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" } }) : [];
  const trText = tr.map((l) => `${l.ts ? `[${l.ts}] ` : ""}${l.s ? l.s + " : " : ""}${l.t}`).join("\n");
  const clientParam = scope.kind === "client" ? scope.clientId : null;
  const debrief = c.kind === "meeting" ? (c.debrief as unknown as Debrief | null) : null;
  const trMsg = c.transcriptStatus === "pending" ? "Transcription en cours : elle apparaît ici dans quelques minutes."
    : c.transcriptStatus === "failed" ? "La transcription automatique n'a pas pu être faite pour cet enregistrement."
    : (c.recordingKey || (c.recordingUrl && c.provider !== "minari")) && c.durationSec >= 8 && transcribeEnabled() ? "Transcription prévue à la prochaine synchronisation."
    : c.kind === "meeting" ? "Pas de transcription pour ce rendez-vous." : "Pas de transcription pour cet appel.";

  return (
    <div className="grid g-2">
      <div className="stack">
        {sharedWithMe && (
          <div className="card shared-note">
            <b>📣 {sharedWithMe.fromName || "Votre entreprise"} vous envoie cet appel à écouter</b>
            {sharedWithMe.note && <p>« {sharedWithMe.note} »</p>}
            <span className="muted small">Passé par {c.repName || "un autre commercial"} · reçu le {dateFR(sharedWithMe.createdAt)}. Vous pouvez le lire et l&apos;écouter ; il n&apos;apparaît pas dans vos chiffres.</span>
          </div>
        )}
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
            {contact?.phone && <><dt>Téléphone</dt><dd><a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{prettyPhone(contact.phone)}</a></dd></>}
            {contact?.email && <><dt>Email</dt><dd><a href={`mailto:${contact.email}`} style={{ wordBreak: "break-all" }}>{contact.email}</a></dd></>}
            <dt>Source</dt><dd>{SOURCE_LABEL[c.provider] || c.provider}{c.listName ? ` · ${c.listName}` : ""}</dd>
          </dl>
          {!readOnly && <div className="row" style={{ marginTop: 16 }}>
            {plan.premium ? <Link className="btn primary" href={`${base}/brief?q=${encodeURIComponent(displayName(c))}`}>Préparer le brief</Link>
              : <span className="btn btn-locked" aria-disabled="true" title="Inclus dans la formule Premium">Préparer le brief <em className="lock-pill">Premium</em></span>}
            <Link className="btn" href={`${base}/contacts/${encodeURIComponent(c.contactKey)}`}>Fiche prospect</Link>
            {lite && <span className="btn btn-locked" aria-disabled="true" title="Inclus dans la formule Essentiel">Analyser avec l&apos;IA <em className="lock-pill">Essentiel</em></span>}
            <CallActions id={c.id} canDelete={["csv", "manual"].includes(c.provider)} canAnalyze={!lite && tr.length > 0} back={`${base}/calls`} clientId={clientParam} meeting={c.kind === "meeting"} />
          </div>}
        </div>
        {debrief && <DebriefCard d={debrief} />}
        {c.kind === "meeting" && !debrief && tr.length > 0 && plan.premium && <div className="card"><div className="sec"><h4>Débrief IA</h4><p className="muted" style={{ margin: 0 }}>{aiEnabled() ? "Le débrief de ce rendez-vous est en préparation : il apparaît ici dans quelques instants." : "Le débrief IA de ce rendez-vous sera disponible dès l'activation de l'IA. En attendant, la transcription est à droite."}</p></div></div>}
        {c.aiSummary && <div className="card" id="analyse-ia"><div className="sec"><h4>Analyse IA <span className="pill win" style={{ marginLeft: 8 }}>Trustpipe</span></h4><div className="sumbox">{c.aiSummary.replace(/^-\s*/gm, "• ")}</div>
          {c.aiAnalyzedAt && <p className="muted small" style={{ margin: "8px 0 0" }}>Analysé le {c.aiAnalyzedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })} à {c.aiAnalyzedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} à partir de la transcription. À vérifier : une IA peut se tromper.</p>}</div></div>}
        {c.summary && c.summary.trim() !== c.aiSummary.trim() && <div className="card"><div className="sec"><h4>{c.aiSummary ? "Résumé de l'outil d'appel" : "Résumé"}</h4><div className="sumbox">{c.summary.replace(/^-\s*/gm, "• ")}</div></div></div>}
        {det.length > 0 && (
          <div className="card"><div className="sec"><h4>Objections</h4><div className="stack" style={{ gap: 8 }}>{det.map((o, i) => (
            <div key={i} className="objcard"><div className="row"><b>{OBJ_LABEL[o.category] || o.category}</b><span className="spacer" />{o.passed ? <span className="pill win">Passée</span> : <span className="pill bad">Non passée</span>}</div><span>{o.summary}</span><span className="muted">Réponse : {o.rep_response}</span></div>
          ))}</div></div></div>
        )}
        {!det.length && c.objections.length > 0 && <div className="card"><div className="sec"><h4>Objections</h4><div className="row">{c.objections.map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}</div></div></div>}
        {c.optOut && <div className="card"><div className="sec"><h4>Opposition du prospect <span className="pill bad" style={{ marginLeft: 8 }}>Ne plus contacter</span></h4>
          <p className="muted small" style={{ margin: 0 }}>Ce prospect a demandé à ne plus être contacté. Ses relances ont été retirées et Trustpipe n&apos;en proposera plus. Pensez à le marquer aussi « ne pas appeler » dans votre outil d&apos;appel.</p></div></div>}
        {c.aiMeeting && !c.meetingBooked && c.kind === "call" && (
          <div className="card"><div className="sec"><h4>Rendez-vous détecté par l&apos;IA</h4>
            <p className="muted small" style={{ margin: "0 0 10px" }}>D&apos;après la transcription, un rendez-vous semble avoir été fixé, mais l&apos;outil d&apos;appel ne l&apos;indique pas. Il n&apos;est pas compté dans les chiffres tant qu&apos;il n&apos;est pas confirmé.</p>
            {scope.kind === "org" && !readOnly ? <div className="row" style={{ gap: 8 }}>
              <form action={confirmMeeting}><input type="hidden" name="callId" value={c.id} /><input type="hidden" name="value" value="1" /><Btn className="btn sm primary">Confirmer le rendez-vous</Btn></form>
              <form action={confirmMeeting}><input type="hidden" name="callId" value={c.id} /><input type="hidden" name="value" value="0" /><Btn className="btn sm">Ce n&apos;est pas un rendez-vous</Btn></form>
            </div> : <p className="muted small" style={{ margin: 0 }}>Marquez le rendez-vous dans votre outil d&apos;appel pour qu&apos;il soit compté.</p>}
          </div></div>
        )}
        {scope.kind === "org" && (
          <>
          {!lite && clients.some((cl) => cl.id !== c.clientId) && (
            <div className="card"><div className="sec"><h4>Envoyer cet appel à un commercial</h4>
              <p className="muted small" style={{ margin: "0 0 10px" }}>Un bon appel à montrer en exemple, ou un appel à retravailler : le commercial choisi le retrouve dans son espace (résumé, transcription) et reçoit un email. L&apos;appel reste compté pour celui qui l&apos;a passé.</p>
              <ActionForm action={shareCall} submit="Envoyer l'appel" hidden={{ callId: c.id }}>
                <label>À qui<select className="select" name="clientId" required defaultValue=""><option value="" disabled>Choisir un commercial</option>{clients.filter((cl) => cl.id !== c.clientId).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}</select></label>
                <label className="full">Un mot pour lui <span className="muted small">(facultatif)</span><input className="input" name="note" maxLength={500} placeholder="Ex. : écoute comment Léa traite l'objection du prix à 01:12" /></label>
              </ActionForm>
              {c.shares.length > 0 && <div className="list" style={{ marginTop: 12 }}>{c.shares.map((x) => (
                <div key={x.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <span className="who">Envoyé à {x.client.name}<span> · le {dateFR(x.createdAt)}</span></span>
                  <form action={unshareCall}><input type="hidden" name="callId" value={c.id} /><input type="hidden" name="clientId" value={x.clientId} /><Btn className="btn sm" row>Retirer</Btn></form>
                  {x.note && <span className="sum">« {x.note} »</span>}
                </div>
              ))}</div>}
            </div></div>
          )}
          <div className="card"><div className="sec"><h4>À qui appartient cet appel</h4>
            <form action={assignCall} className="row"><input type="hidden" name="callId" value={c.id} />
              <select className="select" name="clientId" defaultValue={c.clientId || ""}><option value="">— Non attribué —</option>{clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}</select>
              <Btn className="btn sm">Changer</Btn></form>
            <p className="muted small" style={{ margin: "8px 0 0" }}>À corriger seulement si l&apos;appel a été rangé chez le mauvais commercial : il compte dans ses chiffres et son classement.</p></div></div>
          </>
        )}
      </div>
      {lite ? (
        <div className="card locked">
          <h2>Résumé, transcription et écoute de l&apos;appel</h2>
          <p className="muted" style={{ margin: "6px 0 12px" }}>Votre formule Découverte affiche qui a été appelé, quand et avec quel résultat. Le résumé de la conversation, les objections du prospect, la transcription complète et l&apos;écoute sont inclus à partir de la formule Essentiel.</p>
          {scope.kind === "org" && !readOnly ? <Link className="btn primary" href="/app/billing">Passer en Essentiel</Link> : <span className="muted small">Demandez à l&apos;entreprise qui gère cet espace de changer de formule.</span>}
        </div>
      ) : (
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}><div className="sec"><h4 style={{ margin: 0 }}>Transcription{tr.length ? ` · ${tr.length} répliques` : ""}</h4></div><span className="spacer" />{tr.length > 0 && <CopyButton text={trText} />}</div>
        {tr.length ? (
          <div className="transcript">{tr.map((l, i) => (
            <p key={i} className={l.s === c.repName || /^commercial$/i.test(l.s) ? "rep" : ""}><span className="ts">{l.ts}</span><span>{l.s && <b>{l.s}</b>}{l.t}</span></p>
          ))}</div>
        ) : <div className="empty">{trMsg}</div>}
        {audio ? (
          <div className="listen">
            <div><b>Écouter la conversation</b><span className="muted small">L&apos;enregistrement de l&apos;appel, en entier.</span></div>
            <ListenPlayer src={audio} fallback={recFallback} tool={SOURCE_LABEL[c.provider] || "votre outil d'appel"} />
          </div>
        ) : !plan.premium ? (c.connected && hasRecordings(c.provider) && (
          <div className="listen off">
            <div><b>🎧 Écouter la conversation</b><span className="muted small">L&apos;écoute des enregistrements est incluse dans la formule Premium. Votre formule affiche la transcription complète.</span></div>
            {!readOnly && scope.kind === "org" && <Link className="btn" href="/app/billing">Passer en Premium</Link>}
          </div>
        )) : c.connected && hasRecordings(c.provider) && (
          <div className="listen off">
            <div><b>🎧 Écoute non activée pour cet appel</b><span className="muted small">{!readOnly && scope.kind === "org"
              ? <>Pour écouter vos conversations ici, autorisez le partage des enregistrements dans {SOURCE_LABEL[c.provider] || "votre outil d'appel"}. C&apos;est un réglage à faire une seule fois, de votre côté.</>
              : <>L&apos;écoute se règle dans l&apos;outil d&apos;appel : demandez à l&apos;entreprise qui gère cet espace de l&apos;activer.</>}</span></div>
            {!readOnly && scope.kind === "org" && <Link className="btn" href="/app/sources#ecoute">Activer l&apos;écoute</Link>}
          </div>
        )}
      </div>
      )}
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
