import Link from "next/link";
import { currentUser } from "@/lib/session";
import { PLANS } from "@/lib/billing";

export default async function Home() {
  const u = await currentUser();
  return (
    <div className="landing">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 10 }}><img src="/logo-mark.png" alt="" style={{ width: 40, background: "var(--navy)", borderRadius: 11, padding: 5 }} /><div className="wm" style={{ color: "var(--ink)" }}><span>Ligne</span><b>Directe</b></div></div>
        <Link className="btn" href={u ? "/app" : "/login"}>{u ? "Ouvrir mon espace" : "Connexion"}</Link>
      </div>
      <h1>Vos appels de prospection, en direct chez vos clients.</h1>
      <p className="lead">Pour les SDR freelances et les agences : connectez Minari, Aircall, Ringover, HubSpot ou un simple CSV. Chaque client a son espace avec ses appels, ses transcriptions et ses rendez-vous. L&apos;IA prépare les briefs et repère les relances.</p>
      <div className="row" style={{ marginTop: 24 }}><Link className="btn primary" href="/login">Essayer 14 jours gratuitement</Link></div>
      <div className="grid g-2e" style={{ marginTop: 56 }}>
        {[["Reporting en direct", "Fini les captures d'écran du vendredi : vos clients suivent appels, décrochés et RDV en temps réel."], ["Un espace par client", "Chaque client ne voit que ses appels. Ses commerciaux peuvent aussi y ajouter les leurs."], ["Toutes vos sources", "Minari, Aircall, Ringover, HubSpot, lemlist, CSV ou ajout manuel avec enregistrement."], ["L'IA au service des RDV", "Résumé de chaque appel, objections classées, brief pré-meeting et coach."]].map(([t, d]) => (
          <div key={t} className="card"><h2>{t}</h2><p className="muted" style={{ margin: "8px 0 0" }}>{d}</p></div>
        ))}
      </div>
      <div className="grid g-2e" style={{ marginTop: 16 }}>
        {(["solo", "agency"] as const).map((id) => <div key={id} className="card price"><h2>{PLANS[id].name}</h2><div className="amt">{PLANS[id].price} €<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> HT / mois</span></div><p className="muted" style={{ margin: 0 }}>{Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} espaces clients` : "Espaces clients illimités, plusieurs commerciaux"}</p></div>)}
      </div>
    </div>
  );
}
