import { shareScope } from "@/lib/access";
import { pickDays } from "@/lib/period";
import { PageTop, Period } from "@/components/Shell";
import { Calls } from "@/components/views/Calls";

export const metadata = { title: "Appels" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const { scope } = await shareScope(token);
  const sp = await searchParams;
  const days = pickDays(sp.days);
  const base = `/suivi/${token}`;
  const keep = (d: number) => `${base}/calls?${new URLSearchParams({ days: String(d), ...(sp.q ? { q: sp.q } : {}), ...(sp.f ? { f: sp.f } : {}), ...(sp.obj ? { obj: sp.obj } : {}) })}`;
  return (
    <>
      <PageTop title="Appels" subtitle="Chaque conversation, résumée, transcrite et classée"><Period days={days} href={keep} /></PageTop>
      <Calls scope={scope} base={base} days={days} q={(sp.q || "").slice(0, 100)} f={sp.f || "conv"} obj={sp.obj || ""} readOnly />
    </>
  );
}
