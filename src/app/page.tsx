import Link from "next/link";
import { currentUser } from "@/lib/session";
import { PLANS, TRIAL_DAYS } from "@/lib/billing";
import { Logo } from "@/components/Logo";
import { BRAND_LOGOS } from "@/lib/brand-logos";
import { LegalFooter } from "@/components/LegalPage";
import { Mascot } from "@/components/client/Mascot";

/** Les captures viennent de l'application elle-même, avec des données de démonstration fictives. */
const SECTIONS = [
  {
    img: "/screens/reporting-client.jpg",
    tag: "Reporting client",
    title: "Un reporting prêt pour chaque client, sans rien préparer",
    text: "Chaque client a son tableau de bord : appels, campagnes email, LinkedIn et rendez-vous, rangés automatiquement selon la liste ou la campagne utilisée. Vous passez d'un client à l'autre en un clic.",
    points: ["Un espace par client, rangé automatiquement", "Par jour, semaine, mois, trimestre ou année", "Rendez-vous, taux de décroché, entonnoir"],
  },
  {
    img: "/screens/multicanal.jpg",
    tag: "Reporting multicanal",
    title: "Appels, emails et LinkedIn dans le même tableau",
    text: "Vos appels (Minari, Aircall, Ringover…), vos campagnes email (lemlist, Instantly, Smartlead) et votre prospection LinkedIn réunis : vous voyez d'un coup d'œil d'où viennent les rendez-vous.",
    points: ["Rendez-vous par canal", "Tous vos clients, ou un seul", "Synchronisation automatique"],
  },
  {
    img: "/screens/emails.jpg",
    tag: "Campagnes email · lemlist, Instantly, Smartlead",
    title: "Vos campagnes email, enfin lisibles",
    text: "Envois, ouvertures, réponses et rendez-vous remontent tout seuls. L'IA classe chaque réponse : positive, objection, absent.",
    points: ["Entonnoir et taux de réponse par campagne", "Réponses classées par l'IA", "Rendez-vous pris par email"],
  },
  {
    img: "/screens/linkedin.jpg",
    tag: "LinkedIn · lemlist, La Growth Machine, Waalaxy",
    title: "LinkedIn, à côté de vos appels et de vos emails",
    text: "Invitations, acceptations, réponses et rendez-vous, client par client. Pas d'outil LinkedIn ? Importez simplement l'export de vos relations et de vos messages.",
    points: ["Taux d'acceptation et de réponse", "Réponses classées par l'IA", "Relance créée quand une invitation est acceptée"],
  },
  {
    img: "/screens/fiche-appel.jpg",
    tag: "Analyse d'appel",
    title: "Chaque appel, résumé et décortiqué par l'IA",
    text: "Dès qu'un appel arrive, l'IA écrit le résumé, repère les objections et vérifie si elles ont été passées. La transcription et l'enregistrement sont juste à côté.",
    points: ["Résumé en 3 à 5 points", "Objections classées : timing, budget, pas décideur…", "Transcription et enregistrement"],
  },
  {
    img: "/screens/objections.jpg",
    tag: "Objections et créneaux",
    title: "Sachez ce qui bloque, et quand appeler",
    text: "Les objections les plus fréquentes, la part réellement passée, et la carte des créneaux où vos prospects décrochent vraiment.",
    points: ["Top des objections sur la période", "Part passée et non passée", "Meilleur créneau d'appel, heure de Paris"],
    narrow: true,
  },
  {
    img: "/screens/relances.jpg",
    tag: "Relances",
    title: "Plus aucun « rappelez-moi en mars » oublié",
    text: "Les relances sont créées automatiquement à partir des appels et des réponses email ou LinkedIn, avec une date. Chaque matin, la liste de ce qui est à faire.",
    points: ["Relances datées automatiquement", "Récapitulatif chaque matin par email", "Fait, reporté ou ignoré en un clic"],
  },
  {
    img: "/screens/appels.jpg",
    tag: "Appels et équipe",
    title: "Toutes vos conversations, et chaque commercial",
    text: "Minari, Aircall, Ringover, HubSpot ou un simple CSV : tous les appels arrivent ici. Filtrez par rendez-vous, par objection ou par commercial, et cherchez un prospect en une seconde.",
    points: ["Synchronisation automatique", "Performance par commercial", "Recherche plein texte"],
  },
];

