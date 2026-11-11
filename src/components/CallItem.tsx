import Link from "next/link";
import type { Call } from "@prisma/client";
import { OBJ_LABEL, dateFR, displayName, fmtDuration, initials } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";

export function CallItem({ c, base, showSource }: { c: Call; base: string; showSource?: boolean }) {
  const first = c.summary.split("\n").find((l) => l.trim())?.replace(/^-\s*/, "") || (c.connected ? "Appel décroché" : "Pas de réponse");
  const hasTr = Array.isArray(c.transcript) && (c.transcript as unknown[]).length > 0;
  return (
    <Link className="item" href={`${base}/calls/${c.id}`}>
      <span className={`av ${c.meetingBooked ? "win" : ""}`}>{initials(c)}</span>
      <span className="who">{displayName(c)}{c.company && displayName(c) !== c.company && <span> · {c.company}</span>}</span>
      <span className="meta">{dateFR(c.startedAt)} · {fmtDuration(c.durationSec)}</span>
      <span className="sum">{first}</span>
      <span className="tags">
        {c.kind === "meeting" && <span className="pill warn">RDV AE</span>}
        {c.meetingBooked && <span className="pill win">RDV pris</span>}
        {c.objections.slice(0, 3).map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}
        {hasTr && <span className="pill">Transcription</span>}
        {(c.recordingUrl || c.recordingKey) && <span className="pill">Audio</span>}
        {showSource && <span className="pill src">{SOURCE_LABEL[c.provider] || c.provider}</span>}
      </span>
    </Link>
  );
}
