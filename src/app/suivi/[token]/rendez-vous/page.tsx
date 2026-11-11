import { shareScope } from "@/lib/access";
import { PageTop } from "@/components/Shell";
import { Meetings } from "@/components/views/Meetings";

export const metadata = { title: "Mes rendez-vous" };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope } = await shareScope(token);
  return (<><PageTop title="Mes rendez-vous" subtitle="Ajoutez vos rendez-vous : l'IA en fait le débrief et le relie à l'appel de prospection" /><Meetings scope={scope} base={`/suivi/${token}`} shareToken={token} /></>);
}
