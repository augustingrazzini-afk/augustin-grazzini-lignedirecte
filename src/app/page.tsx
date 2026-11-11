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
    tag: "Reporting d'appels par client",
    title: "Un reporting prêt pour chaque client, sans rien préparer",
    text: "Chaque client a son tableau de bord : appels, décrochés, conversations et rendez-vous, rangés automatiquement selon ses listes d'appels. Vous passez d'un client à l'autre en un clic.",
    points: ["Un espace par client, une ou plusieurs listes", "Par jour, semaine, mois, trimestre ou année", "Rendez-vous, taux de décroché, entonnoir"],
  },
  {
    img: "/screens/fiche-appel.jpg",
    tag: "Analyse de chaque appel",
    title: "Chaque appel, résumé et décortiqué par l'IA",
    text: "Dès qu'un appel arrive, l'IA écrit le résumé, repère les objections et vérifie si elles ont été passées. La transcription et l'enregistrement sont juste à côté.",
    points: ["Résumé en 3 à 5 points", "Objections classées : timing, budget, pas décideur…", "Transcription et enregistrement"],
  },
  {
    img: "/screens/objections.jpg",
    tag: "Intelligence terrain",
    title: "Ce que vos appels disent du marché",
    text: "Les objections qui reviennent, la part réellement passée, les créneaux où les prospects décrochent : vos appels deviennent des données que vous et votre client pouvez exploiter.",
    points: ["Top des objections sur la période", "Part passée et non passée", "Meilleur créneau d'appel, heure de Paris"],
    narrow: true,
  },
  {
    img: "/screens/appels.jpg",
    tag: "Appels et équipe",
    title: "Toutes vos conversations, et chaque commercial",
    text: "Minari, Aircall, Ringover, HubSpot ou un simple CSV : tous les appels arrivent ici. Filtrez par rendez-vous, par objection ou par commercial, et cherchez un prospect en une seconde.",
    points: ["Synchronisation automatique", "Performance par commercial", "Recherche plein texte"],
  },
  {
    img: "/screens/relances.jpg",
    tag: "Relances",
    title: "Plus aucun « rappelez-moi en mars » oublié",
    text: "Quand un prospect demande à être rappelé, la relance est créée automatiquement avec la bonne date. Chaque matin, la liste de ce qui est à faire.",
    points: ["Relances datées automatiquement", "Récapitulatif chaque matin par email", "Fait, reporté ou ignoré en un clic"],
  },
];

/** L'intelligence terrain : ce que l'IA tire des appels, pour vous et pour votre client. */
const INTEL = [
  { icon: "🧱", title: "Ce qui bloque", text: "Les objections classées et comptées : timing, budget, pas décideur, déjà équipé… et la part réellement passée au téléphone." },
  { icon: "🎯", title: "Ce que dit le marché", text: "Besoins exprimés, projets en cours, concurrents cités : posez la question à l'assistant, il relit les appels pour vous répondre." },
  { icon: "⏰", title: "Quand appeler", text: "La carte des créneaux où vos prospects décrochent vraiment, par jour et par heure." },
  { icon: "🤝", title: "Ce qui fait signer", text: "Les appels qui finissent en rendez-vous, résumés : ce qui a été dit, l'angle qui a marché, la prochaine étape." },
];

/** Ce que voit le client du freelance : la promesse principale du produit. */
const CLIENT_PERKS = [
  { icon: "📈", title: "Ses stats en direct", text: "Appels, décrochés, conversations et rendez-vous, par jour, semaine, mois ou année. Toujours à jour, sans que vous ayez rien à envoyer." },
  { icon: "🎧", title: "Ses appels, écoutés et résumés", text: "Chaque appel mené pour lui : résumé par l'IA, transcription, enregistrement et objections." },
  { icon: "✨", title: "L'intelligence terrain, pour lui aussi", text: "Son assistant IA lui fait le point sur son marché et prépare ses rendez-vous : « Prépare mon RDV de jeudi avec Talentis RH »." },
];

