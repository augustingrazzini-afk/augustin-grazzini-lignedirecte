import { requireClientScope } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { countDueTasks } from "@/components/views/Relances";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  const [user, client, follow] = await Promise.all([currentUser(), db.client.findUniqueOrThrow({ where: { id: scope.clientId }, include: { org: true } }), countDueTasks(scope)]);
  return <Shell base={`/portal/${scope.clientId}`} orgName={client.org.name} clientName={client.name} isOrg={false} email={user!.email} followUps={follow}>{children}</Shell>;
}
