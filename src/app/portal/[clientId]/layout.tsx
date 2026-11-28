import { ago } from "@/lib/format";
import { requireClientScope } from "@/lib/access";
import { hasAi, hasPremium } from "@/lib/billing";
import { lockedIcons } from "@/lib/plan";
import { currentUser, hasParkedSession } from "@/lib/session";
import { isDemoOrg } from "@/lib/demo-ids";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { after } from "next/server";
import { syncIfStale } from "@/lib/sync";
import { countDueTasks } from "@/components/views/Relances";

// La synchro « en direct » continue après l'affichage (after) : on lui laisse le temps de finir.
export const maxDuration = 300;

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  const [user, client, follow, sync] = await Promise.all([currentUser(), db.client.findUniqueOrThrow({ where: { id: scope.clientId }, include: { org: true } }), countDueTasks(scope), db.integration.findFirst({ where: { clientId: scope.clientId, lastSyncAt: { not: null } }, orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } })]);
  const demo = isDemoOrg(scope.orgId);
  if (!demo) after(() => syncIfStale(scope.orgId));
  const banner = demo ? <div className="banner demo-banner"><div><b>Démo en lecture seule</b> · vous voyez l&apos;espace d&apos;un freelance invité par une entreprise. Données fictives, rien n&apos;est enregistré.</div><a className="btn primary sm" href="/demo/quitter">{(await hasParkedSession()) ? "Revenir à mon espace →" : "Créer mon compte →"}</a></div> : null;
  // Commercial suivi par plusieurs entreprises : un espace par entreprise, et de quoi passer de l'un à l'autre.
  const spaces = [
    ...user!.memberships.map((m) => ({ href: "/app", label: `${m.org.name} (votre entreprise)` })),
    ...user!.clientAccess.map((a) => ({ href: `/portal/${a.clientId}`, label: a.client.org.name, current: a.clientId === scope.clientId })),
  ];
  return <Shell lastSync={sync?.lastSyncAt ? ago(sync.lastSyncAt) : null} banner={banner} spaces={demo ? spaces.map((sp) => (sp.href === "/app" ? { ...sp, label: "Vue de l'entreprise (le patron)" } : { ...sp, label: "Vue du freelance" })) : spaces} base={`/portal/${scope.clientId}`} orgName={client.org.name} clientName={client.name} isOrg={false} email={user!.email} followUps={follow} locked={lockedIcons({ ai: hasAi(client.org), premium: hasPremium(client.org) })} widget={hasAi(client.org) ? { clientId: scope.clientId, aiReady: true } : undefined}>{children}</Shell>;
}
