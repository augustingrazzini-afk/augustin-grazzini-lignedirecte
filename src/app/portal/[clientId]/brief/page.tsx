import { requireClientScope } from "@/lib/access";
import { BriefPage } from "@/components/pages";
export const metadata = { title: "Brief pré-meeting" };
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ q?: string }> }) {
  return <BriefPage scope={await requireClientScope((await params).clientId)} q={(await searchParams).q} />;
}
