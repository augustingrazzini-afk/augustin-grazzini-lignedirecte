import Link from "next/link";
import type { Task } from "@prisma/client";
import type { Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { taskScope } from "@/lib/tasks";
import { CHANNEL_LABEL } from "@/lib/providers";
import { TaskActions } from "../client/TaskActions";
import { CopyButton } from "../client/CallActions";

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

/** Nombre de relances à faire aujourd'hui ou en retard (pastille du menu). */
export async function countDueTasks(scope: Scope) {
  return db.task.count({ where: { ...taskScope(scope), status: "open", dueAt: { lte: endOfToday() } } });
}

const dueLabel = (d: Date) => {
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  if (days < 0) return { text: days === -1 ? "En retard d'1 jour" : `En retard de ${-days} jours`, cls: "bad" };
  if (days === 0) return { text: "Aujourd'hui", cls: "warn" };
  if (days === 1) return { text: "Demain", cls: "mute" };
  return { text: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }), cls: "mute" };
};
const SRC: Record<string, string> = { ai: "IA", rule: "Règle", manual: "Manuel" };

export function TaskRow({ t, base, clientId }: { t: Task; base: string; clientId: string | null }) {
  const due = dueLabel(t.dueAt);
  return (
    <div className="item" style={{ gridTemplateColumns: "38px minmax(0,1fr) auto" }}>
      <span className={`av ${t.channel === "linkedin" ? "" : t.channel === "email" ? "" : "win"}`} title={CHANNEL_LABEL[t.channel]} style={{ fontSize: 11 }}>{t.channel === "linkedin" ? "in" : t.channel === "email" ? "@" : "☎"}</span>
      <Link className="who" href={`${base}/contacts/${encodeURIComponent(t.contactKey)}`} style={{ color: "inherit", textDecoration: "none" }}>{t.contactName || t.company || "Prospect"}{t.company && t.contactName && <span> · {t.company}</span>}</Link>
      <span className="row" style={{ gap: 6 }}>{t.status === "open" ? <span className={`pill ${due.cls}`}>{due.text}</span> : <span className="pill win">{t.status === "done" ? "Faite" : "Ignorée"}</span>}<span className="pill src">{CHANNEL_LABEL[t.channel]}</span></span>
      <span className="sum" style={{ WebkitLineClamp: 3 }}>{t.reason}<span style={{ color: "var(--dim)" }}> · {SRC[t.source] || t.source}</span></span>
      {t.suggestion && (
        <details className="tags" style={{ display: "block" }}><summary className="muted small" style={{ cursor: "pointer" }}>Message proposé</summary>
          <div className="row" style={{ marginTop: 8, alignItems: "flex-start" }}><p className="small" style={{ margin: 0, flex: 1, whiteSpace: "pre-line", background: "#F7F9FE", border: "1px solid var(--stroke)", borderRadius: 10, padding: "10px 12px" }}>{t.suggestion}</p><CopyButton text={t.suggestion} /></div>
        </details>
      )}
      <span className="tags"><span className="spacer" /><TaskActions id={t.id} status={t.status} clientId={clientId} /></span>
    </div>
  );
}

export async function Relances({ scope, base }: { scope: Scope; base: string }) {
  const clientId = scope.kind === "client" ? scope.clientId : null;
  const where = taskScope(scope);
  const [open, done] = await Promise.all([
    db.task.findMany({ where: { ...where, status: "open" }, orderBy: { dueAt: "asc" }, take: 300 }),
    db.task.findMany({ where: { ...where, status: { in: ["done", "dismissed"] } }, orderBy: { doneAt: "desc" }, take: 30 }),
  ]);
  const eod = endOfToday(), week = new Date(eod.getTime() + 7 * 864e5), sod = new Date(eod.getTime() - 864e5 + 1);
  const groups: [string, Task[], string][] = [
    ["En retard", open.filter((t) => t.dueAt < sod), "Relances dont la date est passée"],
    ["Aujourd'hui", open.filter((t) => t.dueAt >= sod && t.dueAt <= eod), "À faire dans la journée"],
    ["Cette semaine", open.filter((t) => t.dueAt > eod && t.dueAt <= week), "Les 7 prochains jours"],
    ["Plus tard", open.filter((t) => t.dueAt > week), "Rappels programmés à plus long terme"],
  ];
  return (
    <div className="stack">
      <div className="grid g-kpi">
        {groups.map(([label, list], i) => (
          <div key={label} className={`card kpi ${i === 0 && list.length ? "" : ""}`}><div className="lab"><i style={{ ["--c" as string]: i === 0 ? "var(--rose)" : i === 1 ? "var(--amber)" : "var(--blue)" }} />{label}</div><div className="val" style={i === 0 && list.length ? { color: "var(--rose)" } : undefined}>{list.length}</div></div>
        ))}
      </div>
      {open.length === 0 && <div className="card"><div className="empty"><b>Aucune relance en attente</b>Elles sont créées automatiquement à partir des appels, des réponses email et de LinkedIn.</div></div>}
      {groups.filter(([, l]) => l.length).map(([label, list, sub]) => (
        <div key={label} className="card"><h2>{label} · {list.length}</h2><p className="sub">{sub}</p><div className="list">{list.map((t) => <TaskRow key={t.id} t={t} base={base} clientId={clientId} />)}</div></div>
      ))}
      {done.length > 0 && (
        <details className="card"><summary style={{ cursor: "pointer" }}><h2 style={{ display: "inline" }}>Traitées récemment · {done.length}</h2></summary>
          <div className="list" style={{ marginTop: 12 }}>{done.map((t) => <TaskRow key={t.id} t={t} base={base} clientId={clientId} />)}</div></details>
      )}
    </div>
  );
}
