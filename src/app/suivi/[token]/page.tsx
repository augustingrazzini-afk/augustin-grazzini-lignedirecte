import { shareScope } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { pickDays } from "@/lib/period";
import { PageTop, Period } from "@/components/Shell";
import { Dashboard } from "@/components/views/Dashboard";

export const metadata = { title: "Suivi en direct" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ days?: string }> }) {
  const { token } = await params;
  const { scope, client } = await shareScope(token);
  const days = pickDays((await searchParams).days);
  const base = `/suivi/${token}`;
  const last = await db.call.findFirst({ where: { clientId: scope.clientId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  return (
    <>
      <PageTop title={`Prospection ${client.name}`} subtitle={`Appels, conversations et rendez-vous, suivis en direct par ${client.org.name}`} live={last ? `En direct · mis à jour ${ago(last.updatedAt)}` : null}>
        <Period days={days} href={(d) => `${base}?days=${d}`} />
      </PageTop>
      <Dashboard scope={scope} base={base} days={days} emptyHint={<>Les appels apparaîtront ici dès qu&apos;ils seront passés.</>} />
    </>
  );
}
