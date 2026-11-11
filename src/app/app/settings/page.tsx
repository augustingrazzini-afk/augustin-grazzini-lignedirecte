import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { inviteTeammate, saveOffer } from "@/app/actions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";

export const metadata = { title: "Réglages" };
export default async function Page() {
  const scope = await requireOrgScope();
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId }, include: { members: { include: { user: true } } } });
  return (
    <>
      <PageTop title="Réglages" subtitle="Votre activité et votre équipe" />
      <div className="grid g-2e">
        <div className="card"><h2>Votre activité</h2><p className="sub">L&apos;IA utilise votre offre pour les briefs et le coach.</p>
          <ActionForm action={saveOffer} submit="Enregistrer">
            <label className="full">Nom<input className="input" name="name" defaultValue={org.name} /></label>
            <label className="full">Votre offre<textarea className="input" name="offer" rows={5} defaultValue={org.offer} placeholder="Ce que vous vendez, à qui, vos points forts" /></label>
          </ActionForm>
        </div>
        <div className="card"><h2>Équipe</h2><p className="sub">Vos commerciaux voient tous les appels de l&apos;espace.</p>
          <div className="list" style={{ marginBottom: 14 }}>{org.members.map((m) => <div key={m.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span className="who">{m.user.email}</span><span className="pill mute">{m.role === "owner" ? "Propriétaire" : "Membre"}</span></div>)}</div>
          {scope.role === "owner" && <ActionForm action={inviteTeammate} submit="Inviter"><label className="full">Email<input className="input" type="email" name="email" required /></label></ActionForm>}
        </div>
      </div>
    </>
  );
}
