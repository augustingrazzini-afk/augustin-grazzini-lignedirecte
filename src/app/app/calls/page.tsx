import { requireOrgScope } from "@/lib/access";
import { CallsPage } from "@/components/pages";
export const metadata = { title: "Appels" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CallsPage scope={await requireOrgScope()} base="/app" sp={await searchParams} />;
}
