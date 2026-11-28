import { FastLink } from "@/components/client/FastLink";
import Link from "next/link";
import { planOf } from "@/lib/plan";
import type { Call, Prisma } from "@prisma/client";
import { withTranscript } from "@/lib/stats";
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

const PAGE = 50, MAX = 500;

export async function Calls({ scope, base, days, q, f, obj, n, readOnly = false }: { scope: Scope; base: string; days: number; q: string; f: string; obj: string; n?: string; readOnly?: boolean }) {
  // 50 appels d'abord (affichage immédiat), puis « voir plus » par tranches de 50.
  const shown = Math.min(MAX, Math.max(PAGE, Math.ceil((Number(n) || PAGE) / PAGE) * PAGE));
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
    // Sans les colonnes lourdes que la liste n'affiche pas (transcriptions, analyses, coordonnées) : seule l'étiquette « Transcription » est calculée, plus bas.
    db.call.findMany({ where, orderBy: { startedAt: "desc" }, take: shown, omit: { transcript: true, debrief: true, objDetails: true, aiSummary: true, contactSealed: true } }).then((rows) => rows.map((r) => ({ ...r, transcript: [], debrief: null, objDetails: [], aiSummary: "", contactSealed: null }) as Call)),
    db.call.count({ where }),
    db.call.groupBy({ by: ["provider"], where: callScope(scope) }),
    isBoss ? db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const repName = new Map(reps.map((r) => [r.id, r.name]));
  const trIds = await withTranscript(calls.map((c) => c.id));
  const current = isBoss ? scope.clientFilter || "" : "";
  const href = (p: Record<string, string>) => {
    const sp = new URLSearchParams({ days: String(days), ...(q ? { q } : {}), f: filter, ...(obj ? { obj } : {}), ...(current ? { client: current } : {}), ...p });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    return `${base}/calls?${sp}`;
  };
  const plan = await planOf(scope.orgId), lite = !plan.ai;
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
          <FastLink className="chip" href={href({ client: "" })} current={!current}>Tous les commerciaux</FastLink>
          {reps.map((r) => <FastLink key={r.id} className="chip" href={href({ client: r.id })} current={current === r.id}>{r.name}</FastLink>)}
          <FastLink className="chip" href={href({ client: "none" })} current={current === "none"}>Non attribués</FastLink>
        </div>
      )}
      <div className="filters">
        {Object.entries(FILTERS).map(([k, v]) => <FastLink key={k} className="chip" href={href({ f: k })} current={k === filter && !obj} eager>{v.label}</FastLink>)}
        {Object.keys(OBJ_LABEL).map((k) => <FastLink key={k} className="chip" href={href({ obj: obj === k ? "" : k })} current={obj === k}>{OBJ_LABEL[k]}</FastLink>)}
      </div>
      <p className="muted small" style={{ margin: "2px 0 8px" }}>{count} appel(s){count > shown ? ` · ${shown} plus récents affichés` : ""}</p>
      {calls.length ? <div className="list">{calls.map((c) => <CallItem key={c.id} c={c} base={base} lite={lite} audio={plan.premium} hasTranscript={trIds.has(c.id)} showSource={sources.length > 1} rep={isBoss ? (c.clientId && repName.get(c.clientId)) || c.repName || undefined : undefined} />)}</div> : <div className="empty">Aucun appel ne correspond.</div>}
      {count > shown && shown < MAX && <p style={{ textAlign: "center", margin: "14px 0 0" }}><Link className="btn" href={href({ n: String(shown + PAGE) })} scroll={false} prefetch>Voir {Math.min(PAGE, count - shown)} appels de plus</Link></p>}
    </div>
    </>
  );
}
