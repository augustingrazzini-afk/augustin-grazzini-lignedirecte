import { requireClientScope } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { after } from "next/server";
import { syncIfStale } from "@/lib/sync";
import { aiEnabled } from "@/lib/ai";
import { countDueTasks } from "@/components/views/Relances";

// La synchro « en direct » continue après l'affichage (after) : on lui laisse le temps de finir.
export const maxDuration = 300;

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  const [user, client, follow] = await Promise.all([currentUser(), db.client.findUniqueOrThrow({ where: { id: scope.clientId }, include: { org: true } }), countDueTasks(scope)]);
  after(() => syncIfStale(scope.orgId));
  return <Shell base={`/portal/${scope.clientId}`} orgName={client.org.name} clientName={client.name} isOrg={false} email={user!.email} followUps={follow} widget={{ clientId: scope.clientId, aiReady: aiEnabled() }}>{children}</Shell>;
}
