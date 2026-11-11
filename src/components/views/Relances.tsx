import Link from "next/link";
import type { Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { followUps, windowCalls } from "@/lib/stats";
import { dateFR, displayName, initials } from "@/lib/format";
import { FollowUpToggle } from "../client/FollowUpToggle";

export async function countFollowUps(scope: Scope) {
  const calls = await windowCalls(scope, 120);
  const items = followUps(calls);
  if (!items.length) return 0;
  const done = await db.followUp.findMany({ where: { orgId: scope.orgId, contactKey: { in: items.map((i) => i.call.contactKey) } }, select: { contactKey: true } });
  return items.length - done.length;
}

export async function Relances({ scope, base }: { scope: Scope; base: string }) {
  const items = followUps(await windowCalls(scope, 120));
  const done = new Set((await db.followUp.findMany({ where: { orgId: scope.orgId, contactKey: { in: items.map((i) => i.call.contactKey) } } })).map((d) => d.contactKey));
  const todo = items.filter((i) => !done.has(i.call.contactKey)), finished = items.filter((i) => done.has(i.call.contactKey));
  const clientId = scope.kind === "client" ? scope.clientId : null;
  const Row = ({ i, isDone }: { i: (typeof items)[number]; isDone: boolean }) => (
    <div className="item">
      <span className="av">{initials(i.call)}</span>
      <span className="who">{displayName(i.call)} <span>· {[i.call.company, i.call.jobTitle].filter(Boolean).join(" · ")}</span></span>
      <span>{i.type === "rappel" ? <span className="pill warn">Rappel{i.when && !/rappel/i.test(i.when) ? ` · ${i.when}` : ""}</span> : <span className="pill">Email demandé</span>}</span>
      <span className="sum">{i.call.summary.replace(/^-\s*/gm, "").split("\n").slice(0, 2).join(" — ")}</span>
      <span className="tags"><span className="meta" style={{ textAlign: "left" }}>Dernier échange le {dateFR(i.call.startedAt)}</span><span className="spacer" />
        <Link className="btn sm" href={`${base}/calls/${i.call.id}`}>Voir l&apos;appel</Link>
        <Link className="btn sm" href={`${base}/brief?q=${encodeURIComponent(displayName(i.call))}`}>Préparer</Link>
        <FollowUpToggle contactKey={i.call.contactKey} done={isDone} clientId={clientId} />
      </span>
    </div>
  );
  return (
    <>
      <div className="card"><h2>À relancer · {todo.length}</h2><p className="sub">Repéré automatiquement dans les résumés : rappels demandés, emails ou documents à envoyer. L&apos;état est partagé avec votre équipe.</p>
        {todo.length ? <div className="list">{todo.map((i) => <Row key={i.call.id} i={i} isDone={false} />)}</div> : <div className="empty"><b>Tout est à jour</b>Aucune relance en attente.</div>}
      </div>
      {finished.length > 0 && <div className="card mt"><h2>Traitées · {finished.length}</h2><div className="list" style={{ marginTop: 10 }}>{finished.map((i) => <Row key={i.call.id} i={i} isDone />)}</div></div>}
    </>
  );
}
