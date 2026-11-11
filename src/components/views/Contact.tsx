import Link from "next/link";
import { notFound } from "next/navigation";
import { callScope, type Scope } from "@/lib/access";
import { activityScope } from "@/lib/channels";
import { db } from "@/lib/db";
import { taskScope } from "@/lib/tasks";
import { OBJ_LABEL, dateFR, displayName, fmtDuration, initials, timeFR } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";
import { SentimentPill, typeLabel } from "./Channels";
import { TaskRow } from "./Relances";
import { NewTask } from "../client/NewTask";

/** Fiche prospect : toute l'histoire, tous canaux confondus. */
export async function Contact({ scope, base, contactKey }: { scope: Scope; base: string; contactKey: string }) {
  const [calls, acts, tasks] = await Promise.all([
    db.call.findMany({ where: { ...callScope(scope), contactKey }, orderBy: { startedAt: "desc" }, take: 200 }),
    db.activity.findMany({ where: { ...activityScope(scope), contactKey }, orderBy: { occurredAt: "desc" }, take: 500 }),
    db.task.findMany({ where: { ...taskScope(scope), contactKey }, orderBy: { dueAt: "asc" } }),
  ]);
  const who = calls[0] || acts[0];
  if (!who) notFound();
  const clientId = scope.kind === "client" ? scope.clientId : null;
  const job = calls.find((c) => c.jobTitle)?.jobTitle || acts.find((a) => a.jobTitle)?.jobTitle || "";
  const items = [
    ...calls.map((c) => ({ at: c.startedAt, key: c.id, node: (
      <Link className="item" href={`${base}/calls/${c.id}`}><span className={`av ${c.meetingBooked ? "win" : ""}`} style={{ fontSize: 13 }}>☎</span>
        <span className="who">{c.kind === "meeting" ? "Rendez-vous AE" : c.connected ? "Appel" : "Appel sans réponse"}<span> · {fmtDuration(c.durationSec)}{c.repName ? ` · ${c.repName}` : ""}</span></span>
        <span className="meta">{dateFR(c.startedAt)} {timeFR(c.startedAt)}</span>
        {c.summary && <span className="sum">{c.summary.replace(/^-\s*/gm, "").split("\n").slice(0, 2).join(" — ")}</span>}
        <span className="tags">{c.meetingBooked && <span className="pill win">RDV pris</span>}{c.objections.map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}<span className="pill src">{SOURCE_LABEL[c.provider] || c.provider}</span></span></Link>) })),
    ...acts.filter((a) => a.type !== "opened" && a.type !== "clicked").map((a) => ({ at: a.occurredAt, key: a.id, node: (
      <div className="item"><span className="av" style={{ fontSize: 12 }}>{a.channel === "linkedin" ? "in" : "@"}</span>
        <span className="who">{typeLabel(a)}{a.subject && <span> · {a.subject}</span>}</span>
        <span className="meta">{dateFR(a.occurredAt)} {timeFR(a.occurredAt)}</span>
        {a.body && <span className="sum" style={{ WebkitLineClamp: 6, whiteSpace: "pre-line" }}>{a.body.slice(0, 1200)}</span>}
        <span className="tags"><SentimentPill s={a.sentiment} />{a.objections.map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}{a.campaign && <span className="pill src">{a.campaign}</span>}<span className="pill src">{SOURCE_LABEL[a.provider] || a.provider}</span></span></div>) })),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());
  const opens = acts.filter((a) => a.type === "opened").length;
  return (
    <div className="grid g-2">
      <div className="card">
        <div className="row" style={{ gap: 14, marginBottom: 14 }}>
          <span className="av" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(who)}</span>
          <div><h2 style={{ fontSize: 24 }}>{displayName(who)}</h2><p className="muted" style={{ margin: "2px 0 0" }}>{[job, who.company].filter(Boolean).join(" · ")}</p></div>
          <span className="spacer" /><Link className="btn primary" href={`${base}/brief?q=${encodeURIComponent(displayName(who))}`}>Préparer le brief</Link>
        </div>
        <p className="muted small" style={{ margin: "0 0 8px" }}>{calls.length} appel(s) · {acts.filter((a) => a.channel === "email" && a.type !== "opened").length} email(s) · {acts.filter((a) => a.channel === "linkedin").length} action(s) LinkedIn{opens ? ` · ${opens} ouverture(s)` : ""}</p>
        <div className="list">{items.map((i) => <div key={i.key} style={{ display: "contents" }}>{i.node}</div>)}</div>
      </div>
      <div className="stack">
        <div className="card"><h2>Relances</h2><p className="sub">Pour ce prospect</p>
          {tasks.length ? <div className="list">{tasks.map((t) => <TaskRow key={t.id} t={t} base={base} clientId={clientId} />)}</div> : <p className="muted">Aucune relance.</p>}
          <div style={{ marginTop: 14 }}><NewTask contactKey={contactKey} clientId={clientId} /></div>
        </div>
      </div>
    </div>
  );
}
