import Link from "next/link";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { PLANS, type PlanId, euros, maxClients, PLAN_CAP } from "@/lib/billing";
import { portalLink } from "@/lib/stripe";
import { fmt } from "@/lib/format";
import { createClient } from "@/app/actions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";
import { ListsField } from "@/components/client/ListsField";
import { KIND_LABEL } from "@/components/views/Leaderboard";

export const metadata = { title: "Commerciaux" };

/** Les commerciaux suivis par la boîte : internes, freelances ou agences. (Modèle technique : Client.) */
export default async function Page() {
  const scope = await requireOrgScope();
  const [org, reps, unassigned] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: scope.orgId } }),
    db.client.findMany({ where: { orgId: scope.orgId }, orderBy: { name: "asc" }, include: { _count: { select: { calls: true, members: true, integrations: true } } } }),
    db.call.count({ where: { orgId: scope.orgId, clientId: null } }),
  ]);
  // Listes et noms de commerciaux vus dans les appels synchronisés, proposés à la création.
  const [lists, rules, names] = await Promise.all([
    db.call.groupBy({ by: ["listName"], where: { orgId: scope.orgId, listName: { not: "" } }, _count: { _all: true }, orderBy: { _count: { listName: "desc" } }, take: 40 }),
    db.clientRule.findMany({ where: { orgId: scope.orgId }, select: { field: true, value: true } }),
    db.call.groupBy({ by: ["repName"], where: { orgId: scope.orgId, repName: { not: "" } }, _count: { _all: true }, orderBy: { _count: { repName: "desc" } }, take: 30 }),
  ]);
  const taken = new Set(rules.filter((r) => r.field === "list").map((r) => r.value.toLowerCase()));
  const takenRep = new Set(rules.filter((r) => r.field === "rep").map((r) => r.value.toLowerCase()));
  const known = lists.filter((l) => l.listName).map((l) => ({ name: l.listName!, calls: l._count._all, taken: taken.has(l.listName!.toLowerCase()) }));
  const freeNames = names.filter((n) => n.repName && !takenRep.has(n.repName.toLowerCase()));
  const max = maxClients(org);
  const plan = PLANS[org.plan as PlanId] || PLANS.agency;
  const portal = portalLink();
  return (
    <>
      <PageTop title="Commerciaux" subtitle="Vos commerciaux internes, freelances et agences : chaque appel leur est attribué automatiquement" />
      {Number.isFinite(max) && reps.length >= max && (
        <div className="banner" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span><b>Votre formule {plan.name} couvre {max} commerciaux, tous utilisés.</b> Pour en suivre plus, passez à la formule supérieure.</span>
          <Link className="btn primary" href="/app/billing#changer">Changer de formule</Link>
        </div>
      )}
      <div className="grid g-2">
        <div className="card"><h2>Votre équipe commerciale</h2><p className="sub">{reps.length}{Number.isFinite(max) ? ` / ${max}` : ""} commercial(aux) suivi(s) · {fmt(unassigned)} appel(s) non attribués</p>
          {reps.length ? <div className="list">{reps.map((c) => (
            <Link key={c.id} className="item" href={`/app/clients/${c.id}`}>
              <span className="av">{c.name.slice(0, 2).toUpperCase()}</span>
              <span className="who">{c.name}</span><span className="meta">{fmt(c._count.calls)} appels</span>
              <span className="sum">{[KIND_LABEL[c.kind] || "Interne", c.agency].filter(Boolean).join(" · ")} · {c._count.integrations ? "outil branché" : c._count.members ? "invité" : "pas encore invité"}</span>
            </Link>
          ))}</div> : <div className="empty"><b>Aucun commercial</b>Ajoutez votre premier commercial à droite : interne, freelance ou agence.</div>}
        </div>
        <div className="card"><h2>Ajouter un commercial</h2><p className="sub">Invitez-le : il branche son outil d&apos;appel en 2 minutes et vous voyez ses appels en direct. S&apos;il appelle depuis votre outil, indiquez son nom tel qu&apos;il y apparaît.</p>
          <ActionForm action={createClient} submit="Ajouter le commercial">
            <label>Nom<input className="input" name="name" required placeholder="Ex. : Léa Martin" /></label>
            <label>Statut<select className="select" name="kind" defaultValue="interne"><option value="interne">Interne (salarié)</option><option value="freelance">Freelance</option><option value="agence">Agence de prospection</option></select></label>
            <label>Société <span className="muted small">(freelance ou agence)</span><input className="input" name="agency" placeholder="Ex. : Prospectio" /></label>
            <label>Email <span className="muted small">(pour l&apos;inviter)</span><input className="input" type="email" name="email" placeholder="lea@exemple.fr" /></label>
            <label className="full">Son nom dans votre outil d&apos;appel <span className="muted small">(si vous partagez le même outil)</span><input className="input" name="rep" list="rep-names" placeholder="Ex. : Léa Martin" autoComplete="off" /></label>
            <datalist id="rep-names">{freeNames.map((n) => <option key={n.repName} value={n.repName}>{n._count._all} appels</option>)}</datalist>
            <ListsField known={known} />
          </ActionForm>
          {freeNames.length > 0 && <p className="muted small" style={{ margin: "10px 0 0" }}>Commerciaux vus dans vos appels : {freeNames.slice(0, 8).map((n) => `${n.repName} (${n._count._all})`).join(", ")}</p>}
        </div>
      </div>
    </>
  );
}
