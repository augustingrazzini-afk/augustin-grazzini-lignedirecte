import { requireClientScope } from "@/lib/access";
import { ContactPage } from "@/components/pages";
export const metadata = { title: "Fiche prospect" };
export default async function Page({ params }: { params: Promise<{ clientId: string; key: string }> }) {
  const p = await params;
  const scope = await requireClientScope(p.clientId);
  return <ContactPage scope={scope} base={`/portal/${scope.clientId}`} contactKey={p.key} />;
}
