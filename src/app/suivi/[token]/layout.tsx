import type { Metadata } from "next";
import { shareScope } from "@/lib/access";
import { Shell } from "@/components/Shell";

// Lien secret : jamais indexé par les moteurs de recherche.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Lien de suivi en direct partagé par le commercial : lecture seule, sans compte. */
export default async function ShareLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { client } = await shareScope(token);
  return <Shell base={`/suivi/${token}`} orgName={client.org.name} clientName={client.name} isOrg={false} email="" share>{children}</Shell>;
}
