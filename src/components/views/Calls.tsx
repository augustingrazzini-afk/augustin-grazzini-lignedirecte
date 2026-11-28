import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { callScope, type Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { OBJ_LABEL } from "@/lib/format";
import { CallItem } from "../CallItem";
import { periodStart } from "@/lib/period";

const FILTERS: Record<string, { label: string; where: Prisma.CallWhereInput }> = {
  conv: { label: "Conversations", where: { connected: true, durationSec: { gte: 30 } } },
  rdv: { label: "RDV pris", where: { meetingBooked: true } },
  ae: { label: "Rendez-vous AE", where: { kind: "meeting" } },
  tr: { label: "Avec transcription", where: { NOT: { transcript: { equals: [] } } } },
  all: { label: "Tous les appels", where: {} },
};

export async function Calls({ scope, base, days, q, f, obj, readOnly = false }: { scope: Scope; base: string; days: number; q: string; f: string; obj: string; readOnly?: boolean }) {
  const filter = FILTERS[f] ? f : "conv";
  const where: Prisma.CallWhereInput = {
    ...callScope(scope),
    startedAt: { gte: periodStart(days) },
    ...FILTERS[filter].where,
    ...(obj ? { objections: { has: obj } } : {}),
    ...(q ? { OR: ["firstName", "lastName", "company", "jobTitle", "summary", "repName"].map((k) => ({ [k]: { contains: q, mode: "insensitive" } })) } : {}),
  };
  const isBoss = scope.kind === "org";
  const [calls, count, sources, reps] = await Promise.all([
    db.call.findMany({ where, orderBy: { startedAt: "desc" }, take: 200 }),
    db.call.count({ where }),
    db.call.groupBy({ by: ["provider"], where: callScope(scope) }),
    isBoss ? db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const repName = new Map(reps.map((r) => [r.id, r.name]));
  const current = isBoss ? scope.clientFilter || "" : "";
  const href = (p: Record<string, string>) => {
    const sp = new URLSearchParams({ days: String(days), ...(q ? { q } : {}), f: filter, ...(obj ? { obj } : {}), ...(current ? { client: current } : {}), ...p });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    return `${base}/calls?${sp}`;
  };
  // Appels que l'entreprise a envoyés à ce commercial pour qu'il les écoute.
  const shared = scope.kind === "client" && !readOnly ? await db.callShare.findMany({ where: { clientId: scope.clientId, call: { orgId: scope.orgId } }, include: { call: { select: { id: true, firstName: true, lastName: true, company: true, repName: true, summary: true } } }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
  return (
    <>
    {shared.length > 0 && (
      <div className="card shared-note" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Appels à écouter · {shared.length}</h2>
        <p className="sub">Envoyés par votre entreprise : de bons exemples, ou des points à travailler.</p>
        <div className="list">{shared.map((x) => (
          <Link key={x.id} className="item" href={`${base}/calls/${x.call.id}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <span className="who">{[x.call.firstName, x.call.lastName].filter(Boolean).join(" ") || x.call.company || "Prospect"}{x.call.repName && <span> · appel de {x.call.repName}</span>}</span>
            <span className="meta">{x.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })}</span>
            <span className="sum">{x.note ? `« ${x.note} »` : x.call.summary || "Ouvrir l'appel"}</span>
          </Link>
        ))}</div>
      </div>
    )}
    <div className="card">
      <form className="filters" action={`${base}/calls`}>
        <input type="hidden" name="days" value={days} /><input type="hidden" name="f" value={filter} />{current && <input type="hidden" name="client" value={current} />}
        <input className="input" style={{ flex: "1 1 260px" }} type="search" name="q" defaultValue={q} placeholder="Prospect, entreprise, mot-clé…" aria-label="Rechercher" />
        <button className="btn">Rechercher</button>
        {!readOnly && isBoss && <Link className="btn primary" href={`${base}/sources#ajout`}>+ Ajouter un appel</Link>}
      </form>
      {isBoss && reps.length > 0 && (
        <div className="filters" aria-label="Commercial">
          <Link className="chip" href={href({ client: "" })} aria-current={!current ? "true" : undefined}>Tous les commerciaux</Link>
          {reps.map((r) => <Link key={r.id} className="chip" href={href({ client: r.id })} aria-current={current === r.id ? "true" : undefined}>{r.name}</Link>)}
          <Link className="chip" href={href({ client: "none" })} aria-current={current === "none" ? "true" : undefined}>Non attribués</Link>
        </div>
      )}
      <div className="filters">
        {Object.entries(FILTERS).map(([k, v]) => <Link key={k} className="chip" href={href({ f: k })} aria-current={k === filter && !obj ? "true" : undefined}>{v.label}</Link>)}
        {Object.keys(OBJ_LABEL).map((k) => <Link key={k} className="chip" href={href({ obj: obj === k ? "" : k })} aria-current={obj === k ? "true" : undefined}>{OBJ_LABEL[k]}</Link>)}
      </div>
      <p className="muted small" style={{ margin: "2px 0 8px" }}>{count} appel(s){count > 200 ? " · 200 plus récents affichés" : ""}</p>
      {calls.length ? <div className="list">{calls.map((c) => <CallItem key={c.id} c={c} base={base} showSource={sources.length > 1} rep={isBoss ? (c.clientId && repName.get(c.clientId)) || c.repName || undefined : undefined} />)}</div> : <div className="empty">Aucun appel ne correspond.</div>}
    </div>
    </>
  );
}
