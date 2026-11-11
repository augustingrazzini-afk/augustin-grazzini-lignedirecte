import { requireClientScope } from "@/lib/access";
import { CallsPage } from "@/components/pages";
export const metadata = { title: "Appels" };
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await requireClientScope((await params).clientId);
  return <CallsPage scope={scope} base={`/portal/${scope.clientId}`} sp={await searchParams} />;
}
