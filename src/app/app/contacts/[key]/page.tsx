import { requireOrgScope } from "@/lib/access";
import { ContactPage } from "@/components/pages";
export const metadata = { title: "Fiche prospect" };
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  return <ContactPage scope={await requireOrgScope()} base="/app" contactKey={(await params).key} />;
}
