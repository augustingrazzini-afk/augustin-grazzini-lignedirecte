import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { changePassword, deleteOrganization, inviteTeammate, revokeMcpToken, saveOffer } from "@/app/actions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";
import { AlertSettings } from "@/components/AlertSettings";

export const metadata = { title: "Réglages" };
export default async function Page() {
  const scope = await requireOrgScope();
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId }, include: { members: { include: { user: true } } } });
  const me = org.members.find((m) => m.userId === scope.userId);
  const hasPassword = !!(await db.user.findUnique({ where: { id: scope.userId }, select: { passwordHash: true } }))?.passwordHash;
  const mcp = await db.mcpToken.findMany({ where: { orgId: scope.orgId, revokedAt: null, refreshExpiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 20 });
  const mcpUrl = `${(process.env.APP_URL || "https://trustpipe.fr").replace(/\/$/, "")}/api/mcp`;
  return (
    <>
      <PageTop title="Réglages" subtitle="Votre activité et votre équipe" />
      <div className="grid g-2e">
        <div className="card"><h2>Claude</h2><p className="sub">Branchez Claude sur Trustpipe : il lit vos relances et l&apos;historique de vos prospects, et planifie vos relances à votre place.</p>
          <p className="small" style={{ margin: "0 0 6px" }}>Dans Claude : <b>Réglages › Connecteurs › Ajouter un connecteur personnalisé</b>, puis collez cette adresse :</p>
          <code className="small" style={{ display: "block", padding: "10px 12px", background: "var(--panel)", border: "1px solid var(--stroke-2)", borderRadius: 4, userSelect: "all", wordBreak: "break-all" }}>{mcpUrl}</code>
          <p className="small muted" style={{ margin: "8px 0 14px" }}>Claude vous demandera ensuite de vous connecter à Trustpipe et d&apos;autoriser l&apos;accès. <a href="/claude" target="_blank" rel="noreferrer">Guide et exemples</a>.</p>
          {mcp.length ? <div className="list">{mcp.map((t) => (
            <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span className="who">{t.clientName || "Claude"}<span className="small muted"> · connecté le {t.createdAt.toLocaleDateString("fr-FR")}{t.lastUsedAt ? ` · utilisé le ${t.lastUsedAt.toLocaleDateString("fr-FR")}` : ""}</span></span>
              <form action={revokeMcpToken}><input type="hidden" name="id" value={t.id} /><button className="btn sm" type="submit">Couper l&apos;accès</button></form>
            </div>))}</div> : <p className="small muted" style={{ margin: 0 }}>Aucune connexion active.</p>}
        </div>
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
        <div className="card"><h2>Vos données</h2><p className="sub">Vos appels vous appartiennent : téléchargez-les quand vous voulez (date, commercial, prospect, résultat, résumé, analyse IA et transcription), au format CSV lisible dans Excel.</p>
          <a className="btn" href="/api/export/calls" download>Exporter tous mes appels (CSV)</a>
          <p className="muted small" style={{ margin: "10px 0 0" }}>Après la fin d&apos;un abonnement, les données sont conservées 30 jours puis supprimées.</p>
        </div>
        {scope.role === "owner" && <div className="card"><h2>Supprimer mon espace</h2><p className="sub">Supprime définitivement tous les appels, commerciaux, outils connectés, relances et comptes de cet espace. Exportez vos données avant : c&apos;est irréversible.</p>
          <ActionForm action={deleteOrganization} submit="Supprimer définitivement">
            <label className="full">Tapez le nom de l&apos;espace pour confirmer<input className="input" name="confirm" required autoComplete="off" /></label>
          </ActionForm>
        </div>}
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
