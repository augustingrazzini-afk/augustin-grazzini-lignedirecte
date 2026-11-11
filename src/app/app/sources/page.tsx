import { requireOrgScope } from "@/lib/access";
import { SourcesPage } from "@/components/pages";
import { MCP_SERVERS } from "@/lib/mcp";
export const metadata = { title: "Sources" };
export default async function Page({ searchParams }: { searchParams: Promise<{ erreur?: string; connecte?: string }> }) {
  const sp = await searchParams;
  const ok = sp.connecte && MCP_SERVERS[sp.connecte]?.label;
  return (
    <>
      {ok && <div className="banner ok">✓ <b>{ok} est connecté.</b> La première synchronisation (90 derniers jours) est en cours : vos appels arrivent dans quelques minutes.</div>}
      {sp.erreur && <div className="banner err">{sp.erreur.slice(0, 200)}</div>}
      <SourcesPage scope={await requireOrgScope()} />
    </>
  );
}
