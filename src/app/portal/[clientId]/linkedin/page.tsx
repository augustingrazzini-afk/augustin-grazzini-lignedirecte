import { requireClientScope } from "@/lib/access";
import { ChannelPage } from "@/components/pages";
export const metadata = { title: "LinkedIn" };
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await requireClientScope((await params).clientId);
  return <ChannelPage scope={scope} base={`/portal/${scope.clientId}`} sp={await searchParams} channel="linkedin" />;
}
