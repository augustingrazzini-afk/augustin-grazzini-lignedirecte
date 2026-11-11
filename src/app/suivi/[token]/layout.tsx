import type { Metadata } from "next";
import { shareScope } from "@/lib/access";
import { Shell } from "@/components/Shell";
import { after } from "next/server";
import { syncIfStale } from "@/lib/sync";
import { aiEnabled } from "@/lib/ai";

// Lien secret : jamais indexé par les moteurs de recherche.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Lien de suivi en direct partagé par le commercial : lecture seule, sans compte. */
// La synchro « en direct » continue après l'affichage (after) : on lui laisse le temps de finir.
export const maxDuration = 300;

export default async function ShareLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { client } = await shareScope(token);
  after(() => syncIfStale(client.orgId));
  return <Shell base={`/suivi/${token}`} orgName={client.org.name} clientName={client.name} isOrg={false} email="" share widget={{ clientId: client.id, aiReady: aiEnabled(), shareToken: token }}>{children}</Shell>;
}
