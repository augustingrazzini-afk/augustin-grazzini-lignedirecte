import Link from "next/link";
import type { Activity } from "@prisma/client";
import type { Scope } from "@/lib/access";
import { channelOverview, emailStats, linkedinStats, windowActivities } from "@/lib/channels";
import { OBJ_LABEL, dateFR, displayName, fmt, initials, pct } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";
import { periodText } from "@/lib/period";

const SENT: Record<string, [string, string]> = { positive: ["Positive", "win"], neutral: ["Neutre", "mute"], negative: ["Refus", "bad"], ooo: ["Absent", "warn"], objection: ["Objection", "warn"] };
const TYPE_LABEL: Record<string, string> = { sent: "Email envoyé", opened: "Email ouvert", clicked: "Lien cliqué", replied: "Réponse", bounced: "Bounce", unsubscribed: "Désinscription", invite_sent: "Invitation envoyée", invite_accepted: "Invitation acceptée", message_sent: "Message envoyé", profile_visit: "Visite de profil", meeting_booked: "RDV pris" };
export const typeLabel = (a: Pick<Activity, "type" | "channel">) => (a.type === "replied" ? (a.channel === "linkedin" ? "Réponse LinkedIn" : "Réponse email") : TYPE_LABEL[a.type] || a.type);

export function SentimentPill({ s }: { s: string | null }) {
  if (!s || !SENT[s]) return null;
  return <span className={`pill ${SENT[s][1]}`}>{SENT[s][0]}</span>;
}

/** Bandeau multicanal du pilotage : un bloc par canal. */
export async function ChannelOverview({ scope, days, base }: { scope: Scope; days: number; base: string }) {
  const o = await channelOverview(scope, days);
  if (!o.hasEmail && !o.hasLinkedin) return null;
  const total = o.call.meetings + o.email.meetings + o.linkedin.meetings || 1;
  const card = (href: string, title: string, color: string, rows: [string, string][], meetings: number) => (
    <Link href={href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="row"><span className="logo-src" style={{ width: 34, height: 34, fontSize: 13, background: color }}>{title === "LinkedIn" ? "in" : title === "Emails" ? "@" : "☎"}</span><h2>{title}</h2><span className="spacer" /><span className="pill win">{meetings} RDV</span></div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginTop: 14, gap: 10 }}>
        {rows.map(([l, v]) => <div key={l}><div style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 600 }}>{v}</div><div className="muted small">{l}</div></div>)}
      </div>
    </Link>
  );
  return (
    <div className="stack" style={{ marginBottom: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {card(`${base}/calls`, "Appels", "linear-gradient(135deg,#1FB985,#0F9F6E)", [["appels", fmt(o.call.total)], ["conversations", fmt(o.call.conversations)], ["taux RDV", pct(o.call.conversations ? (o.call.meetings / o.call.conversations) * 100 : 0)]], o.call.meetings)}
        {o.hasEmail && card(`${base}/emails`, "Emails", "linear-gradient(135deg,#4A72FF,#2E5BFF)", [["prospects", fmt(o.email.contacts)], ["réponses", pct(o.email.replyRate)], ["positives", fmt(o.email.positive)]], o.email.meetings)}
        {o.hasLinkedin && card(`${base}/linkedin`, "LinkedIn", "linear-gradient(135deg,#0A66C2,#004182)", [["invitations", fmt(o.linkedin.invites)], ["acceptées", pct(o.linkedin.acceptRate)], ["réponses", pct(o.linkedin.replyRate)]], o.linkedin.meetings)}
      </div>
      <div className="card"><h2>D&apos;où viennent les rendez-vous</h2><p className="sub">{periodText(days)}, tous canaux confondus</p>
        <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", background: "rgba(11,18,47,.06)" }}>
          {[[o.call.meetings, "#0F9F6E"], [o.email.meetings, "#2E5BFF"], [o.linkedin.meetings, "#0A66C2"]].map(([n, c], i) => (n as number) > 0 && <i key={i} style={{ width: `${((n as number) / total) * 100}%`, background: c as string }} />)}
        </div>
        <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: "#0F9F6E" }} />Appels · {o.call.meetings}</span><span><i style={{ background: "#2E5BFF" }} />Emails · {o.email.meetings}</span><span><i style={{ background: "#0A66C2" }} />LinkedIn · {o.linkedin.meetings}</span></div>
      </div>
    </div>
  );
}

function ActivityItem({ a, base, readOnly = false }: { a: Activity; base: string; readOnly?: boolean }) {
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    readOnly ? <div className="item">{children}</div> : <Link className="item" href={`${base}/contacts/${encodeURIComponent(a.contactKey)}`}>{children}</Link>;
  return (
    <Wrap>
      <span className="av">{initials(a)}</span>
      <span className="who">{displayName(a)}{a.company && displayName(a) !== a.company && <span> · {a.company}</span>}</span>
      <span className="meta">{dateFR(a.occurredAt)}</span>
      <span className="sum">{a.body ? a.body.slice(0, 220) : a.subject || typeLabel(a)}</span>
      <span className="tags"><span className="pill mute">{typeLabel(a)}</span><SentimentPill s={a.sentiment} />{a.objections.map((o) => <span key={o} className="pill mute">{OBJ_LABEL[o] || o}</span>)}{a.campaign && <span className="pill src">{a.campaign}</span>}<span className="pill src">{SOURCE_LABEL[a.provider] || a.provider}</span></span>
    </Wrap>
  );
}

