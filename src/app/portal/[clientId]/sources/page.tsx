import { requireClientScope } from "@/lib/access";
import { SourcesPage } from "@/components/pages";
export const metadata = { title: "Sources" };
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  return <SourcesPage scope={await requireClientScope((await params).clientId)} />;
}
