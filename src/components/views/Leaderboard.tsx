import Link from "next/link";
import type { Call, Client } from "@prisma/client";
import { fmt, fmtDuration, isConversation, pct } from "@/lib/format";
import { aggFromCalls, slotInsightsAgg, type Agg } from "@/lib/stats";

export const KIND_LABEL: Record<string, string> = { interne: "Interne", freelance: "Freelance", agence: "Agence" };

type Rep = Pick<Client, "id" | "name" | "kind" | "agency">;

/** Classement des commerciaux : ceux de la boîte (par RDV puis conversations puis appels), puis « Non attribués » s'il y en a. */
export function rankRepsAgg(agg: Agg[], reps: Rep[]) {
  return [...reps.map((r) => ({ id: r.id, name: r.name, sub: [KIND_LABEL[r.kind] || "", r.agency].filter(Boolean).join(" · ") })), { id: "", name: "Non attribués", sub: "Appels sans commercial" }]
    .map((r) => {
      const mine = agg.filter((a) => (a.clientId || "") === r.id);
      const sum = (f: (a: Agg) => number) => mine.reduce((n, a) => n + f(a), 0);
      const total = sum((a) => a.total), connected = sum((a) => a.connected);
      return { ...r, total, connected, conv: sum((a) => a.conv), rdv: sum((a) => a.rdv), talk: sum((a) => a.talk), rate: total ? (connected / total) * 100 : 0, best: slotInsightsAgg(mine).hours[0] ?? null };
    })
    .filter((r) => r.id || r.total > 0)
    .sort((a, b) => Number(!a.id) - Number(!b.id) || b.rdv - a.rdv || b.conv - a.conv || b.total - a.total || a.name.localeCompare(b.name));
}
export function rankReps(calls: Pick<Call, "kind" | "clientId" | "connected" | "durationSec" | "meetingBooked" | "startedAt">[], reps: Rep[]) {
  return rankRepsAgg(aggFromCalls(calls), reps);
}

/** Les personnes qui appellent pour un même commercial suivi (les SDR d'une agence, par exemple), d'après leur nom dans l'outil d'appel. */
export function membersAgg(agg: Agg[]) {
  const by = new Map<string, { name: string; total: number; connected: number; conv: number; rdv: number }>();
  for (const a of agg) {
    const name = (a.repName || "").trim();
    if (!name) continue;
    const m = by.get(name.toLowerCase()) || { name, total: 0, connected: 0, conv: 0, rdv: 0 };
    m.total += a.total; m.connected += a.connected; m.conv += a.conv; m.rdv += a.rdv;
    by.set(name.toLowerCase(), m);
  }
  return [...by.values()].sort((a, b) => b.rdv - a.rdv || b.conv - a.conv || b.total - a.total || a.name.localeCompare(b.name));
}
export function membersOf(calls: (Pick<Call, "kind" | "connected" | "durationSec" | "meetingBooked" | "repName"> & { startedAt?: Date })[]) {
  return membersAgg(aggFromCalls(calls.map((c) => ({ startedAt: new Date(0), ...c }))));
}

export function Leaderboard({ agg, reps, href }: { agg: Agg[]; reps: Client[]; href: (clientId: string) => string }) {
  const rows = rankRepsAgg(agg, reps);
  const top = Math.max(1, ...rows.map((r) => r.rdv));
  let rank = 0;
  return (
    <div className="card mt">
      <div className="head"><div><h2>Vos commerciaux</h2><p className="sub">Classés par rendez-vous pris sur la période · meilleure heure = meilleur taux de décroché (20 appels minimum)</p></div><Link className="btn sm" href="/app/clients">Gérer les commerciaux</Link></div>
      {rows.length ? (
        <div className="lb">
          <div className="lb-row lb-h"><span>#</span><span>Commercial</span><span>Appels</span><span>Décroché</span><span>Conversations</span><span>Meilleure heure</span><span>RDV</span></div>
          {rows.map((r) => (
            <Link key={r.id || "none"} className="lb-row" href={r.id ? href(r.id) : "/app/calls?client=none"}>
              <span className="lb-rank">{r.id ? ++rank : "–"}</span>
              <span className="lb-who"><b>{r.name}</b><small>{r.sub}</small></span>
              <span>{fmt(r.total)}</span><span>{pct(r.rate)}</span><span>{fmt(r.conv)}</span><span title={`${fmtDuration(r.talk)} au téléphone`}>{r.best ? <>{r.best.label} <small className="muted">{pct(r.best.rate)}</small></> : <small className="muted">trop peu d&apos;appels</small>}</span>
              <span className="lb-rdv"><b>{fmt(r.rdv)}</b><i style={{ width: `${(r.rdv / top) * 100}%` }} /></span>
            </Link>
          )).flatMap((row, i) => {
            // Plusieurs personnes appellent pour ce commercial (agence, équipe) : le détail de chacune, sous sa ligne.
            const r = rows[i], team = r.id ? membersAgg(agg.filter((a) => a.clientId === r.id)) : [];
            return team.length < 2 ? [row] : [row, ...team.map((m) => (
              <Link key={`${r.id}:${m.name}`} className="lb-row lb-sub" href={`/app/calls?client=${r.id}&q=${encodeURIComponent(m.name)}`}>
                <span aria-hidden="true">↳</span>
                <span className="lb-who"><b>{m.name}</b></span>
                <span>{fmt(m.total)}</span><span>{pct(m.total ? (m.connected / m.total) * 100 : 0)}</span><span>{fmt(m.conv)}</span><span />
                <span className="lb-rdv"><b>{fmt(m.rdv)}</b></span>
              </Link>
            ))];
          })}
        </div>
      ) : <div className="empty"><b>Aucun commercial pour l&apos;instant</b><Link href="/app/clients">Ajoutez vos commerciaux</Link> : chaque appel leur sera attribué automatiquement.</div>}
    </div>
  );
}
