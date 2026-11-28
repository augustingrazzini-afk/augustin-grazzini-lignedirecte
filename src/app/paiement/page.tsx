import Link from "next/link";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, euros } from "@/lib/billing";
import { cardRequired, paymentLink, stripeEnabled } from "@/lib/stripe";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { PlanPicker } from "@/components/PlanPicker";

export const metadata = { title: "Choisir votre formule" };

/** Étape obligatoire avant l'app : choisir sa formule et payer sur Stripe. */
export default async function Page({ searchParams }: { searchParams: Promise<{ erreur?: string; paye?: string }> }) {
  const u = await requireUser();
  const m = u.memberships[0];
  if (!m) redirect(u.clientAccess[0] ? `/portal/${u.clientAccess[0].clientId}` : "/onboarding");
  const org = await db.organization.findUniqueOrThrow({ where: { id: m.orgId } });
  if (org.stripeSubscriptionId || !cardRequired()) redirect("/app");
  const sp = await searchParams;
  const err = sp.erreur;
  // Paiement par lien Stripe : la confirmation arrive par notification, quelques secondes après le retour ici.
  if (sp.paye) return (
    <div className="auth trial"><meta httpEquiv="refresh" content="3" />
      <div className="trial-box"><Logo size={26} /><h1>Paiement reçu, merci !</h1>
        <p className="muted">Votre abonnement est en cours d&apos;activation, cette page s&apos;actualise toute seule. Si rien ne se passe d&apos;ici une minute, <Link href="/app">ouvrez votre espace</Link>.</p></div>
    </div>
  );
  return (
    <div className="auth trial">
      <div className="trial-box">
        <Logo size={26} />
        <VisitBeacon page="/paiement" />
        <h1>Choisissez votre formule</h1>
        <p className="muted">Paiement mensuel par carte sur Stripe. <b>Sans engagement</b> : résiliable en un clic depuis la page Abonnement.</p>
        {err && <div className="banner err">Le paiement n&apos;a pas abouti. Réessayez ou choisissez une autre carte.</div>}
        {m.role !== "owner" ? (
          <div className="banner">Le propriétaire de l&apos;espace « {org.name} » doit choisir la formule. Revenez ensuite sur cette page.</div>
        ) : (
<div style={{ marginTop: 22 }}>
            <PlanPicker email={u.email} orgId={org.id} />
            <p className="muted small" style={{ marginTop: 14 }}>Prix fixe par mois pour toute votre équipe : 2 commerciaux en Découverte, 4 en Essentiel, 10 en Premium (au-delà, sur devis). Vous changez de formule quand vous voulez.</p>
          </div>
        )}
        <p className="muted small" style={{ marginTop: 18 }}>🔒 Paiement sécurisé par Stripe : nous ne voyons jamais votre numéro de carte. <Link href="/cgv">Conditions générales</Link></p>
        <form action={logout}><button className="as-reset" type="submit">Se déconnecter</button></form>
      </div>
    </div>
  );
}
