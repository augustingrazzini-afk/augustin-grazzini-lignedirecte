import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isActive, PLANS, type PlanId } from "@/lib/billing";
import { Shell } from "@/components/Shell";
import { countDueTasks } from "@/components/views/Relances";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireOrgScope();
  const [user, org, follow] = await Promise.all([currentUser(), db.organization.findUniqueOrThrow({ where: { id: scope.orgId } }), countDueTasks(scope)]);
  const days = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 864e5);
  let banner: React.ReactNode = null;
  if (!isActive(org)) banner = <div className="banner err"><div><b>Votre essai est terminé.</b> Vos données restent consultables. <Link href="/app/billing">Choisir une formule</Link> pour continuer à synchroniser et utiliser l&apos;IA.</div></div>;
  else if (org.subscriptionStatus === "past_due") banner = <div className="banner err"><div><b>Paiement en échec.</b> <Link href="/app/billing">Mettre à jour le moyen de paiement</Link>.</div></div>;
  else if (org.subscriptionStatus === "trialing" && days <= 5) banner = <div className="banner"><div><b>{PLANS[org.plan as PlanId]?.name || "Essai"} : plus que {days} jour(s).</b> <Link href="/app/billing">Choisir une formule</Link>.</div></div>;
  return <Shell base="/app" orgName={org.name} isOrg email={user!.email} followUps={follow} banner={banner}>{children}</Shell>;
}
