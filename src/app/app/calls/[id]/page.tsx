import { requireOrgScope } from "@/lib/access";
import { CallPage } from "@/components/pages";
export const metadata = { title: "Fiche appel ou rendez-vous" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CallPage scope={await requireOrgScope()} base="/app" id={(await params).id} />;
}
