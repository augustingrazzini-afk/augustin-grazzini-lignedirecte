import { shareScope } from "@/lib/access";
import { pickDays } from "@/lib/period";
import { PageTop, Period } from "@/components/Shell";
import { ChannelView } from "@/components/views/Channels";

export const metadata = { title: "LinkedIn" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ days?: string; f?: string }> }) {
  const { token } = await params;
  const { scope } = await shareScope(token);
  const sp = await searchParams;
  const days = pickDays(sp.days);
  const base = `/suivi/${token}`;
  return (
    <>
      <PageTop title="LinkedIn" subtitle="Invitations, réponses et rendez-vous sur LinkedIn"><Period days={days} href={(d) => `${base}/linkedin?days=${d}${sp.f ? `&f=${sp.f}` : ""}`} /></PageTop>
      <ChannelView scope={scope} base={base} days={days} channel="linkedin" filter={sp.f || "replies"} readOnly />
    </>
  );
}
