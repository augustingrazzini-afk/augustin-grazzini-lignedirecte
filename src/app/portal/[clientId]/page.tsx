import Link from "next/link";
import { requireClientScope } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { PageTop, Period } from "@/components/Shell";
import { Dashboard } from "@/components/views/Dashboard";
import { redirect } from "next/navigation";
import { pickDays } from "@/components/pages";

export const metadata = { title: "Pilotage" };
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ days?: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  const days = pickDays((await searchParams).days);
  const base = `/portal/${scope.clientId}`;
  // Première connexion d'un commercial invité : le guide de démarrage d'abord.
  const member = await db.clientMember.findUnique({ where: { clientId_userId: { clientId: scope.clientId, userId: scope.userId } }, select: { onboardedAt: true } });
  if (member && !member.onboardedAt) redirect(`${base}/bienvenue`);
  const last = await db.call.findFirst({ where: { clientId: scope.clientId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  return (
    <>
      <PageTop title="Pilotage" subtitle="Vos appels et vos rendez-vous, en direct" live={last ? `En direct · mis à jour ${ago(last.updatedAt)}` : null}><Period days={days} href={(d) => `${base}?days=${d}`} /></PageTop>
      <Dashboard scope={scope} base={base} days={days} emptyHint={<>Vos appels apparaîtront ici dès la première synchronisation. Pas encore fait ? <Link href={`${base}/bienvenue?etape=2`}>Branchez votre outil d&apos;appel</Link>.</>} />
      <p className="muted small" style={{ marginTop: 18 }}><Link href={`${base}/bienvenue`}>Revoir le guide de démarrage</Link></p>
    </>
  );
}
