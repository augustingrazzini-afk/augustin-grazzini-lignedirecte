import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { PAID_PLANS, PLANS, PLAN_CAP, PLAN_FEATURES, type PlanId, euros } from "@/lib/billing";
import { paymentLink, portalLink, stripe, stripeEnabled } from "@/lib/stripe";
import { currentUser } from "@/lib/session";
import { PlanPicker } from "@/components/PlanPicker";
import { PageTop } from "@/components/Shell";
import { requestCancel } from "@/app/actions";

export const metadata = { title: "Abonnement" };
const STATUS: Record<string, string> = { trialing: "Essai en cours", active: "Actif", past_due: "Paiement en échec", canceled: "Résilié" };

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
  const repCount = await db.client.count({ where: { orgId: org.id } });
  const order = (PAID_PLANS as readonly string[]).indexOf(org.plan);
  const subId = org.stripeSubscriptionId || "";
  const offered = !!subId && !subId.startsWith("sub_"); // accès offert ou activé à la main
  const subscribed = !!subId && org.subscriptionStatus !== "canceled";
  const trialEnd = org.trialEndsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const statusLine = offered ? "Accès offert"
    : org.subscriptionStatus === "trialing" ? `Essai jusqu'au ${trialEnd}${subId.startsWith("sub_") ? ` · premier prélèvement de ${euros(plan.price)} € HT le ${trialEnd}` : ""}`
    : org.subscriptionStatus === "active" ? `Actif · ${euros(plan.price)} € HT par mois, sans engagement`
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
      {(ok || (sp as any).paye) && <div className="banner ok">Merci ! Votre carte est enregistrée : vos 7 jours d'essai démarrent, rien n'est débité avant leur terme.</div>}
      {sp.cancelled && <div className="banner ok">C&apos;est noté : votre abonnement est résilié{endDate ? ` et prendra fin le ${endDate}` : ""}. Aucun autre prélèvement ne sera fait. Vous gardez l&apos;accès jusque-là.</div>}
      {sp.resumed && <div className="banner ok">Votre abonnement continue normalement.</div>}
      {sp.err && <div className="banner err">La demande n&apos;a pas abouti. Réessayez ou écrivez-nous.</div>}
      {!stripeEnabled() && !links?.solo && !subscribed && <div className="banner">Le paiement en ligne n&apos;est pas encore activé.</div>}

      {subscribed && (
        <div className="card">
          <div className="head"><div><h2>Votre formule : {plan.name}</h2><p className="sub">{statusLine}</p></div>{!offered && <span className="pill win">{STATUS[org.subscriptionStatus] || org.subscriptionStatus}</span>}</div>
          <ul className="muted" style={{ margin: "4px 0 16px", paddingLeft: 20, lineHeight: 1.7 }}>
            {(org.plan in PLAN_FEATURES ? PLAN_FEATURES[org.plan as keyof typeof PLAN_FEATURES].yes : features()).map((f) => <li key={f}>{f}</li>)}
            {["starter", "agency", "premium"].includes(org.plan) && <li>Prix fixe : <b>{euros(plan.price)} € HT / mois</b>, {Number.isFinite(plan.maxClients) ? `jusqu'à ${plan.maxClients} commerciaux` : "commerciaux illimités"}.{org.plan === "premium" ? " Au-delà de 10 commerciaux : écrivez-nous, nous vous faisons un devis." : ""} {Number.isFinite(plan.maxClients) ? <>Pour en suivre plus, <a href="#changer">changez de formule</a> ci-dessous.</> : null}</li>}
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

      {subscribed && owner && org.plan in PLAN_FEATURES && (
        <div className="card mt" id="changer">
          <h2>Changer de formule</h2>
          <p className="sub">Passez à la formule au-dessus ou en dessous quand vous voulez, sans engagement. Vous suivez actuellement {repCount} {repCount > 1 ? "commerciaux" : "commercial"}.</p>
          <div className="grid g-3e plans" style={{ marginTop: 12 }}>
            {PAID_PLANS.map((id, i) => {
              const p = PLANS[id], cur = id === org.plan, up = i > order, cap = PLAN_CAP[id], tooSmall = repCount > cap;
              // Abonnement Stripe en cours : le changement se fait dans l'espace Stripe. Accès offert : on souscrit la formule choisie.
              const href = !cur ? (offered || !portal ? paymentLink(id, me?.email || "", org.id) : portal) : null;
              return (
                <div key={id} className={`card price${cur ? " lp-best" : ""}`}>
                  <div className="plan-top"><h2>{p.name}</h2>{cur && <span className="pill win">Votre formule</span>}</div>
                  <div className="amt" style={{ whiteSpace: "nowrap", fontSize: 30 }}>{euros(p.price)} €</div>
                  <div className="muted small" style={{ margin: "-4px 0 8px" }}>HT / mois · {Number.isFinite(cap) ? `jusqu'à ${cap} commerciaux` : "commerciaux illimités"}</div>
                  <ul>{PLAN_FEATURES[id].yes.slice(1, 5).map((t) => <li key={t}>{t}</li>)}</ul>
                  {cur ? <span className="muted small">C&apos;est votre formule actuelle.</span>
                    : tooSmall ? <span className="muted small">Vous suivez {repCount} commerciaux : retirez-en {repCount - cap} avant de passer à cette formule.</span>
                    : href ? <a className={`btn${up ? " primary" : ""}`} href={href} target="_blank" rel="noopener noreferrer">{up ? `Passer en ${p.name} ↑` : `Revenir en ${p.name} ↓`}</a>
                    : stripeEnabled() ? <form action="/api/billing" method="post"><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={id} /><button className={`btn${up ? " primary" : ""}`}>{up ? `Passer en ${p.name} ↑` : `Revenir en ${p.name} ↓`}</button></form>
                    : <span className="muted small">Écrivez-nous pour changer de formule.</span>}
                </div>
              );
            })}
          </div>
          {!offered && portal && <p className="muted small" style={{ margin: "12px 0 0" }}>Le bouton ouvre votre espace Stripe : connectez-vous avec l&apos;email de votre abonnement (un code vous est envoyé), cliquez sur « Mettre à jour l&apos;abonnement » et choisissez la formule. Le changement est immédiat et le prix est ajusté au prorata.</p>}
        </div>
      )}

      {!subscribed && <PlanPicker email={me?.email || ""} orgId={org.id} canBuy={owner} />}
      {!subscribed && <p className="muted small mt">🔒 Paiement sécurisé par Stripe, sans engagement : résiliable à tout moment depuis cette page.</p>}
      {!owner && <p className="muted small mt">Seul le propriétaire de l&apos;espace peut gérer l&apos;abonnement.</p>}
    </>
  );
}
