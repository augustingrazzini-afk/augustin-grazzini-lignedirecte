import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";
import { addRule, deleteClient, deleteRule, inviteClientUser, removeClientUser, saveOffer } from "@/app/actions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";

const FIELD: Record<string, string> = { list: "Liste", campaign: "Campagne", tag: "Tag", number: "Numéro appelé", company: "Entreprise du prospect" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const scope = await requireOrgScope();
  const client = await db.client.findFirst({ where: { id: (await params).id, orgId: scope.orgId }, include: { rules: true, members: { include: { user: true } }, _count: { select: { calls: true } } } });
  if (!client) notFound();
  const lists = await db.call.groupBy({ by: ["provider", "listName"], where: { orgId: scope.orgId, clientId: null, NOT: { listName: "" } }, _count: true, orderBy: { _count: { listName: "desc" } }, take: 12 });
  return (
    <>
      <PageTop title={client.name} subtitle={`${fmt(client._count.calls)} appels rangés dans son espace`}>
        <Link className="btn" href={`/portal/${client.id}`}>Voir son espace</Link>
        <Link className="btn" href={`/app?client=${client.id}`}>Ses stats</Link>
      </PageTop>
      <div className="grid g-2">
        <div className="stack">
          <div className="card"><h2>Rangement automatique</h2><p className="sub">Un appel qui correspond à une de ces règles apparaît dans l&apos;espace de {client.name}.</p>
            {client.rules.length ? <div className="list">{client.rules.map((r) => (
              <div key={r.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span className="who">{FIELD[r.field] || r.field} = « {r.value} »{r.provider && <span> · {SOURCE_LABEL[r.provider]}</span>}</span>
                <form action={deleteRule}><input type="hidden" name="ruleId" value={r.id} /><input type="hidden" name="clientId" value={client.id} /><button className="btn sm danger">Retirer</button></form>
              </div>
            ))}</div> : <p className="muted">Aucune règle : rangez les appels à la main depuis leur fiche, ou ajoutez une règle.</p>}
            <div style={{ marginTop: 14 }}><ActionForm action={addRule} submit="Ajouter la règle" hidden={{ clientId: client.id }}>
              <label>Critère<select className="select" name="field">{Object.entries(FIELD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Source<select className="select" name="provider"><option value="">Toutes</option>{Object.entries(SOURCE_LABEL).filter(([k]) => !["csv", "manual"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="full">Valeur exacte<input className="input" name="value" required list="lists" placeholder="ex. Smoteo - Q1" /></label>
              <datalist id="lists">{lists.map((l) => <option key={l.provider + l.listName} value={l.listName} />)}</datalist>
            </ActionForm></div>
            {lists.length > 0 && <p className="muted small" style={{ margin: "10px 0 0" }}>Listes non rangées : {lists.map((l) => `${l.listName} (${l._count})`).join(", ")}</p>}
          </div>
          <div className="card"><h2>Son offre</h2><p className="sub">Ce que vend {client.name} : l&apos;IA s&apos;en sert pour ses briefs et son coach.</p>
            <ActionForm action={saveOffer} submit="Enregistrer" hidden={{ clientId: client.id }}><textarea className="input full" name="offer" rows={4} defaultValue={client.offer} /></ActionForm>
          </div>
        </div>
        <div className="stack">
          <div className="card"><h2>Accès à son espace</h2><p className="sub">Chaque personne reçoit un lien de connexion par email. Elle ne voit que les appels de {client.name}.</p>
            {client.members.length > 0 && <div className="list" style={{ marginBottom: 14 }}>{client.members.map((m) => (
              <div key={m.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span className="who">{m.user.email}</span>
                <form action={removeClientUser}><input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="userId" value={m.userId} /><button className="btn sm danger">Retirer</button></form></div>
            ))}</div>}
            <ActionForm action={inviteClientUser} submit="Inviter" hidden={{ clientId: client.id }}><label className="full">Email<input className="input" type="email" name="email" required placeholder="prenom@client.fr" /></label></ActionForm>
          </div>
          {scope.role === "owner" && <div className="card"><h2>Supprimer ce client</h2><p className="sub">Ses appels restent dans votre espace, non rangés. Ses accès sont retirés.</p>
            <form action={deleteClient}><input type="hidden" name="clientId" value={client.id} /><button className="btn danger">Supprimer {client.name}</button></form></div>}
        </div>
      </div>
    </>
  );
}
