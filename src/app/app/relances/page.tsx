import { requireOrgScope } from "@/lib/access";
import { RelancesPage } from "@/components/pages";
export const metadata = { title: "Relances" };
export default async function Page() {
  return <RelancesPage scope={await requireOrgScope()} base="/app" />;
}
