import { notFound } from "next/navigation";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { isAdminOrg } from "@/lib/admin";
import { SOURCE_LABEL } from "@/lib/providers";
import { PageTop } from "@/components/Shell";
import { adminSetSubscription } from "@/app/actions";

export const metadata = { title: "Inscriptions" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { trialing: "Essai", active: "Payant", past_due: "Paiement en échec", canceled: "Résilié" };
const d = (x: Date) => x.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** Statistiques de lancement : qui s'inscrit, qui connecte un outil, qui paie. Réservé à l'éditeur. */
export default async function Page() {
  const scope = await requireOrgScope();
  if (!isAdminOrg(scope.orgId)) notFound();
  const now = Date.now();
  const errors = await db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const [orgs, users24, users7, usersAll, feedback, visits] = await Promise.all([
    db.organization.findMany({
      where: { id: { not: "demo_trustpipe" } }, orderBy: { createdAt: "desc" }, take: 300,
      include: {
        members: { where: { role: "owner" }, take: 1, include: { user: { select: { email: true, createdAt: true } } } },
        integrations: { select: { provider: true, lastSyncAt: true } },
        _count: { select: { clients: true, calls: true } },
      },
    }),
    db.user.count({ where: { createdAt: { gt: new Date(now - 864e5) } } }),
    db.user.count({ where: { createdAt: { gt: new Date(now - 7 * 864e5) } } }),
    db.user.count(),
    db.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.aiUsage.findMany({ where: { key: { startsWith: "visit" }, day: { gte: new Date(now - 29 * 864e5).toISOString().slice(0, 10) } } }),
  ]);
  // Affluence du site (compteur maison, sans cookie) : 30 derniers jours.
  const today = new Date(now).toISOString().slice(0, 10), week = new Date(now - 6 * 864e5).toISOString().slice(0, 10);
  const sum = (k: string, from = "") => visits.filter((v) => (v.key === k || (k === "visit:/paiement" && v.key === "visit:/essai")) && v.day >= from).reduce((n, v) => n + v.count, 0);
  const funnel: [string, string][] = [["Accueil", "visit:/"], ["Page d'inscription", "visit:/inscription"], ["Page de paiement", "visit:/paiement"]];
  const days = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * 864e5).toISOString().slice(0, 10));
  const perDay = days.map((day) => ({ day, n: visits.filter((v) => v.key === "visit:/" && v.day === day).reduce((n, v) => n + v.count, 0) }));
  const maxDay = Math.max(1, ...perDay.map((x) => x.n));
  const sources = Object.entries(visits.filter((v) => v.key.startsWith("visitsrc:")).reduce<Record<string, number>>((m, v) => { const k = v.key.slice(9); m[k] = (m[k] || 0) + v.count; return m; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const real = orgs.filter((o) => !isAdminOrg(o.id));
  const count = (f: (o: (typeof real)[number]) => boolean) => real.filter(f).length;
  const tiles: [string, number, string][] = [
    ["Inscrits (24 h)", users24, "nouveaux comptes"],
    ["Inscrits (7 j)", users7, `${usersAll} au total`],
    ["Essais lancés", count((o) => !!o.stripeSubscriptionId && o.subscriptionStatus === "trialing"), "carte enregistrée"],
    ["Outil connecté", count((o) => o.integrations.length > 0), "au moins une source"],
    ["Client partagé", count((o) => o._count.clients > 0), "au moins un client créé"],
    ["Payants", count((o) => o.subscriptionStatus === "active"), `${count((o) => o.subscriptionStatus === "canceled")} résilié(s)`],
  ];
  return (
    <>
      <PageTop title="Inscriptions" subtitle="Qui s'inscrit, qui connecte un outil, qui paie. Visible par vous seul." />
      <div className="grid g-3">
        {tiles.map(([t, n, s]) => <div key={t} className="card"><p className="muted small" style={{ margin: 0 }}>{t}</p><div style={{ fontFamily: "var(--f-display)", fontSize: 34, fontWeight: 700 }}>{n}</div><p className="muted small" style={{ margin: 0 }}>{s}</p></div>)}
      </div>
      <div className="card mt">
        <h2>Affluence du site</h2>
        <p className="muted small" style={{ margin: "0 0 12px" }}>Visites sur trustpipe.fr (un visiteur compté une fois par page et par onglet, sans cookie). Vos propres visites sont incluses.</p>
        <table className="table">
          <thead><tr><th>Page</th><th>Aujourd&apos;hui</th><th>7 jours</th><th>30 jours</th></tr></thead>
          <tbody>{funnel.map(([label, k]) => <tr key={k}><td>{label}</td><td>{sum(k, today)}</td><td>{sum(k, week)}</td><td>{sum(k)}</td></tr>)}</tbody>
        </table>
        <p className="muted small" style={{ margin: "16px 0 6px" }}>Visites de l&apos;accueil, 14 derniers jours</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }} aria-label="Visites par jour">
          {perDay.map((x) => (
            <div key={x.day} title={`${x.day.slice(8)}/${x.day.slice(5, 7)} : ${x.n} visite(s)`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span className="small muted">{x.n || ""}</span>
              <div style={{ width: "100%", height: `${Math.max(2, (x.n / maxDay) * 64)}px`, background: "var(--blue)", borderRadius: 3, opacity: x.n ? 1 : 0.25 }} />
              <span className="small muted">{x.day.slice(8)}</span>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ margin: "16px 0 6px" }}>D&apos;où viennent les visiteurs (30 jours)</p>
        {!sources.length ? <p className="muted small">Pas encore de visite comptée.</p> : (
          <table className="table"><tbody>{sources.map(([src, n]) => <tr key={src}><td>{src === "direct" ? "Accès direct / lien copié" : src}</td><td>{n}</td></tr>)}</tbody></table>
        )}
      </div>
      <div className="card mt">
        <h2>Derniers inscrits</h2>
        {!real.length ? <p className="muted">Personne pour l&apos;instant. Ça arrive !</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Date</th><th>Email</th><th>Espace</th><th>Statut</th><th>Outils</th><th>Clients</th><th>Appels</th><th>Abonnement</th></tr></thead>
              <tbody>{real.map((o) => (
                <tr key={o.id}>
                  <td>{d(o.createdAt)}</td>
                  <td>{o.members[0]?.user.email || "?"}</td>
                  <td>{o.name}</td>
                  <td>{!o.stripeSubscriptionId ? "Sans carte" : STATUS[o.subscriptionStatus] || o.subscriptionStatus}{o.subscriptionStatus === "trialing" && o.stripeSubscriptionId ? ` (fin ${o.trialEndsAt.toLocaleDateString("fr-FR")})` : ""}{o.cancelRequestedAt && o.subscriptionStatus !== "canceled" ? <> · <b style={{ color: "#c0392b" }}>résiliation demandée</b>{o.stripeSubscriptionId?.startsWith("sub_") && <> (<a href={`https://dashboard.stripe.com/subscriptions/${o.stripeSubscriptionId}`} target="_blank" rel="noopener noreferrer">résilier dans Stripe</a>)</>}</> : null}</td>
                  <td>{o.integrations.map((i) => SOURCE_LABEL[i.provider] || i.provider).join(", ") || "-"}</td>
                  <td>{o._count.clients}</td>
                  <td>{o._count.calls}</td>
                  <td>
                    <form action={adminSetSubscription} style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <input type="hidden" name="orgId" value={o.id} />
                      <select name="what" className="input" defaultValue="" style={{ height: 32, padding: "0 8px" }} aria-label="Changer l'abonnement">
                        <option value="" disabled>Changer…</option>
                        <option value="solo">Payant Solo</option>
                        <option value="agency">Payant Équipe</option>
                        <option value="trial">Prolonger l&apos;essai 14 j</option>
                        <option value="canceled">Résilié</option>
                      </select>
                      <button className="btn sm">OK</button>
                    </form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card mt">
        <h2>Erreurs récentes</h2><p className="sub">Erreurs serveur des 30 derniers jours. Vous recevez un email à la première occurrence de chaque erreur.</p>
        {!errors.length ? <p className="muted">Aucune erreur enregistrée.</p> : <div className="scroll-x"><table><thead><tr><th>Quand</th><th>Page</th><th>Message</th><th>Code</th></tr></thead>
          <tbody>{errors.map((e) => <tr key={e.id}><td>{e.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>{e.method} {e.path}</td><td>{e.message.slice(0, 160)}</td><td>{e.digest}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card mt">
        <h2>Derniers avis</h2>
        {!feedback.length ? <p className="muted">Aucun avis pour l&apos;instant.</p> : feedback.map((f) => (
          <div key={f.id} style={{ borderTop: "1px solid var(--stroke)", padding: "10px 0" }}>
            <p className="muted small" style={{ margin: 0 }}>{d(f.createdAt)} · {f.email || "anonyme"}{f.rating ? ` · ${"★".repeat(f.rating)}` : ""}{f.page ? ` · ${f.page}` : ""}</p>
            <p style={{ margin: "4px 0 0" }}>{f.message}</p>
          </div>
        ))}
      </div>
      <p className="muted small mt">Paiement par lien Stripe : quand Stripe vous envoie l&apos;email d&apos;un nouvel abonnement, retrouvez l&apos;email du client ci-dessus et choisissez « Payant Solo » ou « Payant Équipe ». Pour une résiliation, choisissez « Résilié ».</p>
      <p className="muted small mt">Les visites du site (pages vues, provenance LinkedIn…) sont dans Vercel › projet › Analytics.</p>
    </>
  );
}
