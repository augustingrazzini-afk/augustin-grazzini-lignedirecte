import { requireOrgScope } from "@/lib/access";
import { ChannelPage } from "@/components/pages";
export const metadata = { title: "LinkedIn" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <ChannelPage scope={await requireOrgScope(sp.client)} base="/app" sp={sp} channel="linkedin" />;
}
