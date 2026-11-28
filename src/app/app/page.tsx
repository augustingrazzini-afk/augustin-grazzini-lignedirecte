import { FastLink } from "@/components/client/FastLink";
import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { PageTop, Period } from "@/components/Shell";
import { Dashboard } from "@/components/views/Dashboard";
import { pickDays } from "@/lib/period";
import { GettingStarted } from "@/components/views/GettingStarted";
import { isDemoOrg } from "@/lib/demo-ids";
import { Leaderboard } from "@/components/views/Leaderboard";
import { aggCalls } from "@/lib/stats";

export const metadata = { title: "Pilotage" };

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string; client?: string }> }) {
  const sp = await searchParams;
  const days = pickDays(sp.days);
  const scope = await requireOrgScope(sp.client);
  const [clients, last] = await Promise.all([
    db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" } }),
    db.integration.findFirst({ where: { orgId: scope.orgId }, orderBy: { lastSyncAt: { sort: "desc", nulls: "last" } }, select: { lastSyncAt: true } }),
  ]);
  const teamAgg = scope.clientFilter ? [] : await aggCalls(scope, days);
  const href = (p: { days?: number; client?: string | null }) => {
    const q = new URLSearchParams({ days: String(p.days ?? days) });
    const c = p.client === undefined ? scope.clientFilter : p.client;
    if (c) q.set("client", c);
    return `/app?${q}`;
  };
  return (
    <>
      <PageTop title="Pilotage" subtitle={scope.clientFilter ? `Commercial : ${clients.find((c) => c.id === scope.clientFilter)?.name || "appels non attribués"}` : "Toute votre équipe commerciale, en direct"} live={last?.lastSyncAt ? `En direct · synchro ${ago(last.lastSyncAt)}` : null}>
        {clients.length > 0 && (
          <div className="seg" role="group" aria-label="Commercial">
            <FastLink href={href({ client: null })} current={!scope.clientFilter}>Tous</FastLink>
            {clients.slice(0, 6).map((c) => <FastLink key={c.id} href={href({ client: c.id })} current={scope.clientFilter === c.id}>{c.name}</FastLink>)}
          </div>
        )}
        <Period days={days} href={(d) => href({ days: d })} />
      </PageTop>
      {!scope.clientFilter && !isDemoOrg(scope.orgId) && <GettingStarted orgId={scope.orgId} userId={scope.userId} />}
      {!scope.clientFilter && <Leaderboard agg={teamAgg} reps={clients} href={(id) => href({ client: id })} />}
      <div className="mt" />
      <Dashboard scope={scope} base="/app" days={days} emptyHint={<><Link href="/app/clients">Ajoutez vos commerciaux</Link> et <Link href="/app/sources">branchez leur outil d&apos;appel</Link> pour commencer.</>} />
    </>
  );
}
