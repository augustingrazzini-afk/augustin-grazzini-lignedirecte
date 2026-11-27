import Link from "next/link";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, euros } from "@/lib/billing";
import { cardRequired, paymentLink, stripeEnabled } from "@/lib/stripe";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";

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
  const link = !stripeEnabled() ? paymentLink("agency", u.email, org.id) : null;
  return (
    <div className="auth trial">
      <div className="trial-box">
        <Logo size={26} />
        <VisitBeacon page="/essai" />
        <h1>Activez Trustpipe</h1>
        <p className="muted">Paiement mensuel par carte sur Stripe. <b>Sans engagement</b> : résiliable en un clic depuis la page Abonnement.</p>
        {err && <div className="banner err">Le paiement n&apos;a pas abouti. Réessayez ou choisissez une autre carte.</div>}
        {m.role !== "owner" ? (
          <div className="banner">Le propriétaire de l&apos;espace « {org.name} » doit choisir la formule. Revenez ensuite sur cette page.</div>
        ) : (
<div className="grid g-2e" style={{ marginTop: 22 }}>
            <form action={link || "/api/billing"} method={link ? "get" : "post"} className="card price lp-best">
              {link ? Array.from(new URL(link).searchParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
                : <><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value="agency" /></>}
              <h2>Par commercial suivi</h2>
              <div className="amt">{euros(PLANS.agency.price)} €<span className="muted" style={{ fontSize: 14, fontWeight: 500, fontFamily: "var(--f-body)", letterSpacing: 0 }}> HT / mois</span><div className="muted" style={{ fontSize: 14, fontWeight: 500, fontFamily: "var(--f-body)", letterSpacing: 0, marginTop: 6 }}>par commercial</div></div>
              <ul>
                <li>Internes, freelances et agences au même endroit</li>
                <li>Chaque appel en direct, résumé et analysé par l&apos;IA</li>
                <li>Classement et résultats par commercial</li>
                <li>Assistant IA, relances, briefs de rendez-vous</li>
                <li>Managers et associés illimités</li>
              </ul>
              <button className="btn primary">Continuer vers le paiement</button>
            </form>
            <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, textAlign: "left" }}>
              <b>Combien de commerciaux ?</b>
              <p className="muted small" style={{ margin: 0 }}>Vous choisissez le nombre à l&apos;étape du paiement. Exemple : 2 commerciaux internes + 1 agence = 3 × {euros(PLANS.agency.price)} € HT par mois.</p>
              <p className="muted small" style={{ margin: 0 }}>Vous en ajoutez ou en retirez quand vous voulez depuis la page Abonnement.</p>
            </div>
          </div>
        )}
        <p className="muted small" style={{ marginTop: 18 }}>🔒 Paiement sécurisé par Stripe : nous ne voyons jamais votre numéro de carte. <Link href="/cgv">Conditions générales</Link></p>
        <form action={logout}><button className="as-reset" type="submit">Se déconnecter</button></form>
      </div>
    </div>
  );
}
