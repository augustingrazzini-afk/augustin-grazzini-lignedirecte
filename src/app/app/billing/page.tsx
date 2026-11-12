import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/billing";
import { paymentLink, portalLink, stripe, stripeEnabled } from "@/lib/stripe";
import { currentUser } from "@/lib/session";
import { PageTop } from "@/components/Shell";

export const metadata = { title: "Abonnement" };
const STATUS: Record<string, string> = { trialing: "Essai gratuit", active: "Actif", past_due: "Paiement en échec", canceled: "Résilié" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; cancelled?: string; resumed?: string; err?: string }> }) {
  const scope = await requireOrgScope();
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  const sp = await searchParams;
  const ok = sp.ok;
  // État réel de l'abonnement chez Stripe (résiliation programmée, date de fin).
  const sub = stripeEnabled() && org.stripeSubscriptionId?.startsWith("sub_")
    ? await stripe().subscriptions.retrieve(org.stripeSubscriptionId).catch(() => null) : null;
  const live = sub && ["trialing", "active", "past_due", "unpaid"].includes(sub.status) ? sub : null;
  const endTs = live ? (live.cancel_at || (live.status === "trialing" ? live.trial_end : (live.items.data[0] as any)?.current_period_end || (live as any).current_period_end)) : null;
  const endDate = endTs ? new Date(endTs * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const owner = scope.role === "owner";
  const me = await currentUser();
  const links = !stripeEnabled() ? { solo: paymentLink("solo", me?.email || "", org.id), agency: paymentLink("agency", me?.email || "", org.id) } : null;
  const portal = portalLink();
  const plan = PLANS[org.plan as PlanId] || PLANS.trial;
  const subId = org.stripeSubscriptionId || "";
  const offered = !!subId && !subId.startsWith("sub_"); // accès offert ou activé à la main
  const subscribed = !!subId && org.subscriptionStatus !== "canceled";
  const trialEnd = org.trialEndsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const statusLine = offered ? "Accès offert"
    : org.subscriptionStatus === "trialing" ? `Essai gratuit jusqu'au ${trialEnd}${subId.startsWith("sub_") ? ` · premier prélèvement de ${plan.price} € HT le ${trialEnd}` : ""}`
    : org.subscriptionStatus === "active" ? `Actif · ${plan.price} € HT par mois, sans engagement`
    : org.subscriptionStatus === "past_due" ? "Paiement en échec : mettez à jour votre carte"
    : "Résilié";
  const features = (id: "solo" | "agency") => [
    Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} clients suivis` : "Clients illimités",
    "Accès en direct pour vos clients, avec assistant IA intégré",
    "Tous les dialers : Minari, lemlist, Aircall, Ringover… ou CSV",
    "Transcriptions, résumés et analyse IA de chaque appel",
    id === "agency" ? "Toute l'équipe commerciale" : "Pour un commercial",
  ];
  return (
    <>
      <PageTop title="Abonnement" subtitle={subscribed ? `${plan.name} · ${STATUS[org.subscriptionStatus] || ""}` : "Choisissez votre formule"} />
      {(ok || (sp as any).paye) && <div className="banner ok">Merci ! Votre carte est enregistrée et votre abonnement est actif.</div>}
      {sp.cancelled && <div className="banner ok">C&apos;est noté : votre abonnement est résilié{endDate ? ` et prendra fin le ${endDate}` : ""}. Aucun autre prélèvement ne sera fait. Vous gardez l&apos;accès jusque-là.</div>}
      {sp.resumed && <div className="banner ok">Votre abonnement continue normalement.</div>}
      {sp.err && <div className="banner err">La demande n&apos;a pas abouti. Réessayez ou écrivez-nous.</div>}
      {!stripeEnabled() && !links?.solo && !subscribed && <div className="banner">Le paiement en ligne n&apos;est pas encore activé.</div>}

      {subscribed && (
        <div className="card">
          <div className="head"><div><h2>Votre formule : {plan.name}</h2><p className="sub">{statusLine}</p></div>{!offered && <span className="pill win">{STATUS[org.subscriptionStatus] || org.subscriptionStatus}</span>}</div>
          <ul className="muted" style={{ margin: "4px 0 16px", paddingLeft: 20, lineHeight: 1.7 }}>
            {features(org.plan === "agency" ? "agency" : "solo").map((f) => <li key={f}>{f}</li>)}
          </ul>
          {owner && !offered && (links ? (
            portal ? <>
              <a className="btn primary" href={portal} target="_blank" rel="noopener noreferrer">Gérer mon abonnement</a>
              <p className="muted small" style={{ marginTop: 10 }}>Changer de carte ou de formule, voir vos factures ou résilier{org.subscriptionStatus === "trialing" ? " (rien n'est prélevé si vous résiliez avant la fin de l'essai)" : ""}. Stripe vous demande votre adresse email puis vous envoie un code de connexion.</p>
            </> : null
          ) : live ? (
            live.cancel_at_period_end || live.cancel_at
              ? <><p className="muted">Résiliation programmée : votre accès prend fin le <b>{endDate}</b>, sans autre prélèvement.</p>
                  <form action="/api/billing" method="post"><input type="hidden" name="action" value="resume" /><button className="btn primary">Annuler la résiliation</button></form></>
              : <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <form action="/api/billing" method="post"><input type="hidden" name="action" value="portal" /><button className="btn primary">Gérer mon abonnement</button></form>
                  <form action="/api/billing" method="post"><input type="hidden" name="action" value="cancel" /><button className="btn danger">Résilier</button></form>
                </div>
          ) : null)}
        </div>
      )}

      {!subscribed && (
        <div className="grid g-2e">
          {(["solo", "agency"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className={`card price${id === "agency" ? " lp-best" : ""}`}>
                <h2>{p.name}</h2>
                <div className="amt">{p.price} €<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> HT / mois</span></div>
                <ul>{features(id).map((f) => <li key={f}>{f}</li>)}</ul>
                {owner && (links
                  ? (links[id] ? <a className={`btn${id === "agency" ? " primary" : ""}`} href={links[id]!}>Choisir {p.name}</a> : <button className="btn" disabled>Choisir {p.name}</button>)
                  : <form action="/api/billing" method="post"><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={id} /><button className={`btn${id === "agency" ? " primary" : ""}`} disabled={!stripeEnabled()}>Choisir {p.name}</button></form>)}
              </div>
            );
          })}
        </div>
      )}
      {!subscribed && <p className="muted small mt">🔒 Paiement sécurisé par Stripe, sans engagement : résiliable à tout moment depuis cette page.</p>}
      {!owner && <p className="muted small mt">Seul le propriétaire de l&apos;espace peut gérer l&apos;abonnement.</p>}
    </>
  );
}
