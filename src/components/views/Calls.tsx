import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { callScope, type Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { OBJ_LABEL } from "@/lib/format";
import { CallItem } from "../CallItem";

const FILTERS: Record<string, { label: string; where: Prisma.CallWhereInput }> = {
  conv: { label: "Conversations", where: { connected: true, durationSec: { gte: 30 } } },
  rdv: { label: "RDV pris", where: { meetingBooked: true } },
  ae: { label: "Rendez-vous AE", where: { kind: "meeting" } },
  tr: { label: "Avec transcription", where: { NOT: { transcript: { equals: [] } } } },
  all: { label: "Tous les appels", where: {} },
};

export async function Calls({ scope, base, days, q, f, obj }: { scope: Scope; base: string; days: number; q: string; f: string; obj: string }) {
  const filter = FILTERS[f] ? f : "conv";
  const where: Prisma.CallWhereInput = {
    ...callScope(scope),
    startedAt: { gte: new Date(Date.now() - days * 864e5) },
    ...FILTERS[filter].where,
    ...(obj ? { objections: { has: obj } } : {}),
    ...(q ? { OR: ["firstName", "lastName", "company", "jobTitle", "summary", "repName"].map((k) => ({ [k]: { contains: q, mode: "insensitive" } })) } : {}),
  };
  const [calls, count, sources] = await Promise.all([
    db.call.findMany({ where, orderBy: { startedAt: "desc" }, take: 200 }),
    db.call.count({ where }),
    db.call.groupBy({ by: ["provider"], where: callScope(scope) }),
  ]);
  const href = (p: Record<string, string>) => {
    const sp = new URLSearchParams({ days: String(days), ...(q ? { q } : {}), f: filter, ...(obj ? { obj } : {}), ...p });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    return `${base}/calls?${sp}`;
  };
  return (
    <div className="card">
      <form className="filters" action={`${base}/calls`}>
        <input type="hidden" name="days" value={days} /><input type="hidden" name="f" value={filter} />
        <input className="input" style={{ flex: "1 1 260px" }} type="search" name="q" defaultValue={q} placeholder="Prospect, entreprise, mot-clé…" aria-label="Rechercher" />
        <button className="btn">Rechercher</button>
        <Link className="btn primary" href={`${base}/sources#ajout`}>+ Ajouter un appel</Link>
      </form>
      <div className="filters">
        {Object.entries(FILTERS).map(([k, v]) => <Link key={k} className="chip" href={href({ f: k })} aria-current={k === filter && !obj ? "true" : undefined}>{v.label}</Link>)}
        {Object.keys(OBJ_LABEL).map((k) => <Link key={k} className="chip" href={href({ obj: obj === k ? "" : k })} aria-current={obj === k ? "true" : undefined}>{OBJ_LABEL[k]}</Link>)}
      </div>
      <p className="muted small" style={{ margin: "2px 0 8px" }}>{count} appel(s){count > 200 ? " · 200 plus récents affichés" : ""}</p>
      {calls.length ? <div className="list">{calls.map((c) => <CallItem key={c.id} c={c} base={base} showSource={sources.length > 1} />)}</div> : <div className="empty">Aucun appel ne correspond.</div>}
    </div>
  );
}
