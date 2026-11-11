import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isActive, PLANS, type PlanId } from "@/lib/billing";
import { Shell } from "@/components/Shell";
import { after } from "next/server";
import { syncIfStale } from "@/lib/sync";
import { aiEnabled } from "@/lib/ai";
import { countDueTasks } from "@/components/views/Relances";
import { redirect } from "next/navigation";
import { stripeEnabled } from "@/lib/stripe";

// La synchro « en direct » continue après l'affichage (after) : on lui laisse le temps de finir.
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireOrgScope();
  const [user, org, follow] = await Promise.all([currentUser(), db.organization.findUniqueOrThrow({ where: { id: scope.orgId } }), countDueTasks(scope)]);
  // L'essai gratuit démarre avec une carte enregistrée sur Stripe : pas d'accès avant.
  if (!org.stripeSubscriptionId && stripeEnabled()) redirect("/essai");
  const days = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 864e5);
  let banner: React.ReactNode = null;
  if (!isActive(org)) banner = <div className="banner err"><div><b>Votre essai est terminé.</b> Vos données restent consultables. <Link href="/app/billing">Choisir une formule</Link> pour continuer à synchroniser et utiliser l&apos;IA.</div></div>;
  else if (org.subscriptionStatus === "past_due") banner = <div className="banner err"><div><b>Paiement en échec.</b> <Link href="/app/billing">Mettre à jour le moyen de paiement</Link>.</div></div>;
  else if (org.subscriptionStatus === "trialing" && days <= 5) banner = <div className="banner"><div><b>{PLANS[org.plan as PlanId]?.name || "Essai"} : plus que {days} jour(s).</b> <Link href="/app/billing">Choisir une formule</Link>.</div></div>;
  after(() => syncIfStale(scope.orgId));
  return <Shell base="/app" orgName={org.name} isOrg email={user!.email} followUps={follow} banner={banner} widget={{ clientId: null, aiReady: aiEnabled() }}>{children}</Shell>;
}
