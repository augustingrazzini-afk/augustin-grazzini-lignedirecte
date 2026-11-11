import { requireOrgScope } from "@/lib/access";
import { PageTop } from "@/components/Shell";
import { Meetings } from "@/components/views/Meetings";

export const metadata = { title: "Rendez-vous" };
export default async function Page({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const scope = await requireOrgScope((await searchParams).client);
  return (<><PageTop title="Rendez-vous" subtitle="Les rendez-vous menés, avec le débrief de l'IA" /><Meetings scope={scope} base="/app" /></>);
}
