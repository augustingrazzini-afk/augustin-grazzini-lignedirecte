import { requireOrgScope } from "@/lib/access";
import { CoachPage } from "@/components/pages";
export const metadata = { title: "Coach IA" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CoachPage scope={await requireOrgScope()} base="/app" sp={await searchParams} />;
}
