import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, isActive, type PlanId } from "@/lib/billing";
import { stripeEnabled } from "@/lib/stripe";
import { PageTop } from "@/components/Shell";

export const metadata = { title: "Abonnement" };
const STATUS: Record<string, string> = { trialing: "Essai gratuit", active: "Actif", past_due: "Paiement en échec", canceled: "Résilié" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const scope = await requireOrgScope();
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  const ok = (await searchParams).ok;
  const owner = scope.role === "owner";
  const plan = PLANS[org.plan as PlanId] || PLANS.trial;
  return (
    <>
      <PageTop title="Abonnement" subtitle={`${plan.name} · ${STATUS[org.subscriptionStatus] || org.subscriptionStatus}${org.subscriptionStatus === "trialing" ? ` jusqu'au ${org.trialEndsAt.toLocaleDateString("fr-FR")}` : ""}`} />
      {ok && <div className="banner ok">Merci ! Votre abonnement est en cours d&apos;activation, cela prend quelques secondes.</div>}
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
                <li>Toutes les sources : Minari, Aircall, Ringover, HubSpot, CSV</li>
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
      {owner && org.stripeCustomerId && <form action="/api/billing" method="post" className="mt"><input type="hidden" name="action" value="portal" /><button className="btn">Factures et moyen de paiement</button></form>}
    </>
  );
}
