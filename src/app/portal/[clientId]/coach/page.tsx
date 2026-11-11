import { requireClientScope } from "@/lib/access";
import { CoachPage } from "@/components/pages";
export const metadata = { title: "Coach IA" };
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await requireClientScope((await params).clientId);
  return <CoachPage scope={scope} base={`/portal/${scope.clientId}`} sp={await searchParams} />;
}
