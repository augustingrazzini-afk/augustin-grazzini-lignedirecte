import Link from "next/link";
import { currentUser } from "@/lib/session";
import { PLANS, TRIAL_DAYS } from "@/lib/billing";
import { Logo } from "@/components/Logo";

/** Les captures viennent de l'application elle-même, avec des données de démonstration fictives. */
const SECTIONS = [
  {
    img: "/screens/fiche-appel.jpg",
    tag: "Analyse d'appel",
    title: "Chaque appel, résumé et décortiqué par l'IA",
    text: "Dès qu'un appel arrive, l'IA écrit le résumé, repère les objections et vérifie si le commercial les a passées. La transcription complète est à côté, horodatée.",
    points: ["Résumé en 3 à 5 points", "Objections classées : timing, budget, pas décideur…", "Transcription et enregistrement"],
  },
  {
    img: "/screens/objections.jpg",
    tag: "Objections et créneaux",
    title: "Sachez ce qui bloque, et quand appeler",
    text: "Les objections les plus fréquentes, la part réellement passée, et la carte des créneaux où vos prospects décrochent vraiment.",
    points: ["Top des objections sur la période", "Part passée / non passée", "Meilleur créneau d'appel, heure de Paris"],
    narrow: true,
  },
  {
    img: "/screens/appels.jpg",
    tag: "Tous les appels",
    title: "Toutes vos conversations, au même endroit",
    text: "Minari, Aircall, Ringover, HubSpot ou un simple CSV : tout arrive ici. Filtrez par RDV, par objection, ou cherchez un prospect en une seconde.",
    points: ["Synchronisation automatique", "Filtres par résultat et par objection", "Recherche plein texte"],
  },
  {
    img: "/screens/suivi-client.jpg",
    tag: "Suivi en direct par le client",
    title: "Un lien, et votre client suit vos appels en live",
    text: "Partagez un lien à votre client : il voit vos performances et ses appels en direct, par jour, semaine, mois ou année. Sans compte, sans mot de passe. Fini les reportings du vendredi.",
    points: ["Un lien secret par client, désactivable", "Stats par jour, semaine, mois, année", "Appels, résumés et transcriptions en lecture seule"],
  },
  {
    img: "/screens/relances.jpg",
    tag: "Relances",
    title: "Plus aucun « rappelez-moi en mars » oublié",
    text: "Les relances sont créées automatiquement à partir de ce qui s'est dit au téléphone, avec une date. Chaque matin, la liste de ce qui est à faire.",
    points: ["Relances datées automatiquement", "Récap chaque matin par email", "Fait, reporté ou ignoré en un clic"],
  },
  {
    img: "/screens/equipe.jpg",
    tag: "Équipe",
    title: "La performance de chaque commercial",
    text: "Appels, taux de décroché, conversations et rendez-vous, commercial par commercial. Vous voyez tout de suite qui a besoin d'aide.",
    points: ["Comparatif par commercial", "Sur 7, 30 ou 90 jours", "Coach IA : diagnostic et plan d'action"],
  },
];

export default async function Home() {
  const u = await currentUser();
  return (
    <div className="landing">
      <header className="lp-nav">
        <Logo size={24} />
        <div className="row" style={{ gap: 8 }}>
          <a className="btn lp-hide-sm" href="#tarifs">Tarifs</a>
          <Link className="btn" href={u ? "/app" : "/login"}>{u ? "Ouvrir mon espace" : "Connexion"}</Link>
        </div>
      </header>

      <section className="lp-hero">
        <span className="lp-tag">Pour les SDR freelances et les agences de prospection</span>
        <h1>Votre reporting et vos stats, en un seul endroit, par client.</h1>
        <p className="lead">Et vos clients suivent en direct vos performances et vos appels, avec un simple lien. Chaque appel est résumé par l&apos;IA, les objections sont classées, les relances se créent toutes seules.</p>
        <div className="row" style={{ marginTop: 24, gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary lp-cta" href="/login">Essayer {TRIAL_DAYS} jours gratuitement</Link>
          <a className="btn lp-cta" href="#produit">Voir le produit</a>
        </div>
        <p className="lp-note">Sans carte bancaire · Minari, Aircall, Ringover, HubSpot ou CSV</p>
        <figure className="lp-shot lp-shot-hero">
          <img src="/screens/pilotage.jpg" alt="Tableau de pilotage : rendez-vous pris, appels passés, taux de décroché, activité et entonnoir" width={2880} height={1800} />
        </figure>
      </section>

      <section className="lp-strip">
        {[["Reporting", "par client, en un seul endroit"], ["Suivi live", "partagé par un simple lien"], ["Résumé IA", "de chaque appel transcrit"], ["Relances", "datées automatiquement"]].map(([a, b]) => (
          <div key={a}><b>{a}</b><span>{b}</span></div>
        ))}
      </section>

      <div id="produit">
        {SECTIONS.map((s, i) => (
          <section key={s.img} className={`lp-feature${i % 2 ? " rev" : ""}`}>
            <div className="lp-copy">
              <span className="lp-tag">{s.tag}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <figure className={`lp-shot${s.narrow ? " narrow" : ""}`}>
              <img src={s.img} alt={s.title} loading="lazy" />
            </figure>
          </section>
        ))}
      </div>

      <section id="tarifs" className="lp-pricing">
        <h2 className="lp-h2">Un prix simple</h2>
        <p className="lead" style={{ margin: "0 auto 28px", textAlign: "center" }}>{TRIAL_DAYS} jours d&apos;essai gratuit, sans engagement.</p>
        <div className="grid g-2e">
          {(["solo", "agency"] as const).map((id) => (
            <div key={id} className={`card price${id === "agency" ? " lp-best" : ""}`}>
              <h2>{PLANS[id].name}</h2>
              <div className="amt">{PLANS[id].price} €<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> HT / mois</span></div>
              <ul>
                <li>{Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} espaces clients` : "Espaces clients illimités"}</li>
                <li>Analyse IA de chaque appel</li>
                <li>Relances, brief pré-meeting et coach IA</li>
                {id === "agency" && <li>Plusieurs commerciaux</li>}
              </ul>
              <Link className={`btn${id === "agency" ? " primary" : ""}`} href="/login" style={{ marginTop: 8 }}>Commencer l&apos;essai</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <h2 className="lp-h2">Votre reporting par client, et vos clients en live.</h2>
        <Link className="btn primary lp-cta" href="/login">Essayer {TRIAL_DAYS} jours gratuitement</Link>
      </section>
      <p className="lp-foot">Captures réalisées avec des données de démonstration fictives.</p>
    </div>
  );
}