/** Arguments de confiance : uniquement ce qui est réellement en place. */
const SECURITY = [
  { icon: "🇫🇷", title: "Hébergé en France", text: "La base de données est à Paris, l'application tourne à Paris. Vos données ne quittent pas l'Union européenne, sauf pour l'analyse IA des appels." },
  { icon: "🔐", title: "Connexions chiffrées", text: "Les accès à vos outils (Minari, Aircall…) sont chiffrés en AES-256 et ne sont jamais affichés, même à vous." },
  { icon: "🧱", title: "Cloisonnement par client", text: "Chaque client ne voit que ses propres appels. Ce cloisonnement est vérifié par des tests automatiques à chaque mise à jour." },
  { icon: "👁️", title: "Lecture seule", text: "Trustpipe lit vos outils mais n'écrit rien, n'appelle personne et n'envoie aucun email en votre nom." },
  { icon: "📵", title: "Moins de données personnelles", text: "Les numéros de téléphone des prospects ne sont pas conservés : seuls les 4 derniers chiffres sont gardés." },
  { icon: "🔗", title: "Vous gardez la main", text: "Les liens de suivi sont secrets et désactivables en un clic. Vous déconnectez un outil quand vous voulez." },
];

const FAQ: [string, string][] = [
  ["Qui peut voir mes données ?", "Vous et les membres que vous invitez dans votre espace. Vos clients ne voient que ce qui les concerne, via leur lien de suivi ou leur accès client, en lecture seule."],
  ["Mon client voit-il tout ce que je fais ?", "Non. Il ne voit que les appels rangés chez lui, c'est-à-dire ceux de ses listes d'appels. Vos autres clients et vos réglages restent invisibles."],
  ["L'IA garde-t-elle mes appels ?", "Les résumés et analyses sont faits avec Claude, l'IA d'Anthropic. Les données envoyées par notre intégration ne servent pas à entraîner ses modèles. Les résultats sont stockés chez nous, en France."],
  ["Puis-je supprimer mes données ?", "Oui. Vous déconnectez un outil ou désactivez un lien en un clic. À la fin de l'abonnement, les données sont supprimées après 30 jours, le temps de les exporter si besoin."],
  ["Faut-il une carte bancaire pour l'essai ?", "Oui, elle est enregistrée sur Stripe, qui gère le paiement : nous ne voyons jamais votre numéro de carte. Rien n'est débité pendant les 14 jours d'essai, et vous résiliez en un clic depuis la page Abonnement."],
  ["Et si je n'utilise pas Minari ?", "Aircall, Ringover et HubSpot se connectent directement. Pour tout autre outil, collez simplement l'adresse de son API et votre clé : Trustpipe reconnaît vos appels automatiquement. Zapier, Make, n8n et l'import CSV marchent aussi."],
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
        <h1>Le reporting d&apos;appels de chaque client, et l&apos;intelligence terrain en plus.</h1>
        <p className="lp-sub">Fini les reportings clients faits à la main.</p>
        <p className="lead">L&apos;IA analyse chacun de vos appels : ce qui bloque, ce que dit le marché, ce qui fait signer. Vos clients suivent en direct vos appels, vos stats et vos rendez-vous, et accèdent eux aussi à cette intelligence terrain. Vous, vous pilotez tous vos clients au même endroit.</p>
        <div className="row" style={{ marginTop: 24, gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary lp-cta" href="/inscription">Essayer {TRIAL_DAYS} jours gratuitement</Link>
          <a className="btn lp-cta" href="#clients">Voir ce que voit votre client</a>
        </div>
        <p className="lp-note">{TRIAL_DAYS} jours gratuits, aucun débit pendant l&apos;essai · Connectez vos outils en une minute</p>
        <figure className="lp-shot lp-shot-hero">
          <img src="/screens/suivi-chatbot.jpg" alt="Espace de suivi d'un client : ses appels et rendez-vous en direct, avec son assistant IA" width={2880} height={1800} />
        </figure>
      </section>

      <section className="lp-strip">
        {[["Reporting d'appels", "par client, en direct"], ["Intelligence terrain", "l'IA analyse chaque appel"], ["Accès client", "ses stats et son assistant IA"], ["Tous vos outils", "Minari, Aircall, Ringover…"]].map(([a, b]) => (
          <div key={a}><b>{a}</b><span>{b}</span></div>
        ))}
      </section>

      <section id="intelligence" className="lp-intel">
        <span className="lp-tag">Intelligence terrain</span>
        <h2 className="lp-h2">Vos appels deviennent de l&apos;intelligence terrain</h2>
        <p className="lead" style={{ margin: "0 auto 28px", textAlign: "center" }}>L&apos;IA écoute chaque appel et en tire ce qu&apos;un manager mettrait des heures à repérer. Pour vous, et pour votre client.</p>
        <div className="lp-intel-grid">
          {INTEL.map((x) => <div key={x.title} className="card"><span className="lp-sec-ico" aria-hidden="true">{x.icon}</span><b>{x.title}</b><p>{x.text}</p></div>)}
        </div>
      </section>

      <section id="clients" className="lp-client">
        <div className="lp-client-head">
          <div className="lp-client-badge"><Mascot size={44} /><span>Pour vos clients</span></div>
          <h2>Facilitez la vie de vos clients.<br />Renforcez votre relation.</h2>
          <p>Partagez un lien à chaque client : il suit en direct les appels menés pour lui, ses stats et ses rendez-vous, et profite lui aussi de l&apos;intelligence terrain. Sans compte, sans mot de passe. Il garde la main, vous gagnez sa confiance.</p>
        </div>
        <div className="lp-client-perks">
          {CLIENT_PERKS.map((c) => <div key={c.title}><span className="lp-client-ico" aria-hidden="true">{c.icon}</span><b>{c.title}</b><p>{c.text}</p></div>)}
        </div>
        <div className="lp-client-shots">
          <figure className="lp-shot"><img src="/screens/suivi-client.jpg" alt="Le client suit ses appels et rendez-vous en direct" loading="lazy" /><figcaption>Ses stats et ses appels, en direct</figcaption></figure>
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
        <p className="lead" style={{ margin: "0 auto 32px", textAlign: "center" }}>Choisissez votre outil d&apos;appel, connectez votre compte, c&apos;est tout. Vos appels remontent automatiquement, client par client.</p>
        <div className="lp-tools-grid lp-tools-2">
          {[
            ["Outils d'appel", ["Minari", "Aircall", "Ringover", "HubSpot"]],
            ["Et le reste", ["Votre outil (clé API)", "Zapier", "Make", "n8n", "Import CSV"]],
          ].map(([ch, tools]) => (
            <div key={ch as string} className="card"><h2>{ch}</h2><div className="lp-chips">{(tools as string[]).map((t) => { const l = BRAND_LOGOS[t.toLowerCase()]; return <span key={t}>{l && <svg viewBox="0 0 24 24" width="14" height="14" fill={l.hex} aria-hidden="true"><path d={l.path} /></svg>}{t}</span>; })}</div></div>
          ))}
        </div>
        <ol className="lp-steps">
          <li><b>1</b>Choisissez votre outil</li>
          <li><b>2</b>Connectez votre compte</li>
          <li><b>3</b>Vos stats arrivent, en direct</li>
        </ol>
        <div className="lp-cta-row"><Link className="btn primary lp-cta" href="/inscription">Connecter mon premier outil</Link></div>
      </section>

      <section id="securite" className="lp-sec">
        <span className="lp-tag">Sécurité et RGPD</span>
        <h2 className="lp-h2">Vos données et celles de vos clients sont protégées</h2>
        <p className="lead" style={{ margin: "0 auto 28px", textAlign: "center" }}>Trustpipe lit vos outils, rien de plus. Vos données restent en France, chiffrées et cloisonnées client par client.</p>
        <div className="lp-sec-badges"><span>🇫🇷 Hébergé en France</span><span>🔒 Chiffrement AES-256</span><span>🇪🇺 Conforme RGPD</span></div>
        <div className="lp-sec-grid">
          {SECURITY.map((x) => <div key={x.title} className="card"><span className="lp-sec-ico" aria-hidden="true">{x.icon}</span><b>{x.title}</b><p>{x.text}</p></div>)}
        </div>
      </section>

      <section id="faq" className="lp-faq">
        <h2 className="lp-h2">Questions fréquentes</h2>
        <div className="lp-faq-list">
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
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
                <li>Minari, Aircall, Ringover, HubSpot ou CSV</li>
                <li>Analyse IA de chaque appel et intelligence terrain</li>
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
        <h2 className="lp-h2">Le reporting d&apos;appels de chaque client, et l&apos;intelligence terrain en plus.</h2>
        <Link className="btn primary lp-cta" href="/inscription">Essayer {TRIAL_DAYS} jours gratuitement</Link>
      </section>
      <p className="lp-foot">Captures réalisées avec des données de démonstration fictives.</p>
      <LegalFooter />
    </div>
  );
}
