import { requireOrgScope } from "@/lib/access";
import { SourcesPage } from "@/components/pages";
export const metadata = { title: "Sources" };
export default async function Page() {
  return <SourcesPage scope={await requireOrgScope()} />;
}
