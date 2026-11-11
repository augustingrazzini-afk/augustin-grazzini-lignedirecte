import { requireClientScope } from "@/lib/access";
import { RelancesPage } from "@/components/pages";
export const metadata = { title: "Relances" };
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  return <RelancesPage scope={scope} base={`/portal/${scope.clientId}`} />;
}
