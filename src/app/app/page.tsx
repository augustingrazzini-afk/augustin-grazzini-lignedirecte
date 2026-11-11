import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { PageTop, Period } from "@/components/Shell";
import { Dashboard } from "@/components/views/Dashboard";
import { pickDays } from "@/lib/period";

export const metadata = { title: "Pilotage" };

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string; client?: string }> }) {
  const sp = await searchParams;
  const days = pickDays(sp.days);
  const scope = await requireOrgScope(sp.client);
  const [clients, last] = await Promise.all([
    db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" } }),
    db.integration.findFirst({ where: { orgId: scope.orgId }, orderBy: { lastSyncAt: { sort: "desc", nulls: "last" } }, select: { lastSyncAt: true } }),
  ]);
  const href = (p: { days?: number; client?: string | null }) => {
    const q = new URLSearchParams({ days: String(p.days ?? days) });
    const c = p.client === undefined ? scope.clientFilter : p.client;
    if (c) q.set("client", c);
    return `/app?${q}`;
  };
  return (
    <>
      <PageTop title="Pilotage" subtitle={scope.clientFilter ? `Vue client : ${clients.find((c) => c.id === scope.clientFilter)?.name || "non rangés"}` : "Tous vos appels et rendez-vous"} live={last?.lastSyncAt ? `En direct · synchro ${ago(last.lastSyncAt)}` : null}>
        {clients.length > 0 && (
          <div className="seg" role="group" aria-label="Client">
            <Link href={href({ client: null })} aria-current={!scope.clientFilter ? "true" : undefined}>Tous</Link>
            {clients.slice(0, 6).map((c) => <Link key={c.id} href={href({ client: c.id })} aria-current={scope.clientFilter === c.id ? "true" : undefined}>{c.name}</Link>)}
          </div>
        )}
        <Period days={days} href={(d) => href({ days: d })} />
      </PageTop>
      <Dashboard scope={scope} base="/app" days={days} emptyHint={<><Link href="/app/sources">Connectez votre outil d&apos;appel ou importez un CSV</Link> pour commencer.</>} />
    </>
  );
}
