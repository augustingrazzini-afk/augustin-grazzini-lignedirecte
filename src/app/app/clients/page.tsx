import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { maxClients } from "@/lib/billing";
import { fmt } from "@/lib/format";
import { createClient } from "@/app/actions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";

export const metadata = { title: "Clients" };
export default async function Page() {
  const scope = await requireOrgScope();
  const [org, clients, unassigned] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: scope.orgId } }),
    db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" }, include: { _count: { select: { calls: true, members: true } } } }),
    db.call.count({ where: { orgId: scope.orgId, clientId: null } }),
  ]);
  const max = maxClients(org);
  return (
    <>
      <PageTop title="Clients" subtitle="Chaque client a son espace : il ne voit que ses appels" />
      <div className="grid g-2">
        <div className="card"><h2>Vos clients</h2><p className="sub">{clients.length}{Number.isFinite(max) ? ` / ${max}` : ""} client(s) · {fmt(unassigned)} appel(s) non rangés</p>
          {clients.length ? <div className="list">{clients.map((c) => (
            <Link key={c.id} className="item" href={`/app/clients/${c.id}`}>
              <span className="av">{c.name.slice(0, 2).toUpperCase()}</span>
              <span className="who">{c.name}</span><span className="meta">{fmt(c._count.calls)} appels</span>
              <span className="sum">{c._count.members ? `${c._count.members} accès client` : "Pas encore d'accès client"}</span>
            </Link>
          ))}</div> : <div className="empty"><b>Aucun client</b>Créez votre premier client à droite.</div>}
        </div>
        <div className="card"><h2>Nouveau client</h2><p className="sub">Indiquez la liste ou la campagne utilisée pour lui : ses appels y seront rangés automatiquement.</p>
          <ActionForm action={createClient} submit="Créer le client">
            <label className="full">Nom du client<input className="input" name="name" required placeholder="Smoteo" /></label>
            <label className="full">Liste ou campagne de ses appels (facultatif)<input className="input" name="list" placeholder="Nom exact de la liste dans votre outil" /></label>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
