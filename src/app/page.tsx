import Link from "next/link";
import "@fontsource/ibm-plex-mono/400.css";
import "./studio.css";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { LogoMark } from "@/components/Logo";
import { currentUser } from "@/lib/session";
import { PAID_PLANS, PLANS, euros } from "@/lib/billing";
import { LEGAL } from "@/lib/legal";

/**
 * Page d'accueil « Studio / On Air » : la journée de prospection présentée comme une session d'enregistrement.
 * Chaque appel est une piste, chaque rendez-vous s'allume. Les chiffres et noms affichés sont des exemples fictifs.
 */

/** Générateur pseudo-aléatoire déterministe : le rendu serveur et le rendu client restent identiques. */
function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

/** Onde sonore d'un appel : orange pour la partie déjà « jouée », gris pour la suite. */
function Wave() {
  const r = rng(11), W = 1180, H = 300, n = 236, bw = W / n;
  const bars = Array.from({ length: n }, (_, i) => {
    let env = 0.25 + 0.75 * Math.abs(Math.sin(i / 9)) * (0.6 + 0.4 * Math.sin(i / 31));
    if (i % 47 < 6) env *= 0.15;
    const h = Math.max(3, env * (0.55 + r() * 0.45) * 230);
    return { x: i * bw + 1, y: H / 2 - h / 2, h };
  });
  const rects = (fill: string) => bars.map((b, i) => <rect key={i} x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={(bw - 2).toFixed(1)} height={b.h.toFixed(1)} rx="1.5" fill={fill} />);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id="st-played"><rect x="0" y="0" height={H} width="0"><animate attributeName="width" values={`0;${W}`} dur="14s" repeatCount="indefinite" /></rect></clipPath></defs>
      <g>{rects("#3A3731")}</g>
      <g clipPath="url(#st-played)">{rects("#FF5A1F")}</g>
      <line x1="0" x2="0" y1="0" y2={H} stroke="#FF5A1F" strokeWidth="2" vectorEffect="non-scaling-stroke">
        <animate attributeName="x1" values={`0;${W}`} dur="14s" repeatCount="indefinite" />
        <animate attributeName="x2" values={`0;${W}`} dur="14s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

const WORDS = ["Bonjour", "je vous appelle au sujet de vos coûts d'énergie", "on en parle souvent avec les artisans", "si vous pouvez me montrer ça"];
const NOW = "jeudi, je vous donne un quart d'heure";
const AFTER = ["parfait, 15 h 30 ?", "ça me va", "je vous envoie l'invitation"];

/** Fil d'appels d'exemple (données fictives) : ce que le client voit sur son lien de suivi. */
const FEED = [
  { time: "09:41", name: "Paul Morel", company: "Atelier Morel", kind: "rdv", summary: "Intéressé par l'offre, rendez-vous téléphonique jeudi à 15 h 30.", dur: "2 min 14" },
  { time: "09:38", name: "Sophie Lemaire", company: "Solaris Énergie", kind: "rappel", summary: "En réunion, demande à être rappelée à 14 h.", dur: "0 min 41" },
  { time: "09:36", name: "Marc Duval", company: "Bati Sud", kind: "refus", summary: "Déjà équipé, pas de projet cette année.", dur: "1 min 02" },
  { time: "09:33", name: "Julie Martin", company: "Elec Pro 34", kind: "conv", summary: "Curieuse, veut une plaquette par email avant d'aller plus loin.", dur: "1 min 48" },
  { time: "09:30", name: "Thomas Roux", company: "Nova Habitat", kind: "absent", summary: "Pas de réponse, relance proposée pour demain matin.", dur: "—" },
] as const;
const RESULT: Record<string, string> = { rdv: "RDV PRIS", rappel: "À RAPPELER", refus: "PAS INTÉRESSÉ", conv: "À SUIVRE", absent: "PAS DE RÉPONSE" };

const CLIENT = [
  ["Il suit ses appels en direct", "Chaque appel passé pour lui apparaît dans la minute : qui a été appelé, ce qui s'est dit, ce qui a été obtenu."],
  ["Il lit chaque conversation", "Le résumé, la transcription et les objections du prospect. Et l'enregistrement quand votre outil le fournit."],
  ["Il prépare ses rendez-vous", "L'assistant IA intégré lui dit ce que le prospect a dit, ce qui bloque et l'angle à prendre."],
  ["Il fait débriefer ses rendez-vous", "Il dépose la transcription de sa visio : l'IA lui dit ce qui a marché, ce qui a manqué et la suite."],
  ["Il voit ses résultats", "Appels, décrochés, conversations, rendez-vous : par jour, semaine ou mois, toujours à jour."],
  ["Il comprend son marché", "Ce qui bloque, quand les prospects décrochent, ce qu'ils disent : il pose la question, l'assistant répond."],
] as const;

const AI_CAN = [
  ["Prépare les rendez-vous", "Qui est le prospect, ce qu'il a dit, ce qui peut bloquer et les questions pour ouvrir."],
  ["Répond sur la campagne", "« Combien de rendez-vous cette semaine ? », « Qui faut-il rappeler ? » : réponse chiffrée, à partir des vrais appels."],
  ["Explique les objections", "Ce que disent les prospects, ce qui revient le plus, et comment y répondre."],
  ["Débriefe les visios", "Collez la transcription d'un rendez-vous : ce qui a marché, ce qui a manqué, la suite à donner."],
  ["Trouve les bons créneaux", "Les heures et les jours où les prospects décrochent le plus."],
  ["Garde l'historique", "Chaque conversation avec l'assistant est conservée, on reprend où on s'était arrêté."],
] as const;

const DIALERS = ["Minari", "lemlist", "Aircall", "Ringover", "JustCall", "Allo", "Dialpad", "Close", "Salesloft", "Apollo", "Gong", "HubSpot", "Skipcall"];

/** Arguments de confiance : uniquement ce qui est réellement en place. */
const SECURITY = [
  ["Hébergé en France", "Base de données et application à Paris. Vos données ne quittent pas l'Union européenne, sauf pour l'analyse IA des appels."],
  ["Connexions chiffrées", "Les accès à vos outils sont chiffrés en AES-256 et ne sont jamais affichés, même à vous."],
  ["Cloisonnement par client", "Chaque client ne voit que ses propres appels, vérifié par des tests automatiques à chaque mise à jour."],
  ["Lecture seule", "Trustpipe lit vos outils mais n'écrit rien, n'appelle personne et n'envoie aucun email en votre nom."],
  ["Moins de données personnelles", "Les numéros des prospects ne sont pas conservés : seuls les 4 derniers chiffres sont gardés."],
  ["Vous gardez la main", "Liens de suivi secrets et désactivables en un clic. Vous déconnectez un outil quand vous voulez."],
] as const;

const FAQ: [string, string][] = [
  ["Est-ce compliqué à mettre en place ?", "Non. Vous connectez votre outil d'appel (une clé à coller, ou un clic pour Minari), vous créez votre client, vous lui envoyez son lien. Comptez 2 minutes. Votre client, lui, n'a rien à faire : il ouvre le lien."],
  ["Mon client voit-il tout ce que je fais ?", "Non. Il ne voit que les appels rangés chez lui, c'est-à-dire ceux de ses listes d'appels. Vos autres clients et vos réglages restent invisibles."],
  ["Qui peut voir mes données ?", "Vous et les membres que vous invitez. Vos clients ne voient que ce qui les concerne, via leur lien de suivi ou leur accès client, en lecture seule."],
  ["L'IA garde-t-elle mes appels ?", "Les résumés et analyses sont faits avec Claude, l'IA d'Anthropic. Les données envoyées par notre intégration ne servent pas à entraîner ses modèles. Les résultats sont stockés chez nous, en France."],
  ["Puis-je supprimer mes données ?", "Oui. Vous déconnectez un outil ou désactivez un lien en un clic. À la fin de l'abonnement, les données sont supprimées après 30 jours, le temps de les exporter si besoin."],
  ["Comment se passe le paiement ?", "Par carte, chaque mois, via Stripe : nous ne voyons jamais votre numéro de carte. Sans engagement : vous résiliez en un clic depuis la page Abonnement, et aucun autre prélèvement n'est fait."],
  ["Puis-je brancher Claude sur Trustpipe ?", "Oui. Dans Claude, ajoutez un connecteur personnalisé avec l'adresse https://trustpipe.fr/api/mcp, puis autorisez l'accès avec votre compte Trustpipe. Claude peut alors lister vos relances, en créer, les reporter ou les marquer comme faites, et relire l'historique d'appels d'un prospect. Vous coupez l'accès en un clic depuis vos réglages."],
  ["Et si je n'utilise pas Minari ?", "lemlist, Skipcall, Aircall, Ringover, JustCall, Allo, Dialpad, Close, Salesloft, Apollo, Gong et HubSpot se connectent directement. Pour tout autre outil, collez l'adresse de son API et votre clé. Zapier, Make, n8n et l'import CSV marchent aussi."],
];

export default async function Home() {
  const u = await currentUser();
  const start = u ? "/app" : "/inscription";
  const startLabel = u ? "OUVRIR MON ESPACE" : "COMMENCER";
  return (
    <div className="studio">
      <VisitBeacon page="/" />

      <header className="st-rail">
        <Link href="/" className="st-logo" aria-label="Trustpipe, accueil"><LogoMark size={30} />TRUSTPIPE</Link>
        <nav className="st-links" aria-label="Sections">
          <a href="#session">Vue client</a>
          <a href="#assistant">Assistant IA</a>
          <a href="#demo">Démo</a>
          <a href="#integrations">Intégrations</a>
          <a href="#tarifs">Tarifs</a>
          {!u && <Link className="st-push st-keep" href="/login">Connexion</Link>}
        </nav>
        <Link className="st-go" href={start}>{startLabel} <span aria-hidden="true">→</span></Link>
      </header>

      <section className="st-hero">
        <div className="st-vert" aria-hidden="true"><span className="st-rec"><span className="st-dot" />REC · EN DIRECT</span><span className="big">ON AIR</span></div>
        <div>
          <div className="st-hc">
            <h1 className="st-h1">Chaque appel.<br /><span className="st-thin">Chez votre client.</span><br /><span className="st-o">À la seconde.</span></h1>
            <div className="st-hrow">
              <div>
                <p>Votre client ouvre un lien et suit sa prospection en direct : <b>chaque appel, chaque résumé, chaque rendez-vous</b>, au moment où vous raccrochez. Le reporting ne s&apos;écrit plus : il se regarde.</p>
                <a className="st-aipill" href="#assistant"><span className="st-aiic" aria-hidden="true">IA</span><span><b>Assistant IA inclus.</b> Il connaît chaque appel : votre client et vous lui posez vos questions, il prépare les rendez-vous.</span><span aria-hidden="true">→</span></a>
                <p className="st-note">SANS ENGAGEMENT · PRÊT EN 2 MINUTES · DONNÉES EN FRANCE</p>
              </div>
              <div className="st-btns">
                <Link className="st-btn p" href={start}>{u ? "OUVRIR MON ESPACE" : "CRÉER MON PREMIER LIEN"} <span aria-hidden="true">→</span></Link>
                <a className="st-btn g" href="#session">VOIR CE QUE VOIT LE CLIENT <span aria-hidden="true">↓</span></a>
              </div>
            </div>
          </div>
          <div className="st-wave">
            <span className="st-who">PISTE 289 · <b>ATELIER MOREL</b> · 02:14</span>
            <Wave />
            <div className="st-words" aria-hidden="true"><div>
              {[0, 1].map((k) => (
                <span key={k} style={{ display: "contents" }}>
                  {WORDS.map((w) => <span key={w + k}>{w}</span>)}
                  <span className="now">{NOW}</span>
                  {AFTER.map((w) => <span key={w + k}>{w}</span>)}
                </span>
              ))}
            </div></div>
          </div>
        </div>
      </section>

      <section className="st-cnt" aria-label="Exemple de suivi en direct">
        <div className="lab"><span>Exemple · Client mystère</span><span className="st-mono" style={{ fontSize: 11, color: "var(--o)", letterSpacing: ".14em" }}>● AUJOURD&apos;HUI</span></div>
        <div><small>Appels</small><b>289</b></div>
        <div><small>Décroché</small><b>11,1%</b></div>
        <div><small>Conversations</small><b>32</b></div>
        <div><small>Rendez-vous</small><b className="st-o">02</b></div>
      </section>

      <section id="session" className="st-sec">
        <div className="st-side"><div className="st-n">01</div><small>Ce que voit<br />votre client</small></div>
        <div className="st-body">
          <h2 className="st-h2">Ce que voit votre client. <span className="st-thin">En direct.</span></h2>
          <p className="st-lead">Chaque appel s&apos;affiche dès que vous raccrochez : qui a été appelé, ce qu&apos;il a répondu, le résultat. Les rendez-vous ressortent en orange.</p>
          <div className="st-feed" aria-label="Exemple : le fil d'appels que voit votre client">
            <div className="st-fh"><span className="st-o">● EN DIRECT</span><span>CLIENT MYSTÈRE · AUJOURD&apos;HUI</span><span>MIS À JOUR IL Y A 12 S</span></div>
            {FEED.map((f, i) => (
              <div key={f.name} className={`st-fr${f.kind === "rdv" ? " rdv" : ""}${i === 0 ? " new" : ""}`}>
                <span className="st-ft">{f.time}</span>
                <div className="st-fp"><b>{f.name}</b><small>{f.company}</small></div>
                <span className={`st-fk ${f.kind}`}>{RESULT[f.kind]}</span>
                <p className="st-fs">{f.summary}</p>
                <span className="st-fd">{f.dur}</span>
              </div>
            ))}
          </div>
          <div className="st-trio">
            <div><div className="st-big">1</div><h4>Un lien.<br />Aucun compte.</h4><p>Votre client clique et suit tout. Rien à installer, désactivable en un clic.</p></div>
            <div><div className="st-big">IA</div><h4>Chaque appel résumé et transcrit.</h4><p>Le résumé, les objections et la prochaine étape, écrits dès que vous raccrochez.</p></div>
            <div><div className="st-big st-o">0</div><h4>Reporting à rédiger.</h4><p>Plus de tableau le vendredi soir. Votre client voit le travail, il reste.</p></div>
          </div>
          <div className="st-list">
            {CLIENT.map(([t, d], i) => <div key={t}><span>{String(i + 1).padStart(2, "0")}</span><div><b>{t}</b><p>{d}</p></div></div>)}
          </div>
        </div>
      </section>

      <section id="assistant" className="st-sec">
        <div className="st-side"><div className="st-n">02</div><small>Assistant IA<br />inclus</small></div>
        <div className="st-body">
          <span className="st-aitag"><span className="st-dot" />ASSISTANT IA · INCLUS DANS TOUTES LES FORMULES</span>
          <h2 className="st-h2">Un assistant IA. <span className="st-thin">Il a écouté chaque appel.</span></h2>
          <p className="st-lead">Dans Trustpipe, un assistant IA connaît tous les appels passés : résumés, transcriptions, objections, rendez-vous. <b>Votre client</b> lui pose ses questions depuis son lien de suivi, <b>vous</b> depuis votre espace. Pas d&apos;outil en plus, pas de copier-coller : on lui écrit comme à un collègue.</p>
          <div className="st-ai">
            <div className="q"><div className="st-prompt"><span className="u1">client-mystere ~</span><br />prépare mon rendez-vous de jeudi avec Atelier Morel<span className="st-cur" /></div>
              <div className="st-chips"><span>brief pré-rendez-vous</span><span>objections de la semaine</span><span>débrief de visio</span><span>meilleur créneau</span><span>historique des conversations</span></div></div>
            <div className="st-ans"><span className="st-mono" style={{ display: "block", fontSize: 11, letterSpacing: ".14em", color: "var(--o)", marginBottom: 10 }}>● RÉPONSE DE L&apos;ASSISTANT IA</span><b>Atelier Morel, gérant.</b> Il veut réduire ses coûts et a accepté quand vous avez parlé de délai. Objection probable : le timing. Trois questions pour ouvrir :<ol><li>Combien vous coûte l&apos;énergie aujourd&apos;hui ?</li><li>Qu&apos;est-ce qui bloquait jusqu&apos;ici ?</li><li>Qui décide avec vous ?</li></ol></div>
          </div>
          <div className="st-secg">
            {AI_CAN.map(([t, d]) => <div key={t}><b>{t}</b><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      <section id="demo" className="st-sec">
        <div className="st-side"><div className="st-n">03</div><small>La démo<br />en 1 minute</small></div>
        <div className="st-body">
          <h2 className="st-h2">Trustpipe, <span className="st-thin">en vrai.</span></h2>
          <figure className="st-video" style={{ margin: "40px 0 0" }}>
            <video controls playsInline preload="none" poster="/video/trustpipe-poster.jpg" width={1920} height={1080}>
              <source src="/video/trustpipe-presentation.mp4" type="video/mp4" />
            </video>
          </figure>
        </div>
      </section>

      <section id="integrations" className="st-sec">
        <div className="st-side"><div className="st-n">04</div><small>Les entrées<br />compatibles</small></div>
        <div className="st-body">
          <h2 className="st-h2">Branchez votre dialer. <span className="st-thin">Les appels arrivent.</span></h2>
          <p className="st-lead">Une clé à coller, ou un clic pour Minari. Vos appels remontent tout seuls, client par client, avec leur enregistrement.</p>
          <div className="st-dl">{DIALERS.map((d) => <span key={d}>{d}</span>)}<span className="x">+ votre outil (API) · Zapier · Make · n8n · CSV</span></div>
          <div className="st-claude">
            <span className="st-mono">NOUVEAU · CONNECTEUR CLAUDE</span>
            <h3>Branchez aussi Claude sur Trustpipe.</h3>
            <p>Ajoutez Trustpipe comme connecteur dans Claude : demandez-lui « quelles relances aujourd&apos;hui ? », « reporte Paul Morel à jeudi » ou « relis mon dernier appel avec Atelier Morel », il lit et gère vos relances pour vous.</p>
            <Link className="st-btn g" href="/claude" style={{ marginTop: 18, maxWidth: 420 }}>INSTALLER LE CONNECTEUR CLAUDE <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section id="securite" className="st-sec">
        <div className="st-side"><div className="st-n">05</div><small>Sécurité<br />et RGPD</small></div>
        <div className="st-body">
          <h2 className="st-h2">Vos données restent <span className="st-thin">en France.</span></h2>
          <div className="st-badges"><span>Hébergé en France</span><span>Chiffrement AES-256</span><span>Conforme RGPD</span></div>
          <div className="st-secg">{SECURITY.map(([t, d]) => <div key={t}><b>{t}</b><p>{d}</p></div>)}</div>
        </div>
      </section>

      <section id="tarifs" className="st-sec">
        <div className="st-side"><div className="st-n">06</div><small>Tarifs<br />sans engagement</small></div>
        <div className="st-body">
          <h2 className="st-h2">Trois formules. <span className="st-thin">Résiliables en un clic.</span></h2>
          <div className="st-pr">
            {PAID_PLANS.map((id) => (
              <div key={id} className={id === "agency" ? "best" : ""}>
                <h3>{PLANS[id].name}{id === "agency" && <small>À PLUSIEURS</small>}</h3>
                <div className="st-amt">{euros(PLANS[id].price)}€<span>HT/MOIS{PLANS[id].perSeat ? " PAR COMMERCIAL" : ""}</span></div>
                <ul>
                  <li>{Number.isFinite(PLANS[id].maxClients) ? `${PLANS[id].maxClients} clients suivis` : "Clients illimités"}</li>
                  <li>Tous les dialers, ou CSV</li>
                  <li>Analyse IA de chaque appel</li>
                  <li>Lien de suivi et assistant IA pour vos clients</li>
                  <li>Relances et brief pré-rendez-vous</li>
                  <li>{id === "agency" ? "Facturé par commercial, nombre au choix" : "1 commercial"}</li>
                </ul>
                <Link className="b" href={start}>CHOISIR {PLANS[id].name.toUpperCase()} →</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="st-sec">
        <div className="st-side"><div className="st-n">07</div><small>Vos<br />questions</small></div>
        <div className="st-body">
          <h2 className="st-h2">Questions <span className="st-thin">fréquentes.</span></h2>
          <div className="st-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="st-end">
        <div className="st-huge" aria-hidden="true">TRUSTPIPE</div>
        <div className="st-endrow">
          <p>Vos clients voient enfin le travail. Lancez votre première session aujourd&apos;hui.</p>
          <Link className="st-btn p" href={start}>{u ? "OUVRIR MON ESPACE" : "CRÉER MON PREMIER LIEN"} <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <footer className="st-foot">
        <span>© {new Date().getFullYear()} {LEGAL.brand.toUpperCase()} · DONNÉES DE DÉMONSTRATION FICTIVES SUR CETTE PAGE</span>
        <nav aria-label="Informations légales"><Link href="/mentions-legales">MENTIONS LÉGALES</Link><Link href="/cgv">CONDITIONS GÉNÉRALES</Link><Link href="/confidentialite">CONFIDENTIALITÉ</Link><a href="mailto:bonjour@trustpipe.fr">BONJOUR@TRUSTPIPE.FR</a></nav>
      </footer>
    </div>
  );
}
