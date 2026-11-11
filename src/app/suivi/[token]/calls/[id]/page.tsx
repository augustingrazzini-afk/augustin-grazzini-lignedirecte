import { shareScope } from "@/lib/access";
import { PageTop } from "@/components/Shell";
import { CallDetail } from "@/components/views/CallDetail";

export const metadata = { title: "Fiche appel" };
export default async function Page({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const { scope } = await shareScope(token);
  return (<><PageTop title="Fiche appel" /><CallDetail scope={scope} base={`/suivi/${token}`} id={id} readOnly /></>);
}