/** Onglet Emails ou LinkedIn. */
/** `readOnly` : lien de suivi partagé (pas de fiche prospect, pas de lien vers Sources). */
export async function ChannelView({ scope, base, days, channel, filter, readOnly = false }: { scope: Scope; base: string; days: number; channel: "email" | "linkedin"; filter: string; readOnly?: boolean }) {
  const acts = await windowActivities(scope, days, channel);
  if (!acts.length) {
    return <div className="card"><div className="empty"><b>Pas encore d&apos;activité {channel === "email" ? "email" : "LinkedIn"} sur cette période</b>
      {readOnly ? "Les envois et les réponses apparaîtront ici dès qu'ils auront lieu." : <>Connectez lemlist, Instantly, Smartlead, HubSpot ou n&apos;importe quel outil via Zapier/Make, ou importez un CSV, depuis <Link href={`${base}/sources`}>Sources</Link>.</>}</div></div>;
  }
  const isEmail = channel === "email";
  const e = emailStats(acts), l = linkedinStats(acts);
  const kpis: [string, string, string, string?][] = isEmail
    ? [["Prospects contactés", fmt(e.contacts), `${fmt(e.sent)} emails envoyés`], ["Taux de réponse", pct(e.replyRate), `${fmt(e.replied)} réponses`], ["Réponses positives", fmt(e.positive), `${pct(e.positiveRate)} des réponses`], ["Rendez-vous", fmt(e.meetings), `Bounces ${pct(e.bounceRate)} · ouvertures ${pct(e.openRate)} (indicatif)`, "hero"]]
    : [["Invitations envoyées", fmt(l.invites), `${fmt(l.messages)} messages envoyés`], ["Taux d'acceptation", pct(l.acceptRate), `${fmt(l.accepted)} acceptées`], ["Taux de réponse", pct(l.replyRate), `${fmt(l.replied)} réponses · ${fmt(l.positive)} positives`], ["Rendez-vous", fmt(isEmail ? e.meetings : l.meetings), "pris via LinkedIn", "hero"]];
  const steps: [string, number][] = isEmail ? [["Contactés", e.contacts], ["Ouverts", e.opened], ["Réponses", e.replied], ["Positives", e.positive], ["RDV", e.meetings]] : [["Invitations", l.invites], ["Acceptées", l.accepted], ["Réponses", l.replied], ["Positives", l.positive], ["RDV", l.meetings]];
  const rows = isEmail ? e.campaigns : l.campaigns;
  const F: Record<string, (a: Activity) => boolean> = { replies: (a) => a.type === "replied", positive: (a) => a.type === "replied" && a.sentiment === "positive", meetings: (a) => a.type === "meeting_booked", all: () => true };
  const f = F[filter] ? filter : "replies";
  const list = acts.filter(F[f]).slice(0, 150);
  return (
    <>
      <div className="grid g-kpi">{kpis.map(([lab, v, foot, cls]) => <div key={lab} className={`card kpi ${cls || ""}`}><div className="lab"><i />{lab}</div><div className="val">{v}</div><div className="foot">{foot}</div></div>)}</div>
      <div className="grid g-2 mt">
        <div className="card"><h2>Entonnoir</h2><p className="sub">Prospects uniques à chaque étape</p>
          <div className="funnel">{steps.map(([n, v], i) => (
            <div key={n} className={`frow ${i === steps.length - 1 ? "win" : ""}`}><span className="nm">{n}</span><span className="nb">{fmt(v)}{i > 0 && <em>{pct(steps[i - 1][1] ? (v / steps[i - 1][1]) * 100 : 0)}</em>}</span><div className="track"><i style={{ width: `${Math.max(1, (v / (steps[0][1] || 1)) * 100)}%` }} /></div></div>
          ))}</div>
        </div>
        <div className="card"><h2>Campagnes</h2><p className="sub">Les plus actives sur la période</p>
          <div className="scroll-x"><table><thead><tr><th>Campagne</th><th>{isEmail ? "Envois" : "Actions"}</th><th>Réponses</th><th>Taux</th><th>RDV</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{fmt(r.sent)}</td><td>{fmt(r.replied)}</td><td>{pct(r.rate)}</td><td>{fmt(r.meetings)}</td></tr>)}</tbody></table></div>
        </div>
      </div>
      <div className="card mt">
        <div className="filters">{[["replies", "Réponses"], ["positive", "Positives"], ["meetings", "RDV"], ["all", "Toute l'activité"]].map(([k, lab]) => <Link key={k} className="chip" href={`${base}/${isEmail ? "emails" : "linkedin"}?days=${days}&f=${k}`} aria-current={k === f ? "true" : undefined}>{lab}</Link>)}</div>
        {list.length ? <div className="list">{list.map((a) => <ActivityItem key={a.id} a={a} base={base} readOnly={readOnly} />)}</div> : <div className="empty">Rien sur ce filtre.</div>}
      </div>
    </>
  );
}