/** Ce que voit le client du freelance : la promesse principale du produit. */
const CLIENT_PERKS = [
  { icon: "📈", title: "Ses stats en direct", text: "Appels, emails, LinkedIn et rendez-vous, par jour, semaine, mois ou année. Toujours à jour, sans que vous ayez rien à envoyer." },
  { icon: "🎧", title: "Ses appels, écoutés et résumés", text: "Chaque appel mené pour lui : résumé par l'IA, transcription, enregistrement et objections." },
  { icon: "✨", title: "Son assistant IA", text: "Il prépare ses rendez-vous et fait résumer ses appels en une question : « Prépare mon RDV de jeudi avec Talentis RH »." },
];

export default async function Home() {
  const u = await currentUser();
  return (
    <div className="landing">
      <header className="lp-nav">
        <Logo size={24} />
        <div className="row" style={{ gap: 8 }}>
          <a className="btn lp-hide-sm" href="#tarifs">Tarifs</a>
          <Link className="btn lp-hide-sm" href={u ? "/app" : "/login"}>{u ? "Ouvrir mon espace" : "Connexion"}</Link>
          {!u && <Link className="btn primary" href="/inscription">Essai gratuit</Link>}
        </div>
      </header>

      <section className="lp-hero">
        <span className="lp-tag">Pour les SDR freelances et les petites équipes commerciales</span>
        <h1>Votre reporting et vos stats, en un seul endroit, par client.</h1>
        <p className="lead">Vos clients suivent en direct vos appels, vos performances et leurs rendez-vous, et préparent leurs rendez-vous avec leur propre assistant IA. Vous, vous gérez tous vos clients au même endroit : appels, campagnes email et LinkedIn réunis. Fini les reportings du vendredi.</p>
        <div className="row" style={{ marginTop: 24, gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary lp-cta" href="/inscription">Essayer {TRIAL_DAYS} jours gratuitement</Link>
          <a className="btn lp-cta" href="#clients">Voir ce que voit votre client</a>
        </div>
        <p className="lp-note">{TRIAL_DAYS} jours gratuits, aucun débit pendant l&apos;essai · Connectez vos outils en une minute</p>
        <figure className="lp-shot lp-shot-hero">
          <img src="/screens/suivi-chatbot.jpg" alt="Espace de suivi d'un client : ses appels, emails, LinkedIn et rendez-vous en direct, avec son assistant IA" width={2880} height={1800} />
        </figure>
      </section>

      <section className="lp-strip">
        {[["Reporting client", "un tableau de bord par client"], ["Suivi en direct", "partagé par un simple lien"], ["Assistant IA client", "il prépare ses rendez-vous"], ["Multicanal", "appels, campagnes email, LinkedIn"]].map(([a, b]) => (
          <div key={a}><b>{a}</b><span>{b}</span></div>
        ))}
      </section>

      <section id="clients" className="lp-client">
        <div className="lp-client-head">
          <div className="lp-client-badge"><Mascot size={44} /><span>Pour vos clients</span></div>
          <h2>Facilitez la vie de vos clients.<br />Renforcez votre relation.</h2>
          <p>Partagez un lien à chaque client : il suit en direct les appels menés pour lui, ses stats et ses rendez-vous, sans compte et sans mot de passe. Il garde la main, vous gagnez sa confiance.</p>
        </div>
        <div className="lp-client-perks">
          {CLIENT_PERKS.map((c) => <div key={c.title}><span className="lp-client-ico" aria-hidden="true">{c.icon}</span><b>{c.title}</b><p>{c.text}</p></div>)}
        </div>
        <div className="lp-client-shots">
          <figure className="lp-shot"><img src="/screens/suivi-client.jpg" alt="Le client suit ses appels, emails, LinkedIn et rendez-vous en direct" loading="lazy" /><figcaption>Ses stats et ses appels, en direct</figcaption></figure>
          <figure className="lp-shot"><img src="/screens/client-assistant.jpg" alt="Le client prépare son rendez-vous avec l'assistant IA" loading="lazy" /><figcaption>Son assistant IA prépare ses rendez-vous</figcaption></figure>
        </div>
        <ul className="lp-client-list">
          <li>Un lien secret par client, désactivable à tout moment</li>
          <li>Il ne voit que ses propres données, en lecture seule</li>
          <li>Enregistrements, transcriptions et résumés de ses appels</li>
        </ul>
        <div className="lp-cta-row"><Link className="btn lp-cta lp-cta-light" href="/inscription">Offrir le suivi en direct à mes clients</Link></div>
      </section>

      <section id="video" className="lp-video">
        <h2 className="lp-h2">Trustpipe en 1 minute</h2>
        <figure className="lp-shot">
          <video controls playsInline preload="none" poster="/video/trustpipe-poster.jpg" width={1920} height={1080}>
            <source src="/video/trustpipe-presentation.mp4" type="video/mp4" />
          </video>
        </figure>
        <div className="lp-cta-row"><Link className="btn primary lp-cta" href="/inscription">Commencer l&apos;essai gratuit</Link><span className="lp-note">{TRIAL_DAYS} jours gratuits, aucun débit pendant l&apos;essai</span></div>
      </section>

      <div id="produit">
        {SECTIONS.map((s, i) => (
          <section key={s.img} className={`lp-feature${i % 2 ? " rev" : ""}`}>
            <div className="lp-copy">
              <span className="lp-tag">{s.tag}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <Link className="btn primary lp-cta-inline" href="/inscription">Commencer l&apos;essai gratuit</Link>
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
            <div key={ch as string} className="card"><h2>{ch}</h2><div className="lp-chips">{(tools as string[]).map((t) => { const l = BRAND_LOGOS[t.toLowerCase()]; return <span key={t}>{l && <svg viewBox="0 0 24 24" width="14" height="14" fill={l.hex} aria-hidden="true"><path d={l.path} /></svg>}{t}</span>; })}</div></div>
          ))}
        </div>
        <p className="lp-foot" style={{ marginTop: 14 }}>* via Zapier, Make ou n8n</p>
        <ol className="lp-steps">
          <li><b>1</b>Choisissez votre outil</li>
          <li><b>2</b>Connectez votre compte</li>
          <li><b>3</b>Vos stats arrivent, en direct</li>
        </ol>
        <div className="lp-cta-row"><Link className="btn primary lp-cta" href="/inscription">Connecter mon premier outil</Link></div>
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
                <li>Appels, campagnes email (lemlist, Instantly, Smartlead…) et LinkedIn</li>
                <li>Analyse IA de chaque appel</li>
                <li>Lien de suivi en direct et assistant IA pour vos clients</li>
                <li>Relances et brief pré-meeting</li>
                {id === "agency" ? <li>Toute l&apos;équipe commerciale</li> : <li>Pour un SDR freelance</li>}
              </ul>
              <Link className={`btn${id === "agency" ? " primary" : ""}`} href="/inscription" style={{ marginTop: 8 }}>Commencer l&apos;essai</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <h2 className="lp-h2">Votre reporting par client, et vos clients en direct.</h2>
        <Link className="btn primary lp-cta" href="/inscription">Essayer {TRIAL_DAYS} jours gratuitement</Link>
      </section>
      <p className="lp-foot">Captures réalisées avec des données de démonstration fictives.</p>
      <LegalFooter />
    </div>
  );
}
