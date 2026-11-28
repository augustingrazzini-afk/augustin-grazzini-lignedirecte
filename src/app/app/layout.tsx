import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { hasAi, hasPremium, isActive, PLANS, type PlanId } from "@/lib/billing";
import { lockedIcons } from "@/lib/plan";
import { Shell } from "@/components/Shell";
import { after } from "next/server";
import { syncIfStale } from "@/lib/sync";
import { countDueTasks } from "@/components/views/Relances";
import { redirect } from "next/navigation";
import { cardRequired } from "@/lib/stripe";
import { isAdminOrg } from "@/lib/admin";

// La synchro « en direct » continue après l'affichage (after) : on lui laisse le temps de finir.
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireOrgScope();
  const [user, org, follow] = await Promise.all([currentUser(), db.organization.findUniqueOrThrow({ where: { id: scope.orgId } }), countDueTasks(scope)]);
  // Essai de 7 jours avec carte enregistrée : l'accès s'ouvre une fois la formule choisie sur Stripe.
  if (!org.stripeSubscriptionId && cardRequired()) redirect("/paiement");
  const days = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 864e5);
  let banner: React.ReactNode = null;
  if (!isActive(org)) banner = <div className="banner err"><div><b>Votre abonnement n&apos;est plus actif.</b> Vos données restent consultables. <Link href="/app/billing">Choisir une formule</Link> pour continuer à synchroniser et utiliser l&apos;IA.</div></div>;
  else if (org.subscriptionStatus === "past_due") banner = <div className="banner err"><div><b>Paiement en échec.</b> <Link href="/app/billing">Mettre à jour le moyen de paiement</Link>.</div></div>;
  else if (org.subscriptionStatus === "trialing" && days <= 3) banner = <div className="banner"><div><b>{PLANS[org.plan as PlanId]?.name || "Essai"} : votre essai se termine dans {days} jour{days > 1 ? "s" : ""}.</b> Le premier prélèvement aura lieu à ce moment-là. <Link href="/app/billing">Gérer mon abonnement</Link>.</div></div>;
  after(() => syncIfStale(scope.orgId));
  return <Shell base="/app" orgName={org.name} isOrg admin={isAdminOrg(org.id)} email={user!.email} followUps={follow} banner={banner} locked={lockedIcons({ ai: hasAi(org), premium: hasPremium(org) })} widget={hasAi(org) ? { clientId: null, aiReady: true } : undefined}>{children}</Shell>;
}
