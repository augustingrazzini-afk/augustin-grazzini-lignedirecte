import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, TRIAL_DAYS } from "@/lib/billing";
import { stripeEnabled } from "@/lib/stripe";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Lancer votre essai gratuit" };

/** Étape obligatoire avant l'app : choisir sa formule et enregistrer sa carte sur Stripe (aucun débit pendant l'essai). */
export default async function Page({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const u = await requireUser();
  const m = u.memberships[0];
  if (!m) redirect(u.clientAccess[0] ? `/portal/${u.clientAccess[0].clientId}` : "/onboarding");
  const org = await db.organization.findUniqueOrThrow({ where: { id: m.orgId } });
  if (org.stripeSubscriptionId || !stripeEnabled()) redirect("/app");
  const err = (await searchParams).erreur;
  const days = Math.max(1, Math.min(TRIAL_DAYS, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 864e5)));
  const end = new Date(Date.now() + days * 864e5).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return (
    <div className="auth trial">
      <div className="trial-box">
        <Logo size={26} />
        <h1>Lancez votre essai gratuit de {days} jours</h1>
        <p className="muted">Choisissez votre formule et enregistrez votre carte sur Stripe. <b>Aucun débit avant le {end}</b> ; annulable en un clic d&apos;ici là depuis la page Abonnement.</p>
        {err && <div className="banner err">Le paiement n&apos;a pas abouti. Réessayez ou choisissez une autre carte.</div>}
        {m.role !== "owner" ? (
          <div className="banner">Le propriétaire de l&apos;espace « {org.name} » doit lancer l&apos;essai. Revenez ensuite sur cette page.</div>
        ) : (
          <div className="grid g-2e" style={{ marginTop: 20 }}>
            {(["solo", "agency"] as const).map((id) => (
              <form key={id} action="/api/billing" method="post" className={`card price${id === "agency" ? " lp-best" : ""}`}>
                <input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={id} /><input type="hidden" name="trial" value="1" />
                <h2>{PLANS[id].name}</h2>
                <div className="amt">{PLANS[id].price} €<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> HT / mois après l&apos;essai</span></div>
                <ul>
                  <li>{Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} clients suivis` : "Clients illimités"}</li>
                  <li>Appels, campagnes email et LinkedIn</li>
                  <li>Assistant IA, relances, lien de suivi client</li>
                  {id === "agency" ? <li>Toute l&apos;équipe commerciale</li> : <li>Pour un SDR freelance</li>}
                </ul>
                <button className={`btn${id === "agency" ? " primary" : ""}`}>Démarrer l&apos;essai {PLANS[id].name}</button>
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
