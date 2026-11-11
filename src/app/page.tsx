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
    img: "/screens/emails.jpg",
    tag: "Cold email",
    title: "Vos campagnes email, enfin lisibles",
    text: "Connectez lemlist, Instantly ou Smartlead : envois, ouvertures, réponses et rendez-vous remontent tout seuls. L'IA classe chaque réponse : positive, objection, absent.",
    points: ["Entonnoir et taux de réponse par campagne", "Réponses classées par l'IA", "Rendez-vous pris par email"],
  },
  {
    img: "/screens/linkedin.jpg",
    tag: "LinkedIn",
    title: "LinkedIn, dans le même tableau de bord",
    text: "Invitations, acceptations, réponses et rendez-vous : votre prospection LinkedIn à côté de vos appels et de vos emails, pour chaque client.",
    points: ["Taux d'acceptation et de réponse", "Réponses classées par l'IA", "Relance créée quand une invitation est acceptée"],
  },
  {
    img: "/screens/suivi-client.jpg",
    tag: "Suivi en direct par le client",
    title: "Un lien, et votre client suit votre prospection en live",
    text: "Partagez un lien à votre client : il voit vos performances en direct, appels, emails et LinkedIn, par jour, semaine, mois ou année. Sans compte, sans mot de passe. Fini les reportings du vendredi.",
    points: ["Un lien secret par client, désactivable", "Appels, emails et LinkedIn, par jour, semaine, mois, année", "Résumés, transcriptions et réponses en lecture seule"],
  },
  {
    img: "/screens/relances.jpg",
    tag: "Relances",
    title: "Plus aucun « rappelez-moi en mars » oublié",
    text: "Les relances sont créées automatiquement à partir des appels, des réponses email et LinkedIn, avec une date. Chaque matin, la liste de ce qui est à faire.",
    points: ["Relances datées automatiquement", "Récap chaque matin par email", "Fait, reporté ou ignoré en un clic"],
  },
  {
    img: "/screens/equipe.jpg",
    tag: "Équipe",
    title: "La performance de chaque commercial",
    text: "Vous êtes plusieurs ? Appels, taux de décroché, conversations et rendez-vous, commercial par commercial : vous voyez tout de suite qui a besoin d'aide.",
    points: ["Comparatif par commercial", "Par jour, semaine, mois ou année", "Coach IA : diagnostic et plan d'action"],
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
        <span className="lp-tag">Pour les SDR freelances et les petites équipes commerciales</span>
        <h1>Votre reporting et vos stats, en un seul endroit, par client.</h1>
        <p className="lead">Appels, cold email et LinkedIn réunis, et vos clients qui suivent en direct vos performances avec un simple lien. Chaque appel est résumé par l&apos;IA, les objections sont classées, les relances se créent toutes seules.</p>
        <div className="row" style={{ marginTop: 24, gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary lp-cta" href="/login">Essayer {TRIAL_DAYS} jours gratuitement</Link>
          <a className="btn lp-cta" href="#produit">Voir le produit</a>
        </div>
        <p className="lp-note">Sans carte bancaire · Connectez vos outils en une minute</p>
        <figure className="lp-shot lp-shot-hero">
          <img src="/screens/multicanal.jpg" alt="Tableau de pilotage : appels, emails et LinkedIn, rendez-vous pris, taux de décroché et entonnoir" width={2880} height={1800} />
        </figure>
      </section>

      <section className="lp-strip">
        {[["Reporting", "par client, en un seul endroit"], ["Suivi live", "partagé par un simple lien"], ["Multicanal", "appels, cold email, LinkedIn"], ["Résumé IA", "de chaque appel transcrit"]].map(([a, b]) => (
          <div key={a}><b>{a}</b><span>{b}</span></div>
        ))}
      </section>

      <section id="video" className="lp-video">
        <h2 className="lp-h2">Trustpipe en 1 minute</h2>
        <figure className="lp-shot">
          <video controls playsInline preload="none" poster="/video/trustpipe-poster.jpg" width={1920} height={1080}>
            <source src="/video/trustpipe-presentation.mp4" type="video/mp4" />
          </video>
        </figure>
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

      <section id="connecteurs" className="lp-tools">
        <span className="lp-tag">Connecteurs</span>
        <h2 className="lp-h2">Connectez vos outils, les stats arrivent toutes seules</h2>
        <p className="lead" style={{ margin: "0 auto 32px", textAlign: "center" }}>Choisissez votre outil, connectez votre compte, c&apos;est tout. Vos appels, emails et messages LinkedIn remontent automatiquement, client par client.</p>
        <div className="lp-tools-grid">
          {[
            ["Téléphone", ["Minari", "Aircall", "Ringover", "HubSpot"]],
            ["Cold email", ["lemlist", "Instantly", "Smartlead", "HubSpot"]],
            ["LinkedIn", ["lemlist", "La Growth Machine*", "Waalaxy*"]],
            ["Et le reste", ["Zapier", "Make", "n8n", "Import CSV"]],
          ].map(([ch, tools]) => (
            <div key={ch as string} className="card"><h2>{ch}</h2><div className="lp-chips">{(tools as string[]).map((t) => <span key={t}>{t}</span>)}</div></div>
          ))}
        </div>
        <p className="lp-foot" style={{ marginTop: 14 }}>* via Zapier, Make ou n8n</p>
        <ol className="lp-steps">
          <li><b>1</b>Choisissez votre outil</li>
          <li><b>2</b>Connectez votre compte</li>
          <li><b>3</b>Vos stats arrivent, en direct</li>
        </ol>
      </section>

      <section id="tarifs" className="lp-pricing">
        <h2 className="lp-h2">Un prix simple</h2>
        <p className="lead" style={{ margin: "0 auto 28px", textAlign: "center" }}>{TRIAL_DAYS} jours d&apos;essai gratuit, sans engagement.</p>
        <div className="grid g-2e">
          {(["solo", "agency"] as const).map((id) => (
            <div key={id} className={`card price${id === "agency" ? " lp-best" : ""}`}>
              <h2>{PLANS[id].name}</h2>
              <div className="amt">{PLANS[id].price} €<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> HT / mois</span></div>
              <ul>
                <li>{Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} clients suivis` : "Clients illimités"}</li>
                <li>Appels, cold email et LinkedIn</li>
                <li>Analyse IA de chaque appel</li>
                <li>Relances, brief pré-meeting et coach IA</li>
                {id === "agency" ? <li>Toute l&apos;équipe commerciale</li> : <li>Pour un SDR freelance</li>}
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
