import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { changePassword, inviteTeammate, saveOffer } from "@/app/actions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";
import { AlertSettings } from "@/components/AlertSettings";

export const metadata = { title: "Réglages" };
export default async function Page() {
  const scope = await requireOrgScope();
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId }, include: { members: { include: { user: true } } } });
  const me = org.members.find((m) => m.userId === scope.userId);
  const hasPassword = !!(await db.user.findUnique({ where: { id: scope.userId }, select: { passwordHash: true } }))?.passwordHash;
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
        <AlertSettings digest={me?.digest ?? true} slack={org.slackWebhook} canSlack={scope.role === "owner"} />
        <div className="card"><h2>Mot de passe</h2><p className="sub">{hasPassword ? "Changez votre mot de passe de connexion." : "Définissez un mot de passe pour vous connecter sans attendre de lien par email."}</p>
          <ActionForm action={changePassword} submit={hasPassword ? "Changer le mot de passe" : "Enregistrer le mot de passe"}>
            {hasPassword && <label className="full">Mot de passe actuel<input className="input" type="password" name="current" required autoComplete="current-password" /></label>}
            <label className="full">{hasPassword ? "Nouveau mot de passe" : "Mot de passe"}<input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" /><span className="small" style={{ color: "var(--dim)" }}>Au moins 10 caractères.</span></label>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
