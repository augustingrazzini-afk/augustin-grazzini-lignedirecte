import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { currentUser, hasParkedSession, orgOf } from "@/lib/session";
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
import { isDemoOrg } from "@/lib/demo-ids";

// La synchro « en direct » continue après l'affichage (after) : on lui laisse le temps de finir.
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireOrgScope();
  const [user, org, follow] = await Promise.all([currentUser(), orgOf(scope.orgId).then((o) => o!), countDueTasks(scope)]);
  // Essai de 7 jours avec carte enregistrée : l'accès s'ouvre une fois la formule choisie sur Stripe.
  if (!org.stripeSubscriptionId && cardRequired()) redirect("/paiement");
  const days = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 864e5);
  let banner: React.ReactNode = null;
  const demo = isDemoOrg(org.id);
  if (demo) banner = <div className="banner demo-banner"><div><b>Démo en lecture seule</b> · données fictives, rien n&apos;est enregistré. Toutes les fonctions Premium sont ouvertes.</div><a className="btn primary sm" href="/demo/quitter">{(await hasParkedSession()) ? "Revenir à mon espace →" : "Créer mon compte →"}</a></div>;
  else if (!isActive(org)) banner = <div className="banner err"><div><b>Votre abonnement n&apos;est plus actif.</b> Vos données restent consultables. <Link href="/app/billing">Choisir une formule</Link> pour continuer à synchroniser et utiliser l&apos;IA.</div></div>;
  else if (org.subscriptionStatus === "past_due") banner = <div className="banner err"><div><b>Paiement en échec.</b> <Link href="/app/billing">Mettre à jour le moyen de paiement</Link>.</div></div>;
  else if (org.subscriptionStatus === "trialing" && days <= 3) banner = <div className="banner"><div><b>{PLANS[org.plan as PlanId]?.name || "Essai"} : votre essai se termine dans {days} jour{days > 1 ? "s" : ""}.</b> Le premier prélèvement aura lieu à ce moment-là. <Link href="/app/billing">Gérer mon abonnement</Link>.</div></div>;
  if (!demo) after(() => syncIfStale(scope.orgId));
  return <Shell spaces={demo ? [{ href: "/app", label: "Vue de l'entreprise (le patron)", current: true }, { href: "/portal/demo_rep_karim", label: "Vue du freelance" }] : undefined} base="/app" orgName={org.name} isOrg admin={isAdminOrg(org.id)} email={user!.email} followUps={follow} banner={banner} locked={lockedIcons({ ai: hasAi(org), premium: hasPremium(org) })} widget={hasAi(org) ? { clientId: null, aiReady: true } : undefined}>{children}</Shell>;
}
