import Link from "next/link";
import type { Scope } from "@/lib/access";
import { computeStats, windowCalls } from "@/lib/stats";
import { OBJ_LABEL, fmt, fmtDuration, isConversation, pct } from "@/lib/format";
import { CallItem } from "../CallItem";
import { ChannelOverview } from "./Channels";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const HRS = Array.from({ length: 12 }, (_, i) => i + 8);

/** `channels={false}` : téléphone seul (lien de suivi partagé), sans le résumé emails / LinkedIn. */
export async function Dashboard({ scope, base, days, emptyHint, channels = true }: { scope: Scope; base: string; days: number; emptyHint: React.ReactNode; channels?: boolean }) {
  const calls = await windowCalls(scope, days);
  const overview = channels ? <ChannelOverview scope={scope} days={days} base={base} /> : null;
  if (!calls.length) return <>{overview}<div className="card"><div className="empty"><b>Pas encore d&apos;appels sur cette période</b>{emptyHint}</div></div></>;
  const s = computeStats(calls, days);
  const perMeet = s.meetings ? Math.round(s.total / s.meetings) : null;

  // Courbe d'activité
  const W = 1000, H = 190, N = s.daily.length;
  const vals = s.daily.map((d) => d.conversations), mx = Math.max(2, ...vals);
  const x = (i: number) => (N === 1 ? W / 2 : (i / (N - 1)) * W), y = (v: number) => H - 8 - (v / mx) * (H - 26);
  let line = "";
  vals.forEach((v, i) => {
    if (!i) line = `M${x(i)},${y(v)}`;
    else { const cx = (x(i - 1) + x(i)) / 2; line += ` C${cx},${y(vals[i - 1])} ${cx},${y(v)} ${x(i)},${y(v)}`; }
  });
  const lab = (i: number) => new Date(s.daily[i].day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  const steps: [string, number][] = [["Appels", s.total], ["Décrochés", s.connected], ["Conversations", s.conversations], ["Rendez-vous", s.meetings]];
  const omx = Math.max(1, ...s.objections.map((o) => o.count));
  const hmax = Math.max(1, ...Object.values(s.heat));
  const best = Object.entries(s.heat).sort((a, b) => b[1] - a[1])[0];
  const feed = calls.filter((c) => isConversation(c) || c.kind === "meeting").slice(0, 7);
  const multiSource = new Set(calls.map((c) => c.provider)).size > 1;

  return (
    <>
      {overview}
      <div className="grid g-kpi">
        <div className="card kpi hero"><div className="lab"><i style={{ ["--c" as string]: "#7CF0C5" }} />Rendez-vous pris</div><div className="val">{fmt(s.meetings)}</div><div className="foot">{perMeet ? `1 RDV tous les ${perMeet} appels` : "Aucun RDV sur la période"}</div></div>
        <div className="card kpi"><div className="lab"><i />Appels passés</div><div className="val">{fmt(s.total)}</div><div className="foot">{fmtDuration(s.talkSec)} au téléphone</div></div>
        <div className="card kpi"><div className="lab"><i style={{ ["--c" as string]: "var(--sky)" }} />Taux de décroché</div><div className="val">{pct(s.connectRate)}</div><div className="foot">{fmt(s.connected)} décrochés · {fmt(s.conversations)} conversations</div></div>
        <div className="card kpi"><div className="lab"><i style={{ ["--c" as string]: "var(--amber)" }} />Conversation → RDV</div><div className="val">{pct(s.convToMeeting)}</div><div className="foot">{fmtDuration(s.avgConvSec)} par conversation</div></div>
      </div>

      <div className="grid g-hero mt">
        <div className="card">
          <div className="head"><div><h2>Activité</h2><p className="sub">Conversations par jour · les points verts sont les RDV</p></div>
            <div className="legend"><span><i style={{ background: "var(--blue)" }} />Conversations</span><span><i style={{ background: "var(--mint)", borderRadius: "50%" }} />RDV</span></div></div>
          <div className="chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2E5BFF" stopOpacity=".22" /><stop offset="1" stopColor="#2E5BFF" stopOpacity="0" /></linearGradient>
                <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stopColor="#2E5BFF" /><stop offset="1" stopColor="#1FA2E6" /></linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={y(mx * g)} y2={y(mx * g)} stroke="rgba(11,18,47,.08)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />)}
              <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#ga)" />
              <path d={line} fill="none" stroke="url(#gl)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {s.daily.map((d, i) => d.meetings ? <span key={d.day} className="m" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(vals[i]) / H) * 100}%` }} /> : null)}
            <div className="cols">{s.daily.map((d) => <div key={d.day} data-tip={`${new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${d.conversations} conv.${d.meetings ? ` · ${d.meetings} RDV` : ""}`} />)}</div>
          </div>
          <div className="axis"><span>{lab(0)}</span><span>{lab(Math.floor((N - 1) / 2))}</span><span>{lab(N - 1)}</span></div>
        </div>
        <div className="card"><h2>Entonnoir</h2><p className="sub">Du premier appel au rendez-vous</p>
          <div className="funnel">{steps.map(([n, v], i) => (
            <div key={n} className={`frow ${i === 3 ? "win" : ""}`}><span className="nm">{n}</span><span className="nb">{fmt(v)}{i > 0 && <em>{pct(steps[i - 1][1] ? (v / steps[i - 1][1]) * 100 : 0)}</em>}</span><div className="track"><i style={{ width: `${Math.max(1, (v / (steps[0][1] || 1)) * 100)}%` }} /></div></div>
          ))}</div>
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="head"><div><h2>Dernières conversations</h2><p className="sub">Elles arrivent ici dès qu&apos;elles sont synchronisées</p></div><Link className="btn sm" href={`${base}/calls`}>Tout voir</Link></div>
          {feed.length ? <div className="list">{feed.map((c) => <CallItem key={c.id} c={c} base={base} showSource={multiSource} />)}</div> : <div className="empty">Aucune conversation sur la période.</div>}
        </div>
        <div className="stack">
          <div className="card"><h2>Objections</h2><p className="sub">Les plus fréquentes et la part passée</p>
            {s.objections.length ? <>{s.objections.slice(0, 6).map((o) => (
              <div key={o.key} className="obj"><span>{OBJ_LABEL[o.key] || o.key}</span><div className="bar" style={{ width: `${(o.count / omx) * 100}%` }}><i style={{ width: `${o.passedRate ?? 0}%` }} /></div><span className="n">{o.count}</span></div>
            ))}<div className="legend" style={{ marginTop: 12 }}><span><i style={{ background: "var(--mint)" }} />Passée</span><span><i style={{ background: "rgba(221,63,85,.3)" }} />Non passée ou inconnue</span></div></> : <div className="empty">Aucune objection détectée.</div>}
          </div>
          <div className="card"><h2>Quand ça décroche</h2><p className="sub">Conversations par jour et par heure</p>
            <div className="heat"><span />{HRS.map((h) => <label key={h} style={{ textAlign: "center" }}>{h % 2 ? "" : `${h}h`}</label>)}
              {DAYS.map((d, di) => [<label key={d}>{d}</label>, ...HRS.map((h) => { const v = s.heat[`${di}-${h}`] || 0; return <div key={`${d}${h}`} className="cell" data-tip={v ? `${d} ${h}h · ${v} conv.` : undefined} style={v ? { background: `rgba(46,91,255,${0.18 + (0.82 * v) / hmax})` } : undefined} />; })])}
            </div>
            <p className="sub" style={{ margin: "14px 0 0" }}>{best ? <>Meilleur créneau : <b style={{ color: "var(--ink)" }}>{DAYS[+best[0].split("-")[0]]} {best[0].split("-")[1]}h</b>, heure de Paris.</> : "Pas encore assez de conversations."}</p>
          </div>
        </div>
      </div>

      {s.reps.length > 0 && (
        <div className="card mt"><h2>Équipe</h2><p className="sub">Performance par commercial</p>
          <div className="scroll-x"><table><thead><tr><th>Commercial</th><th>Appels</th><th>Décroché</th><th>Conv.</th><th>RDV</th></tr></thead>
            <tbody>{s.reps.map((r) => <tr key={r.name}><td>{r.name}</td><td>{fmt(r.total)}</td><td>{pct(r.total ? (r.connected / r.total) * 100 : 0)}</td><td>{fmt(r.conversations)}</td><td>{fmt(r.meetings)}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </>
  );
}
