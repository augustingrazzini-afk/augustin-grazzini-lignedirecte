import { requireOrgScope } from "@/lib/access";
import { BriefPage } from "@/components/pages";
export const metadata = { title: "Brief pré-meeting" };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <BriefPage scope={await requireOrgScope()} q={(await searchParams).q} />;
}
