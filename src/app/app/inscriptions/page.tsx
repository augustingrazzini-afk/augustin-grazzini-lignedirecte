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
  const [orgs, users24, users7, usersAll, feedback] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: "desc" }, take: 300,
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
  ]);
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
                  <td>{!o.stripeSubscriptionId ? "Sans carte" : STATUS[o.subscriptionStatus] || o.subscriptionStatus}{o.subscriptionStatus === "trialing" && o.stripeSubscriptionId ? ` (fin ${o.trialEndsAt.toLocaleDateString("fr-FR")})` : ""}</td>
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
