import { requireClientScope } from "@/lib/access";
import { CallPage } from "@/components/pages";
export const metadata = { title: "Fiche appel" };
export default async function Page({ params }: { params: Promise<{ clientId: string; id: string }> }) {
  const p = await params;
  const scope = await requireClientScope(p.clientId);
  return <CallPage scope={scope} base={`/portal/${scope.clientId}`} id={p.id} />;
}
