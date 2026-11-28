import { Btn } from "@/components/client/Btn";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgScope } from "@/lib/access";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/providers";
import { addRule, deleteClient, deleteRule, disableShareLink, inviteClientUser, removeClientUser, saveOffer, updateRep } from "@/app/actions";
import { CopyButton } from "@/components/client/CallActions";
import { PageTop } from "@/components/Shell";
import { ActionForm } from "@/components/client/ActionForm";
import { AlertSettings } from "@/components/AlertSettings";
import { KIND_LABEL, membersAgg } from "@/components/views/Leaderboard";

const FIELD: Record<string, string> = { rep: "Nom du commercial dans l'outil", list: "Liste", campaign: "Campagne", tag: "Tag", number: "Numéro appelé", company: "Entreprise du prospect" };

/** Fiche d'un commercial suivi par la boîte : attribution de ses appels, invitation, outil branché. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const scope = await requireOrgScope();
  const rep = await db.client.findFirst({ where: { id: (await params).id, orgId: scope.orgId }, include: { rules: true, members: { include: { user: true } }, integrations: true, _count: { select: { calls: true } } } });
  if (!rep) notFound();
  const shareUrl = rep.shareToken ? `${process.env.APP_URL || ""}/suivi/${rep.shareToken}` : null;
  const [lists, names] = await Promise.all([
    db.call.groupBy({ by: ["provider", "listName"], where: { orgId: scope.orgId, clientId: null, NOT: { listName: "" } }, _count: true, orderBy: { _count: { listName: "desc" } }, take: 12 }),
    db.call.groupBy({ by: ["repName"], where: { orgId: scope.orgId, clientId: null, NOT: { repName: "" } }, _count: true, orderBy: { _count: { repName: "desc" } }, take: 12 }),
  ]);
  // Qui appelle pour ce commercial (les personnes d'une agence, par exemple), d'après leur nom dans l'outil d'appel.
  const team = (await db.call.groupBy({ by: ["repName"], where: { orgId: scope.orgId, clientId: rep.id, kind: { not: "meeting" }, NOT: { repName: "" } }, _count: { _all: true } })).length
    ? membersAgg((await db.$queryRaw<{ repName: string; total: number; connected: number; conv: number; rdv: number }[]>`
        SELECT "repName", count(*)::int AS total, (count(*) FILTER (WHERE connected))::int AS connected,
          (count(*) FILTER (WHERE connected AND "durationSec" >= 30))::int AS conv, (count(*) FILTER (WHERE "meetingBooked"))::int AS rdv
        FROM "Call" WHERE "orgId" = ${scope.orgId} AND "clientId" = ${rep.id} AND kind <> 'meeting' AND "repName" <> '' GROUP BY 1`)
        .map((r) => ({ ...r, clientId: rep.id, day: "", dow: 0, hour: 0, talk: 0, convSec: 0 })))
    : [];
  const joined = rep.members.some((m) => m.joinedAt);
  const status = rep.integrations.length ? `Outil branché : ${rep.integrations.map((i) => SOURCE_LABEL[i.provider] || i.label).join(", ")}` : joined ? "Connecté, outil pas encore branché" : rep.members.length ? "Invité, pas encore connecté" : "Pas encore invité";
  const memberState = (m: { joinedAt: Date | null; onboardedAt: Date | null }) => rep.integrations.length ? <span className="pill win">Outil branché</span> : m.joinedAt ? <span className="pill">Connecté · outil à brancher</span> : <span className="pill bad">Invité · pas encore connecté</span>;
  return (
    <>
      <PageTop title={rep.name} subtitle={`${[KIND_LABEL[rep.kind] || "Interne", rep.agency].filter(Boolean).join(" · ")} · ${fmt(rep._count.calls)} appels · ${status}`}>
        <Link className="btn primary" href={`/app?client=${rep.id}`}>Ses résultats</Link>
        <Link className="btn" href={`/app/calls?client=${rep.id}`}>Ses appels</Link>
      </PageTop>
      {(team.length > 1 || (rep.kind === "agence" && team.length > 0)) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{rep.kind === "agence" ? `Qui appelle chez ${rep.agency || rep.name}` : `Qui appelle pour ${rep.name}`}</h2>
          <p className="sub">{team.length} personne{team.length > 1 ? "s" : ""}, d&apos;après leur nom dans l&apos;outil d&apos;appel · classées par rendez-vous pris, depuis le début</p>
          <div className="lb">
            <div className="lb-row lb-team lb-h"><span>#</span><span>Personne</span><span>Appels</span><span>Décroché</span><span>Conversations</span><span>RDV</span></div>
            {team.map((m, i) => (
              <Link key={m.name} className="lb-row lb-team" href={`/app/calls?client=${rep.id}&q=${encodeURIComponent(m.name)}`}>
                <span className="lb-rank">{i + 1}</span><span className="lb-who"><b>{m.name}</b></span>
                <span>{fmt(m.total)}</span><span>{m.total ? Math.round((m.connected / m.total) * 100) : 0} %</span><span>{fmt(m.conv)}</span>
                <span className="lb-rdv"><b>{fmt(m.rdv)}</b><i style={{ width: `${(m.rdv / Math.max(1, team[0].rdv)) * 100}%` }} /></span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="grid g-2">
        <div className="stack">
          <div className="card"><h2>Inviter {rep.name}</h2><p className="sub">Il reçoit un lien de connexion par email et branche son outil d&apos;appel (Minari, Aircall, Ringover, lemlist…) en 2 minutes. Ses appels arrivent ensuite ici en direct. Dans son espace, il ne voit que ses propres appels.</p>
            {rep.members.length > 0 && <div className="list" style={{ marginBottom: 14 }}>{rep.members.map((m) => (
              <div key={m.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}><span className="who">{m.user.email}</span>{memberState(m)}
                <form action={removeClientUser}><input type="hidden" name="clientId" value={rep.id} /><input type="hidden" name="userId" value={m.userId} /><Btn className="btn sm danger" row>Retirer</Btn></form></div>
            ))}</div>}
            <ActionForm action={inviteClientUser} submit={rep.members.length ? "Inviter une autre adresse" : "Envoyer l'invitation"} hidden={{ clientId: rep.id }}><label className="full">Email<input className="input" type="email" name="email" required placeholder="prenom@exemple.fr" /></label></ActionForm>
          </div>
          <div className="card"><h2>Attribution automatique</h2><p className="sub">Utile si {rep.name} appelle depuis votre outil : un appel qui correspond à une de ces règles lui est attribué. Les appels de l&apos;outil qu&apos;il branche lui-même lui reviennent d&apos;office.</p>
            {rep.rules.length ? <div className="list">{rep.rules.map((r) => (
              <div key={r.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span className="who">{FIELD[r.field] || r.field} = « {r.value} »{r.provider && <span> · {SOURCE_LABEL[r.provider]}</span>}</span>
                <form action={deleteRule}><input type="hidden" name="ruleId" value={r.id} /><input type="hidden" name="clientId" value={rep.id} /><Btn className="btn sm danger" row>Retirer</Btn></form>
              </div>
            ))}</div> : <p className="muted">Aucune règle : attribuez les appels depuis leur fiche, ou ajoutez une règle.</p>}
            <div style={{ marginTop: 14 }}><ActionForm action={addRule} submit="Ajouter la règle" hidden={{ clientId: rep.id }}>
              <label>Critère<select className="select" name="field">{Object.entries(FIELD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Source<select className="select" name="provider"><option value="">Toutes</option>{Object.entries(SOURCE_LABEL).filter(([k]) => !["csv", "manual"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="full">Valeur exacte<input className="input" name="value" required list="vals" placeholder={`ex. ${rep.name}`} /></label>
              <datalist id="vals">{names.map((n) => <option key={n.repName} value={n.repName} />)}{lists.map((l) => <option key={l.provider + l.listName} value={l.listName} />)}</datalist>
            </ActionForm></div>
            {names.length > 0 && <p className="muted small" style={{ margin: "10px 0 0" }}>Commerciaux vus dans les appels non attribués : {names.map((n) => `${n.repName} (${n._count})`).join(", ")}</p>}
            {lists.length > 0 && <p className="muted small" style={{ margin: "6px 0 0" }}>Listes non attribuées : {lists.map((l) => `${l.listName} (${l._count})`).join(", ")}</p>}
          </div>
        </div>
        <div className="stack">
          <div className="card"><h2>Fiche</h2>
            <ActionForm action={updateRep} submit="Enregistrer" hidden={{ clientId: rep.id }}>
              <label>Nom<input className="input" name="name" required defaultValue={rep.name} /></label>
              <label>Statut<select className="select" name="kind" defaultValue={rep.kind}><option value="interne">Interne (salarié)</option><option value="freelance">Freelance</option><option value="agence">Agence de prospection</option></select></label>
              <label className="full">Société <span className="muted small">(freelance ou agence)</span><input className="input" name="agency" defaultValue={rep.agency} /></label>
            </ActionForm>
          </div>
          <div className="card"><h2>Ce qu&apos;il vend</h2><p className="sub">Facultatif, si {rep.name} vend une offre différente de la vôtre : l&apos;IA s&apos;en sert pour ses briefs et l&apos;assistant.</p>
            <ActionForm action={saveOffer} submit="Enregistrer" hidden={{ clientId: rep.id }}><textarea className="input full" name="offer" rows={3} defaultValue={rep.offer} /></ActionForm>
          </div>
          <AlertSettings digest={false} slack={rep.slackWebhook} clientId={rep.id} canSlack />
          {shareUrl && <div className="card"><h2>Lien de lecture</h2><p className="sub">Un ancien lien de suivi en lecture seule est encore actif pour {rep.name}.</p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input className="input" readOnly value={shareUrl} style={{ flex: "1 1 260px", minWidth: 0, fontFamily: "var(--f-mono)", fontSize: 13 }} />
              <CopyButton text={shareUrl} label="Copier" />
              <form action={disableShareLink}><input type="hidden" name="clientId" value={rep.id} /><Btn className="btn sm danger">Désactiver</Btn></form>
            </div></div>}
          {scope.role === "owner" && <div className="card"><h2>Retirer ce commercial</h2><p className="sub">Ses appels restent dans votre espace, non attribués. Son accès est retiré.</p>
            <form action={deleteClient}><input type="hidden" name="clientId" value={rep.id} /><Btn className="btn danger">Retirer {rep.name}</Btn></form></div>}
        </div>
      </div>
    </>
  );
}
