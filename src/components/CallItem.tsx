import Link from "next/link";
import type { Call } from "@prisma/client";
import { OBJ_LABEL, dateFR, displayName, fmtDuration, initials } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";

/** `lite` : formule Découverte, sans résumé, objections, transcription ni écoute. */
/** `contact` : téléphone et email du prospect, déjà déchiffrés (jamais fournis sur un lien de suivi partagé). */
export function CallItem({ c, base, showSource, rep, lite, audio = true, hasTranscript, contact }: { c: Call; base: string; showSource?: boolean; rep?: string; lite?: boolean; audio?: boolean; hasTranscript?: boolean; contact?: { phone: string; email: string } | null }) {
  const first = lite ? (c.connected ? "Appel décroché" : "Pas de réponse") : c.summary.split("\n").find((l) => l.trim())?.replace(/^-\s*/, "") || (c.connected ? "Appel décroché" : "Pas de réponse");
  const hasTr = hasTranscript ?? (Array.isArray(c.transcript) && (c.transcript as unknown[]).length > 0);
  return (
    <Link className="item" href={`${base}/calls/${c.id}`}>
      <span className={`av ${c.meetingBooked ? "win" : ""}`}>{initials(c)}</span>
      <span className="who">{displayName(c)}{c.company && displayName(c) !== c.company && <span> · {c.company}</span>}</span>
      <span className="meta">{dateFR(c.startedAt)} · {fmtDuration(c.durationSec)}</span>
      <span className="sum">{first}</span>
      {contact && (contact.phone || contact.email) && <span className="coord">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</span>}
      <span className="tags">
        {rep && <span className="pill rep">{rep}</span>}
        {c.kind === "meeting" && <span className="pill warn">RDV AE</span>}
        {c.meetingBooked && <span className="pill win">RDV pris</span>}
        {!c.meetingBooked && c.status === "meeting-rescheduled" && <span className="pill mute">RDV reporté</span>}
        {!c.meetingBooked && c.status === "meeting-followup" && <span className="pill mute">Suivi de RDV</span>}
        {c.optOut && <span className="pill bad">Ne plus contacter</span>}
        {!lite && c.objections.slice(0, 3).map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}
        {!lite && hasTr && <span className="pill">Transcription</span>}
        {!lite && audio && c.durationSec > 0 && (c.recordingUrl || c.recordingKey) && <span className="pill">Audio</span>}
        {showSource && <span className="pill src">{SOURCE_LABEL[c.provider] || c.provider}</span>}
      </span>
    </Link>
  );
}
