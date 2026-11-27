import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { createOrganization } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";

export const metadata = { title: "Créer votre espace" };
export default async function Page() {
  const u = await requireUser();
  if (u.memberships.length) redirect("/app");
  return (
    <div className="auth">
      <div className="card" style={{ width: "min(520px,100%)" }}>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 28, margin: "0 0 6px", letterSpacing: "-.02em" }}>Créez votre espace</h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>Votre entreprise, puis vos commerciaux : tout au même endroit.</p>
        {u.clientAccess.length > 0 && <div className="banner info">Vous avez aussi accès à l&apos;espace commercial <a href={`/portal/${u.clientAccess[0].clientId}`}>{u.clientAccess[0].client.name}</a>.</div>}
        <ActionForm action={createOrganization} submit="Créer mon espace">
          <label className="full">Nom de votre entreprise<input className="input" name="name" required placeholder="Ex. Nova Logiciels" /></label>
          <label className="full">Ce que vous vendez (facultatif)<textarea className="input" name="offer" rows={3} placeholder="Ex. : logiciel de gestion pour les cabinets comptables, de 10 à 200 salariés…" /></label>
        </ActionForm>
      </div>
    </div>
  );
}
