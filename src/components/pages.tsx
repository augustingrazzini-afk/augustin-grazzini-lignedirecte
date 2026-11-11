// Pages partagées entre l'espace SDR (/app) et le portail client (/portal/[id]).
import type { Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { aiEnabled, type Brief, type CoachResult } from "@/lib/ai";
import { PageTop, Period } from "./Shell";
import { Calls } from "./views/Calls";
import { CallDetail } from "./views/CallDetail";
import { Relances } from "./views/Relances";
import { Sources } from "./views/Sources";
import { ChannelView } from "./views/Channels";
import { Contact } from "./views/Contact";
import { AlertSettings } from "./AlertSettings";
import { BriefPanel } from "./client/BriefPanel";
import { CoachPanel } from "./client/CoachPanel";

export const pickDays = (v?: string) => ([7, 30, 90].includes(Number(v)) ? Number(v) : 30);
const clientOf = (s: Scope) => (s.kind === "client" ? s.clientId : null);

export function CallsPage({ scope, base, sp }: { scope: Scope; base: string; sp: Record<string, string | undefined> }) {
  const days = pickDays(sp.days);
  const keep = (d: number) => `${base}/calls?${new URLSearchParams({ days: String(d), ...(sp.q ? { q: sp.q } : {}), ...(sp.f ? { f: sp.f } : {}), ...(sp.obj ? { obj: sp.obj } : {}) })}`;
  return (
    <>
      <PageTop title="Appels" subtitle="Chaque conversation, résumée, transcrite et classée"><Period days={days} href={keep} /></PageTop>
      <Calls scope={scope} base={base} days={days} q={(sp.q || "").slice(0, 100)} f={sp.f || "conv"} obj={sp.obj || ""} />
    </>
  );
}

export function CallPage({ scope, base, id }: { scope: Scope; base: string; id: string }) {
  return (<><PageTop title="Fiche appel" /><CallDetail scope={scope} base={base} id={id} /></>);
}

export async function BriefPage({ scope, q }: { scope: Scope; q?: string }) {
  const history = await db.brief.findMany({ where: { orgId: scope.orgId, clientId: clientOf(scope) ?? undefined, ...(scope.kind === "client" ? { clientId: scope.clientId } : {}) }, orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <>
      <PageTop title="Brief pré-meeting" subtitle="Tapez un prospect : l'IA prépare votre rendez-vous" />
      <BriefPanel clientId={clientOf(scope)} aiReady={aiEnabled()} initialQuery={(q || "").slice(0, 120)}
        history={history.map((h) => ({ id: h.id, prospect: h.prospect, company: h.company, createdAt: h.createdAt.toISOString(), content: h.content as unknown as Brief }))} />
    </>
  );
}

export async function RelancesPage({ scope, base }: { scope: Scope; base: string }) {
  let alerts: React.ReactNode = null;
  if (scope.kind === "client") {
    const [cm, client] = await Promise.all([db.clientMember.findFirst({ where: { clientId: scope.clientId, userId: scope.userId } }), db.client.findUnique({ where: { id: scope.clientId } })]);
    alerts = <AlertSettings digest={cm?.digest ?? false} slack={client?.slackWebhook ?? null} clientId={scope.clientId} canSlack={!!cm} />;
  }
  return (<><PageTop title="Relances" subtitle="Appels, emails et LinkedIn : ce qui est à faire, quand" /><Relances scope={scope} base={base} />{alerts && <div className="mt">{alerts}</div>}</>);
}

export async function CoachPage({ scope, base, sp }: { scope: Scope; base: string; sp: Record<string, string | undefined> }) {
  const days = pickDays(sp.days);
  const last = await db.coach.findFirst({ where: { orgId: scope.orgId, clientId: clientOf(scope) }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageTop title="Coach IA" subtitle="Diagnostic et plan d'action tirés de vos appels"><Period days={days} href={(d) => `${base}/coach?days=${d}`} /></PageTop>
      <CoachPanel key={days} clientId={clientOf(scope)} days={days} aiReady={aiEnabled()} last={last ? { at: last.createdAt.toISOString(), days: last.days, r: last.content as unknown as CoachResult } : null} />
    </>
  );
}

export function ChannelPage({ scope, base, sp, channel }: { scope: Scope; base: string; sp: Record<string, string | undefined>; channel: "email" | "linkedin" }) {
  const days = pickDays(sp.days);
  const path = channel === "email" ? "emails" : "linkedin";
  return (
    <>
      <PageTop title={channel === "email" ? "Cold email" : "LinkedIn"} subtitle={channel === "email" ? "Envois, réponses et rendez-vous de vos campagnes email" : "Invitations, réponses et rendez-vous sur LinkedIn"}><Period days={days} href={(d) => `${base}/${path}?days=${d}${sp.f ? `&f=${sp.f}` : ""}`} /></PageTop>
      <ChannelView scope={scope} base={base} days={days} channel={channel} filter={sp.f || "replies"} />
    </>
  );
}

export function ContactPage({ scope, base, contactKey }: { scope: Scope; base: string; contactKey: string }) {
  return (<><PageTop title="Fiche prospect" subtitle="Tout l'historique, tous canaux confondus" /><Contact scope={scope} base={base} contactKey={decodeURIComponent(contactKey).slice(0, 200)} /></>);
}

export function SourcesPage({ scope }: { scope: Scope }) {
  return (<><PageTop title="Sources" subtitle="Connectez vos outils, importez un CSV ou ajoutez un appel à la main" /><Sources scope={scope} /></>);
}
