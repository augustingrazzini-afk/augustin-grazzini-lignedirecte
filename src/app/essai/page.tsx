import Link from "next/link";
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
  const links = !stripeEnabled() ? { solo: paymentLink("solo", u.email, org.id), agency: paymentLink("agency", u.email, org.id) } : null;
  return (
    <div className="auth trial">
      <div className="trial-box">
        <Logo size={26} />
        <h1>Choisissez votre formule</h1>
        <p className="muted">Paiement mensuel par carte sur Stripe. <b>Sans engagement</b> : résiliable en un clic depuis la page Abonnement.</p>
        {err && <div className="banner err">Le paiement n&apos;a pas abouti. Réessayez ou choisissez une autre carte.</div>}
        {m.role !== "owner" ? (
          <div className="banner">Le propriétaire de l&apos;espace « {org.name} » doit choisir la formule. Revenez ensuite sur cette page.</div>
        ) : (
          <div className="grid g-2e" style={{ marginTop: 20 }}>
            {(["solo", "agency"] as const).map((id) => (
              <form key={id} action={links ? links[id]! : "/api/billing"} method={links ? "get" : "post"} className={`card price${id === "agency" ? " lp-best" : ""}`}>
                {links ? Array.from(new URL(links[id]!).searchParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
                  : <><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={id} /></>}
                <h2>{PLANS[id].name}</h2>
                <div className="amt">{euros(PLANS[id].price)} €<span className="muted" style={{ fontSize: 14, fontWeight: 500, fontFamily: "var(--f-body)", letterSpacing: 0 }}> HT / mois</span></div>
                <ul>
                  <li>{Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} clients suivis` : "Clients illimités"}</li>
                  <li>Appels analysés et résumés par l&apos;IA</li>
                  <li>Assistant IA, relances, lien de suivi client</li>
                  {id === "agency" ? <li>Toute l&apos;équipe commerciale</li> : <li>Pour un SDR freelance</li>}
                </ul>
                <button className={`btn${id === "agency" ? " primary" : ""}`}>Choisir {PLANS[id].name}</button>
              </form>
            ))}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 18 }}>🔒 Paiement sécurisé par Stripe : nous ne voyons jamais votre numéro de carte. <Link href="/cgv">Conditions générales</Link></p>
        <form action={logout}><button className="as-reset" type="submit">Se déconnecter</button></form>
      </div>
    </div>
  );
}
