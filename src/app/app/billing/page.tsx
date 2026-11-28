import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, PLAN_FEATURES, type PlanId, euros } from "@/lib/billing";
import { paymentLink, portalLink, stripe, stripeEnabled } from "@/lib/stripe";
import { currentUser } from "@/lib/session";
import { PlanPicker } from "@/components/PlanPicker";
import { PageTop } from "@/components/Shell";
import { requestCancel } from "@/app/actions";

export const metadata = { title: "Abonnement" };
const STATUS: Record<string, string> = { trialing: "Accès provisoire", active: "Actif", past_due: "Paiement en échec", canceled: "Résilié" };

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
  const links = !stripeEnabled() ? { solo: paymentLink("solo", me?.email || "", org.id), solo_plus: paymentLink("solo_plus", me?.email || "", org.id), agency: paymentLink("agency", me?.email || "", org.id) } : null;
  const portal = portalLink();
  const plan = PLANS[org.plan as PlanId] || PLANS.trial;
  const subId = org.stripeSubscriptionId || "";
  const offered = !!subId && !subId.startsWith("sub_"); // accès offert ou activé à la main
  const subscribed = !!subId && org.subscriptionStatus !== "canceled";
  const trialEnd = org.trialEndsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const statusLine = offered ? "Accès offert"
    : org.subscriptionStatus === "trialing" ? `Accès provisoire jusqu'au ${trialEnd}${subId.startsWith("sub_") ? ` · premier prélèvement de ${euros(plan.price)} € HT le ${trialEnd}` : ""}`
    : org.subscriptionStatus === "active" ? `Actif · ${euros(plan.price * (plan.perSeat ? Math.max(1, org.seats) : 1))} € HT par mois, sans engagement`
    : org.subscriptionStatus === "past_due" ? "Paiement en échec : mettez à jour votre carte"
    : "Résilié";
  const features = (_id?: string) => [
    "Internes, freelances et agences au même endroit",
    "Chaque appel en direct, résumé et analysé par l'IA",
    "Classement et résultats par commercial",
    "Assistant IA, relances, briefs de rendez-vous",
    "Tous les dialers : Minari, lemlist, Aircall, Ringover… ou CSV",
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
            {(org.plan in PLAN_FEATURES ? PLAN_FEATURES[org.plan as keyof typeof PLAN_FEATURES].yes : features()).map((f) => <li key={f}>{f}</li>)}
            {["starter", "agency", "premium"].includes(org.plan) && <li><b>{org.seats} commercial{org.seats > 1 ? "aux" : ""}</b> suivi{org.seats > 1 ? "s" : ""} sur votre abonnement : {euros(plan.price * org.seats)} € HT / mois. Pour en suivre plus, changez la quantité dans « Gérer mon abonnement ».</li>}
          </ul>
          {owner && !offered && (links ? (
            org.cancelRequestedAt ? <>
              <div className="banner" style={{ margin: "0 0 12px" }}>Résiliation enregistrée le {org.cancelRequestedAt.toLocaleDateString("fr-FR")}. Vous gardez l&apos;accès jusqu&apos;à la fin de la période payée.</div>
              {portal ? <a className="btn primary" href={portal} target="_blank" rel="noopener noreferrer">Reprendre mon abonnement sur Stripe</a>
                : <form action={requestCancel}><input type="hidden" name="undo" value="1" /><button className="btn primary">Annuler la résiliation</button></form>}
            </> : <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {portal && <a className="btn primary" href={portal} target="_blank" rel="noopener noreferrer">Gérer mon abonnement</a>}
              {portal
                ? <a className="btn danger" href={portal} target="_blank" rel="noopener noreferrer">Résilier mon abonnement</a>
                : <form action={requestCancel}><button className="btn danger">Résilier mon abonnement</button></form>}
              <p className="muted small" style={{ width: "100%", margin: "4px 0 0" }}>Sans engagement. {portal ? "La résiliation se fait sur Stripe, notre prestataire de paiement : connectez-vous avec l'email de votre abonnement, cliquez sur « Annuler l'abonnement », et c'est effectif tout de suite, sans intervention de notre part. Vous gardez l'accès jusqu'à la fin de la période payée. " : ""}« Gérer mon abonnement » ouvre aussi Stripe pour changer de carte, de formule ou de nombre de commerciaux, et voir vos factures.</p>
            </div>
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

      {!subscribed && <PlanPicker email={me?.email || ""} orgId={org.id} canBuy={owner} />}
      {!subscribed && <p className="muted small mt">🔒 Paiement sécurisé par Stripe, sans engagement : résiliable à tout moment depuis cette page.</p>}
      {!owner && <p className="muted small mt">Seul le propriétaire de l&apos;espace peut gérer l&apos;abonnement.</p>}
    </>
  );
}
