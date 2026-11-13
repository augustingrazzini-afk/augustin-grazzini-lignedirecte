import Link from "next/link";
import { requireClientScope } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { PageTop, Period } from "@/components/Shell";
import { Dashboard } from "@/components/views/Dashboard";
import { ClientWelcome } from "@/components/views/GettingStarted";
import { pickDays } from "@/components/pages";

export const metadata = { title: "Pilotage" };
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ days?: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  const days = pickDays((await searchParams).days);
  const base = `/portal/${scope.clientId}`;
  const client = await db.client.findUnique({ where: { id: scope.clientId }, select: { org: { select: { name: true } } } });
  const last = await db.call.findFirst({ where: { clientId: scope.clientId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  return (
    <>
      <PageTop title="Pilotage" subtitle="Vos appels et vos rendez-vous, en direct" live={last ? `En direct · mis à jour ${ago(last.updatedAt)}` : null}><Period days={days} href={(d) => `${base}?days=${d}`} /></PageTop>
      <ClientWelcome storeKey={`tp-welcome-${scope.clientId}`} base={base} by={client?.org.name || "votre commercial"} />
      <Dashboard scope={scope} base={base} days={days} emptyHint={<>Vos appels apparaîtront ici dès la première synchronisation. Vous pouvez déjà <Link href={`${base}/sources`}>importer vos propres appels</Link>.</>} />
    </>
  );
}
