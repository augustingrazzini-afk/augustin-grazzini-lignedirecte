import Link from "next/link";
import { callScope, type Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { dateFR, displayName } from "@/lib/format";
import { storageEnabled } from "@/lib/storage";
import type { Debrief } from "@/lib/ai";
import { ManualAdd } from "../client/ManualAdd";
import { CsvImport } from "../client/CsvImport";

/** Rendez-vous menés par le client (ou l'AE) : liste avec le débrief IA, et ajout à la main ou par CSV. */
export async function Meetings({ scope, base, shareToken }: { scope: Scope; base: string; shareToken?: string }) {
  const meetings = await db.call.findMany({ where: { ...callScope(scope), kind: "meeting" }, orderBy: { startedAt: "desc" }, take: 60 });
  const scored = meetings.map((m) => (m.debrief as unknown as Debrief | null)?.score).filter((x): x is number => typeof x === "number");
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const clientId = scope.kind === "client" ? scope.clientId : null;
  return (
    <div className="grid g-2">
      <div className="stack">
        <div className="card">
          <div className="head"><div><h2>Vos rendez-vous</h2><p className="sub">{meetings.length} rendez-vous{avg !== null ? ` · note moyenne ${avg.toFixed(1).replace(".", ",")}/10` : ""}</p></div></div>
          {meetings.length ? (
            <div className="list">{meetings.map((m) => {
              const d = m.debrief as unknown as Debrief | null;
              return (
                <Link key={m.id} className="item" href={`${base}/calls/${m.id}`}>
                  <span className={`av ${d && d.score >= 7 ? "win" : ""}`}>{d ? d.score : "…"}</span>
                  <span className="who">{displayName(m)}<span> · {m.company || "—"}</span></span>
                  <span className="meta">{dateFR(m.startedAt)}</span>
                  <span className="sum">{d ? d.verdict : m.aiStatus === "pending" || m.transcriptStatus === "pending" ? "Débrief en préparation…" : m.summary ? "Débrief en préparation…" : "Ajoutez la transcription ou vos notes pour obtenir le débrief."}</span>
                </Link>
              );
            })}</div>
          ) : (
            <div className="empty"><b>Aucun rendez-vous pour l&apos;instant</b>Ajoutez vos rendez-vous à droite : l&apos;IA fait le débrief de chacun (ce qui a marché, ce qui a manqué, conseils) et le relie à l&apos;appel de prospection qui l&apos;a obtenu.</div>
          )}
        </div>
      </div>
      <div className="stack">
        <ManualAdd clientId={clientId} uploads={!shareToken && storageEnabled()} only="meeting" shareToken={shareToken} />
        <CsvImport clientId={clientId} kind="meeting" shareToken={shareToken} />
      </div>
    </div>
  );
}
