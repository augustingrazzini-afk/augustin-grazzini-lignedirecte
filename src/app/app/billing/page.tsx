import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, isActive, type PlanId } from "@/lib/billing";
import { stripe, stripeEnabled } from "@/lib/stripe";
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
  const plan = PLANS[org.plan as PlanId] || PLANS.trial;
  return (
    <>
      <PageTop title="Abonnement" subtitle={`${plan.name} · ${STATUS[org.subscriptionStatus] || org.subscriptionStatus}${org.subscriptionStatus === "trialing" ? ` jusqu'au ${org.trialEndsAt.toLocaleDateString("fr-FR")}` : ""}`} />
      {ok && <div className="banner ok">Merci ! Votre abonnement est en cours d&apos;activation, cela prend quelques secondes.</div>}
      {sp.cancelled && <div className="banner ok">C&apos;est noté : votre abonnement est résilié{endDate ? ` et prendra fin le ${endDate}` : ""}. Aucun autre prélèvement ne sera fait. Vous gardez l&apos;accès jusque-là.</div>}
      {sp.resumed && <div className="banner ok">Votre abonnement continue normalement.</div>}
      {sp.err && <div className="banner err">La demande n&apos;a pas abouti. Réessayez ou écrivez-nous.</div>}
      {!stripeEnabled() && <div className="banner">Le paiement en ligne n&apos;est pas encore activé sur ce serveur.</div>}
      <div className="grid g-2e">
        {(["solo", "agency"] as const).map((id) => {
          const p = PLANS[id];
          const current = org.plan === id && isActive(org) && org.subscriptionStatus !== "trialing";
          return (
            <div key={id} className="card price">
              <h2>{p.name}</h2>
              <div className="amt">{p.price} €<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> HT / mois</span></div>
              <ul>
                <li>{Number.isFinite(p.maxClients) ? `${p.maxClients} espaces clients` : "Espaces clients illimités"}</li>
                <li>Tous les dialers : Minari, lemlist, Skipcall, Aircall, Ringover… et CSV</li>
                <li>Transcriptions, briefs IA, coach, relances</li>
                {id === "agency" && <li>Plusieurs commerciaux dans l&apos;équipe</li>}
              </ul>
              {owner && (current
                ? <form action="/api/billing" method="post"><input type="hidden" name="action" value="portal" /><button className="btn">Gérer mon abonnement</button></form>
                : <form action="/api/billing" method="post"><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={id} /><button className="btn primary" disabled={!stripeEnabled()}>Choisir {p.name}</button></form>)}
            </div>
          );
        })}
      </div>
      {owner && live && (
        <div className="card mt">
          <h2>Résilier l&apos;abonnement</h2>
          {live.cancel_at_period_end || live.cancel_at
            ? <><p className="muted">Résiliation programmée : votre accès prend fin le <b>{endDate}</b>, sans autre prélèvement.</p>
                <form action="/api/billing" method="post"><input type="hidden" name="action" value="resume" /><button className="btn primary">Annuler la résiliation</button></form></>
            : <><p className="muted">{live.status === "trialing" ? `Vous êtes en essai gratuit : si vous résiliez maintenant, rien ne sera prélevé et l'accès s'arrête le ${endDate}.` : `Sans engagement : la résiliation prend effet à la fin de la période en cours (${endDate}), sans autre prélèvement. Vos données restent exportables jusque-là.`}</p>
                <form action="/api/billing" method="post"><input type="hidden" name="action" value="cancel" /><button className="btn danger">Résilier mon abonnement</button></form></>}
        </div>
      )}
      {owner && org.stripeCustomerId && <form action="/api/billing" method="post" className="mt"><input type="hidden" name="action" value="portal" /><button className="btn">Factures et moyen de paiement</button></form>}
    </>
  );
}
