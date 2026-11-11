import { shareScope } from "@/lib/access";
import { aiEnabled } from "@/lib/ai";
import { PageTop } from "@/components/Shell";
import { Assistant } from "@/components/client/Assistant";

export const metadata = { title: "Assistant IA" };

/** Le client du freelance prépare ses rendez-vous et fait résumer ses appels, sans compte. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { client } = await shareScope(token);
  return (
    <>
      <PageTop title="Assistant IA" subtitle="Préparez vos rendez-vous et faites résumer les appels menés pour vous" />
      <Assistant clientId={client.id} isClient aiReady={aiEnabled()} shareToken={token} />
    </>
  );
}
