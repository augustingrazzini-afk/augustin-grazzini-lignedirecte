import Link from "next/link";
import "@fontsource/ibm-plex-mono/400.css";
import "./studio.css";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { currentUser } from "@/lib/session";
import { PAID_PLANS, PLANS, PLAN_FEATURES, euros } from "@/lib/billing";
import { ClaudeLogo } from "@/components/ClaudeLogo";
import { claudeInstallLink } from "@/lib/claude-link";
import { LEGAL } from "@/lib/legal";
import { AI_CAN } from "@/lib/assistant-content";

/**
 * Page d'accueil « Studio / On Air », pour les entreprises : centraliser tous leurs commerciaux (salariés, freelances,
 * agences) et suivre chaque appel en direct. Les chiffres et noms affichés sont des exemples fictifs.
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

/** Fil d'appels d'exemple (données fictives) : ce que voit le dirigeant, tous commerciaux confondus. */
const FEED = [
  { time: "09:41", rep: "Léa · interne", name: "Paul Morel", company: "Atelier Morel", kind: "rdv", summary: "Intéressé par l'offre, rendez-vous téléphonique jeudi à 15 h 30.", dur: "2 min 14" },
  { time: "09:38", rep: "Prospectio · agence", name: "Sophie Lemaire", company: "Solaris Énergie", kind: "rappel", summary: "En réunion, demande à être rappelée à 14 h.", dur: "0 min 41" },
  { time: "09:36", rep: "Karim · freelance", name: "Marc Duval", company: "Bati Sud", kind: "refus", summary: "Déjà équipé, pas de projet cette année.", dur: "1 min 02" },
  { time: "09:33", rep: "Léa · interne", name: "Julie Martin", company: "Elec Pro 34", kind: "conv", summary: "Curieuse, veut une plaquette par email avant d'aller plus loin.", dur: "1 min 48" },
  { time: "09:30", rep: "Prospectio · agence", name: "Thomas Roux", company: "Nova Habitat", kind: "absent", summary: "Pas de réponse, relance proposée pour demain matin.", dur: "—" },
] as const;
/** Extrait de transcription d'exemple (fictif). */
const TRANSCRIPT: [string, string, string, boolean][] = [
  ["00:04", "Léa", "Bonjour Monsieur Morel, je vous appelle au sujet de vos coûts d'énergie.", false],
  ["00:41", "Prospect", "On paie trop, c'est sûr. Mais là je n'ai pas le temps.", false],
  ["01:12", "Léa", "Dix minutes suffisent pour vous montrer l'écart.", false],
  ["01:36", "Prospect", "Jeudi, je vous donne un quart d'heure.", true],
];
const RESULT: Record<string, string> = { rdv: "RDV PRIS", rappel: "À RAPPELER", refus: "PAS INTÉRESSÉ", conv: "À SUIVRE", absent: "PAS DE RÉPONSE" };

/** Classement d'exemple (fictif). */
const BOARD = [
  ["Léa Martin", "Interne", 61, "18 %", 9, 4],
  ["Karim Benali", "Freelance", 74, "14 %", 7, 2],
  ["Prospectio", "Agence · 3 SDR", 154, "9 %", 12, 1],
] as const;
/** Les 3 SDR de l'agence d'exemple : leurs chiffres s'additionnent pour donner la ligne « Prospectio ». */
const AGENCY_TEAM = [
  ["Hugo", 62, "11 %", 7, 1],
  ["Inès", 51, "8 %", 3, 0],
  ["Marc", 41, "7 %", 2, 0],
] as const;

const BOSS = [
  ["Tous vos commerciaux au même endroit", "Salariés, freelances, agences de prospection : chacun branche son outil d'appel, tout arrive chez vous."],
  ["Chaque appel, en direct", "Qui a été appelé, ce qui s'est dit, le résultat. Dans la minute qui suit l'appel, sans rien demander."],
  ["Un classement honnête", "Appels, décrochés, conversations, rendez-vous : par commercial, par jour, semaine ou mois."],
  ["Vos prestataires sous contrôle", "Freelance ou agence : vous voyez le travail réellement fait, appel par appel, pas un reporting arrangé. Dans une agence, chaque SDR a sa ligne : qui appelle, et qui prend les rendez-vous."],
  ["Vous écoutez chaque appel", "Ouvrez n'importe quel appel de n'importe quel commercial : le résumé, la transcription et les objections. En Premium, vous réécoutez aussi l'enregistrement."],
  ["Vos rendez-vous préparés", "Avant chaque rendez-vous : ce que le prospect a dit, ce qui bloque, l'angle à prendre."],
] as const;

const DIALERS = ["Minari", "lemlist", "Aircall", "Ringover", "JustCall", "Allo", "Dialpad", "Close", "Salesloft", "Apollo", "Gong", "HubSpot", "Skipcall"];

/** Arguments de confiance : uniquement ce qui est réellement en place. */
const SECURITY = [
  ["Hébergé en France", "Base de données et application à Paris. Vos données ne quittent pas l'Union européenne, sauf pour l'analyse IA des appels."],
  ["Connexions chiffrées", "Les accès aux outils d'appel sont chiffrés en AES-256 et ne sont jamais affichés, même à vous."],
  ["Cloisonnement par commercial", "Chaque commercial ne voit que ses propres appels. Vous seul voyez toute l'équipe. Vérifié par des tests automatiques à chaque mise à jour."],
  ["Lecture seule", "Trustpipe lit les outils d'appel mais n'écrit rien, n'appelle personne et n'envoie aucun email en votre nom."],
  ["Coordonnées des prospects chiffrées", "Le téléphone et l'email de vos prospects sont chiffrés dans la base (AES-256) et visibles seulement par vous et le commercial concerné."],
  ["Vous gardez la main", "Vous retirez un commercial ou déconnectez un outil en un clic, quand vous voulez."],
] as const;

const FAQ: [string, string][] = [
  ["Mes commerciaux utilisent des outils différents, ça marche ?", "Oui, c'est fait pour ça. Votre équipe interne sur Aircall, un freelance sur Minari, une agence sur Ringover : chacun branche son outil et tous les appels arrivent dans votre espace, rangés par commercial."],
  ["Qu'est-ce que le commercial a à faire ?", "Presque rien. Il reçoit une invitation par email et branche son outil d'appel en 2 minutes (une clé à coller, ou un clic pour Minari). S'il appelle depuis votre outil, il n'a même rien à faire : vous indiquez son nom et ses appels lui sont attribués."],
  ["Le commercial voit-il les appels des autres ?", "Non. Chaque commercial a son espace et ne voit que ses propres appels, ses résumés et son assistant IA. Vous seul (et les managers que vous invitez) voyez toute l'équipe."],
  ["Peut-on réécouter les appels ?", "Oui, avec la formule Premium (Essentiel donne la transcription complète, sans l'audio). Sous la transcription de chaque conversation, un lecteur permet d'écouter l'enregistrement, directement dans Trustpipe et quel que soit l'outil d'appel branché. Une condition : le partage des enregistrements doit être autorisé dans votre outil d'appel (dans Minari : Settings, puis « External call sharing »). C'est un réglage à faire une seule fois ; Trustpipe vous guide depuis la page Sources, et tant qu'il n'est pas fait, chaque appel vous le rappelle."],
  ["Combien ça coûte ?", `Vous commencez par 7 jours d'essai : la carte est demandée à l'inscription mais n'est débitée qu'au bout de 7 jours, et rien n'est prélevé si vous résiliez avant. Ensuite, un prix fixe par mois pour toute votre équipe, sans engagement : Essentiel à ${euros(PLANS.agency.price)} € HT (jusqu'à 10 commerciaux, avec la transcription, l'analyse IA de chaque appel et l'assistant IA), Premium à ${euros(PLANS.premium.price)} € HT (commerciaux illimités, avec en plus l'écoute des enregistrements, le connecteur Claude, les briefs et débriefs de rendez-vous). Une formule Découverte sans IA existe à ${euros(PLANS.starter.price)} € HT, limitée à 2 commerciaux.`],
  ["L'IA garde-t-elle nos appels ?", "Les résumés et analyses sont faits avec Claude, l'IA d'Anthropic. Les données envoyées par notre intégration ne servent pas à entraîner ses modèles. Les résultats sont stockés chez nous, en France."],
  ["Puis-je supprimer nos données ?", "Oui. Vous déconnectez un outil ou retirez un commercial en un clic. À la fin de l'abonnement, les données sont supprimées après 30 jours, le temps de les exporter si besoin."],
  ["Puis-je brancher Claude sur Trustpipe ?", "Oui. Le bouton « Connecter Claude » ouvre Claude avec l'adresse de Trustpipe déjà remplie (à la main : connecteur personnalisé, adresse https://trustpipe.fr/api/mcp). Vous confirmez, puis vous autorisez l'accès avec votre compte Trustpipe. Claude peut alors lire vos relances et l'historique d'appels d'un prospect, et planifier des relances. Vous coupez l'accès en un clic depuis vos réglages."],
  ["Quels outils d'appel sont compatibles ?", "Minari, lemlist, Skipcall, Aircall, Ringover, JustCall, Allo, Dialpad, Close, Salesloft, Apollo, Gong et HubSpot se connectent directement. Pour tout autre outil, collez l'adresse de son API et sa clé. Zapier, Make, n8n et l'import CSV marchent aussi."],
];

export default async function Home() {
  const me = await currentUser();
  const u = me && me.id !== "demo_user" ? me : null; // le visiteur de la démo reste un visiteur
  const start = u ? "/app" : "/inscription";
  const startLabel = u ? "OUVRIR MON ESPACE" : "COMMENCER";
  return (
    <div className="studio">
      <VisitBeacon page="/" />

      <header className="st-rail">
        <Link href="/" className="st-logo" aria-label="Trustpipe, accueil">TRUSTPIPE</Link>
        <nav className="st-links" aria-label="Sections">
          <a href="#demo">Démo</a>
          <a href="#equipe">Votre équipe</a>
          <a href="#assistant">Assistant IA</a>
          <a href="#claude">Claude</a>
          <a href="#integrations">Intégrations</a>
          <a href="#tarifs">Tarifs</a>
          {!u && <Link className="st-push st-keep" href="/login">Connexion</Link>}
        </nav>
        <Link className="st-go" href={start}>{startLabel} <span aria-hidden="true">→</span></Link>
      </header>

      <section className="st-hero">
        <div className="st-vert" aria-hidden="true"><span className="big">ON AIR</span></div>
        <div>
          <div className="st-hc">
            <span className="st-aitag" style={{ marginBottom: 26 }}><span className="st-dot" />POUR LES DIRIGEANTS ET DIRECTEURS COMMERCIAUX</span>
            <h1 className="st-h1">Tous vos commerciaux.<br /><span className="st-thin">Un seul écran.</span><br /><span className="st-o">En direct.</span></h1>
            <div className="st-hrow">
              <div>
                <p>Salariés, freelances, agences de prospection : Trustpipe centralise <b>chaque appel de chacun de vos commerciaux</b>, au moment où il raccroche. Transcriptions, résumés, rendez-vous, classement. Vous voyez enfin le travail réel.</p>
                <Link className="st-aipill" href="/assistant"><span className="st-aiic" aria-hidden="true">IA</span><span><b>Assistant IA.</b> Il a écouté tous les appels : « que s&apos;est-il dit aujourd&apos;hui ? », « où perd-on le prospect ? »</span><span aria-hidden="true">→</span></Link>
                <Link className="st-aipill" href="#claude" style={{ marginTop: 10 }}><span className="st-aiic logo"><ClaudeLogo size={24} /></span><span><b>Se branche sur Claude.</b> « Quelles relances aujourd&apos;hui ? » : Claude répond avec vos données Trustpipe.</span><span aria-hidden="true">→</span></Link>
                <p className="st-note">7 JOURS D&apos;ESSAI · SANS ENGAGEMENT · DONNÉES EN FRANCE</p>
              </div>
              <div className="st-btns">
                <Link className="st-btn p" href={start}>{u ? "OUVRIR MON ESPACE" : "SUIVRE MES COMMERCIAUX"} <span aria-hidden="true">→</span></Link>
                <a className="st-btn g" href="/demo" rel="nofollow">VOIR LA DÉMO, SANS COMPTE <span aria-hidden="true">→</span></a>
              </div>
            </div>
          </div>
          <div className="st-wave">
            <span className="st-who">LÉA · INTERNE · <b>ATELIER MOREL</b> · 02:14</span>
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

      <section className="st-cnt" aria-label="Exemple : votre équipe aujourd'hui">
        <div className="lab"><span>Exemple · Votre équipe</span><span className="st-mono" style={{ fontSize: 11, color: "var(--o)", letterSpacing: ".14em" }}>● AUJOURD&apos;HUI</span></div>
        <div><small>Commerciaux</small><b>05</b></div>
        <div><small>Appels</small><b>289</b></div>
        <div><small>Conversations</small><b>32</b></div>
        <div><small>Rendez-vous</small><b className="st-o">07</b></div>
      </section>

      <section id="demo" className="st-sec">
        <div className="st-side"><div className="st-n">▶</div><small>La démo<br />en 1 minute</small></div>
        <div className="st-body">
          <h2 className="st-h2">Trustpipe, <span className="st-thin">en une minute.</span></h2>
          <figure className="st-video" style={{ margin: "40px 0 0" }}>
            <video controls playsInline preload="none" poster="/video/trustpipe-entreprises.jpg" width={1920} height={1080} aria-label="Démonstration de Trustpipe : tous vos commerciaux sur un seul écran, en direct (données fictives)">
              <source src="/video/trustpipe-entreprises.mp4" type="video/mp4" />
            </video>
          </figure>
        </div>
      </section>

      <section id="equipe" className="st-sec">
        <div className="st-side"><div className="st-n">01</div><small>Ce que<br />vous voyez</small></div>
        <div className="st-body">
          <h2 className="st-h2">Toute votre équipe. <span className="st-thin">En direct.</span></h2>
          <p className="st-lead">Chaque appel de chaque commercial s&apos;affiche dès qu&apos;il raccroche : qui a appelé, qui a été appelé, ce qu&apos;il a répondu, le résultat. Les rendez-vous ressortent en orange.</p>
          <div className="st-feed" aria-label="Exemple : le fil d'appels de toute l'équipe">
            <div className="st-fh"><span className="st-o">● EN DIRECT</span><span>VOTRE ÉQUIPE · AUJOURD&apos;HUI</span><span>MIS À JOUR IL Y A 12 S</span></div>
            {FEED.map((f, i) => (
              <div key={f.name} className={`st-fr${f.kind === "rdv" ? " rdv" : ""}${i === 0 ? " new" : ""}`}>
                <span className="st-ft">{f.time}</span>
                <div className="st-fp"><b>{f.name}</b><small>{f.company}</small></div>
                <span className={`st-fk ${f.kind}`}>{RESULT[f.kind]}</span>
                <p className="st-fs"><span className="st-rep">{f.rep}</span>{f.summary}</p>
                <span className="st-fd">{f.dur}</span>
              </div>
            ))}
          </div>
          <div className="st-board" aria-label="Exemple : classement de vos commerciaux cette semaine">
            <div className="st-fh"><span className="st-o">● CLASSEMENT</span><span>CETTE SEMAINE</span><span>PAR RENDEZ-VOUS PRIS</span></div>
            <div className="st-br st-bh"><span>#</span><span>Commercial</span><span>Appels</span><span>Décroché</span><span>Conversations</span><span>RDV</span></div>
            {BOARD.map(([n, k, a, d, c, r], i) => (
              <div key={n} className="st-br"><span className="st-o">{i + 1}</span><span><b>{n}</b><small>{k}</small></span><span>{a}</span><span>{d}</span><span>{c}</span><span className="st-rdvn">{r}</span></div>
            ))}
            {/* Une agence n'est pas une boîte noire : chaque personne qui appelle pour elle a sa ligne. */}
            {AGENCY_TEAM.map(([n, a, d, c, r]) => (
              <div key={n} className="st-br st-sub"><span aria-hidden="true">↳</span><span><b>{n}</b><small>SDR chez Prospectio</small></span><span>{a}</span><span>{d}</span><span>{c}</span><span className="st-rdvn">{r}</span></div>
            ))}
          </div>
          <div className="st-trx" aria-label="Exemple : la transcription et le résumé d'un appel">
            <div className="st-trx-l">
              <div className="st-fh" style={{ padding: "0 0 14px" }}><span className="st-o">● TRANSCRIPTION COMPLÈTE</span><span>LÉA · ATELIER MOREL · 02:14</span></div>
              {TRANSCRIPT.map(([ts, who, txt, hi]) => <p key={ts}><span>{ts}</span><span><b>{who} :</b> {hi ? <mark>{txt}</mark> : txt}</span></p>)}
              <div className="st-player" aria-hidden="true"><span className="b">▶</span><span className="w">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ height: `${22 + Math.round(Math.abs(Math.sin(i / 4)) * 60 + (i * 37 % 17))}%` }} />)}</span><span className="t">02:14</span></div>
              <small>Écoute de l&apos;enregistrement : formule Premium, une fois le partage activé dans votre outil d&apos;appel.</small>
            </div>
            <div className="st-trx-r">
              <h3>Chaque appel. <span className="st-thin">Mot pour mot.</span></h3>
              <p>Chaque conversation de chaque commercial est <b>transcrite en entier</b>, avec qui parle et à quel moment. Vous relisez ce qui s&apos;est vraiment dit, sans demander un compte rendu.</p>
              <ul><li>La transcription complète, horodatée</li><li>L&apos;enregistrement à réécouter, en Premium</li><li>Le résumé de l&apos;IA en quelques points</li><li>Les objections du prospect, repérées</li><li>Une recherche par prospect, entreprise ou mot-clé</li></ul>
            </div>
          </div>
          <div className="st-trio">
            <div><div className="st-big">1</div><h4>Un espace pour toute l&apos;équipe.</h4><p>Internes, freelances, agences : peu importe leur outil d&apos;appel, tout arrive au même endroit.</p></div>
            <div><div className="st-big">IA</div><h4>Chaque appel résumé et transcrit.</h4><p>Le résumé, les objections et la prochaine étape, écrits dès que le commercial raccroche.</p></div>
            <div><div className="st-big st-o">0</div><h4>Reporting à réclamer.</h4><p>Plus de tableau Excel le vendredi soir : vous voyez le travail réel, appel par appel.</p></div>
          </div>
          <div className="st-list">
            {BOSS.map(([t, d], i) => <div key={t}><span>{String(i + 1).padStart(2, "0")}</span><div><b>{t}</b><p>{d}</p></div></div>)}
          </div>
        </div>
      </section>

      <section id="assistant" className="st-sec">
        <div className="st-side"><div className="st-n">02</div><small>Assistant IA<br />dès Essentiel</small></div>
        <div className="st-body">
          <span className="st-aitag"><span className="st-dot" />ASSISTANT IA · INCLUS DÈS ESSENTIEL</span>
          <h2 className="st-h2">Un assistant IA. <span className="st-thin">Il a écouté toute l&apos;équipe.</span></h2>
          <p className="st-lead">Dans Trustpipe, un assistant IA a écouté chaque appel de chaque commercial. Vous lui posez vos questions comme à un directeur commercial : qui performe, qui a besoin d&apos;aide, pourquoi les prospects refusent, comment préparer votre rendez-vous de jeudi.</p>
          <div className="st-ai">
            <div className="q"><div className="st-prompt"><span className="u1">direction ~</span><br />dans quels appels a-t-on perdu le prospect cette semaine, et pourquoi ?<span className="st-cur" /></div>
              <div className="st-chips"><span>les appels du jour</span><span>prospects intéressés</span><span>objections entendues</span><span>appels à écouter</span><span>où on perd le prospect</span></div></div>
            <div className="st-ans"><span className="st-mono" style={{ display: "block", fontSize: 11, letterSpacing: ".14em", color: "var(--o)", marginBottom: 10 }}>● RÉPONSE DE L&apos;ASSISTANT IA</span><b>3 appels perdus cette semaine, tous sur le prix.</b> Le prospect était intéressé, puis décroche dès que le tarif arrive.<ol><li><b>Karim · Atelier Morel</b> : « trop cher » à 01:12, il n&apos;insiste pas et raccroche.</li><li><b>Prospectio · Solaris Énergie</b> : le tarif est annoncé avant le besoin, fin de l&apos;appel à 00:48.</li><li>À écouter : l&apos;appel de <b>Léa</b> de mardi, elle retourne la même objection et prend le rendez-vous.</li></ol></div>
          </div>
          <div className="st-secg">
            {AI_CAN.map(([t, d]) => <div key={t}><b>{t}</b><p>{d}</p></div>)}
          </div>
          <Link className="st-btn g" href="/assistant" style={{ marginTop: 32, maxWidth: 460 }}>TOUT SAVOIR SUR L&apos;ASSISTANT IA <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section id="claude" className="st-sec">
        <div className="st-side"><div className="st-n">03</div><small>Connecteur<br />Claude</small></div>
        <div className="st-body">
          <span className="st-aitag"><span className="st-dot" />CONNECTEUR CLAUDE · FORMULE PREMIUM</span>
          <h2 className="st-h2">Trustpipe. <span className="st-thin">Dans Claude.</span></h2>
          <p className="st-lead">Vous utilisez déjà Claude ? Branchez-y Trustpipe en une minute. Vous lui parlez comme d&apos;habitude, et il lit vos appels et gère vos relances : plus besoin d&apos;ouvrir un tableau de bord pour savoir qui rappeler.</p>
          <div className="st-ai">
            <div className="q"><div className="st-prompt">
              {["Quelles relances sont en retard ?", "Prépare ma journée, avec le contexte de chaque prospect.", "Reporte la relance de Paul Morel à jeudi 10 h.", "Relis le dernier appel avec Atelier Morel."].map((a) => <div key={a}><span className="u1">vous ~ </span>{a}</div>)}<span className="st-cur" /></div></div>
            <div className="st-ans"><span className="st-mono" style={{ display: "block", fontSize: 11, letterSpacing: ".14em", color: "var(--o)", marginBottom: 10 }}>● CLAUDE, AVEC VOS DONNÉES TRUSTPIPE</span><b>3 relances en retard.</b><ol><li><b>Paul Morel</b> (Atelier Morel) : confirmer le rendez-vous de jeudi. Dernier appel mardi, il attend l&apos;invitation.</li><li><b>Julie Martin</b> (Elec Pro 34) : envoyer la plaquette demandée.</li><li><b>Sophie Lemaire</b> (Solaris Énergie) : rappeler à 14 h, comme convenu.</li></ol></div>
          </div>
          <div className="st-trio">
            <div><div className="st-big">1</div><h4>Une adresse à coller.</h4><p>Dans Claude : Réglages › Connecteurs › Ajouter un connecteur. Vous autorisez l&apos;accès, c&apos;est tout.</p></div>
            <div><div className="st-big">5</div><h4>Outils, rien de plus.</h4><p>Lister, créer et modifier vos relances, relire l&apos;historique d&apos;un prospect, voir vos commerciaux.</p></div>
            <div><div className="st-big st-o">0</div><h4>Mot de passe partagé.</h4><p>Connexion sécurisée, limitée à votre espace, coupée en un clic depuis vos réglages.</p></div>
          </div>
          <div className="st-btns" style={{ marginTop: 32, maxWidth: 460 }}><a className="st-btn p" href={claudeInstallLink()} target="_blank" rel="noopener noreferrer">CONNECTER CLAUDE EN 1 CLIC <span aria-hidden="true">→</span></a><Link className="st-btn g" href="/claude">COMMENT ÇA MARCHE <span aria-hidden="true">→</span></Link></div>
        </div>
      </section>

      <section id="integrations" className="st-sec">
        <div className="st-side"><div className="st-n">04</div><small>Les outils<br />compatibles</small></div>
        <div className="st-body">
          <h2 className="st-h2">Chacun garde son outil. <span className="st-thin">Tout arrive chez vous.</span></h2>
          <p className="st-lead">Vous invitez un commercial, il branche son outil d&apos;appel en 2 minutes : une clé à coller, ou un clic pour Minari. Votre équipe partage un outil ? Vous le branchez une fois, et chaque appel est attribué au bon commercial.</p>
          <p className="st-lead" style={{ fontSize: 15 }}>Minari est utilisé chaque jour en production. Les autres connecteurs suivent la documentation officielle de chaque outil : si le vôtre remonte mal, écrivez-nous, nous le corrigeons en priorité.</p>
          <div className="st-dl">{DIALERS.map((d) => <span key={d}>{d}</span>)}<span className="x">+ tout outil (API) · Zapier · Make · n8n · CSV</span></div>
        </div>
      </section>

      <section id="securite" className="st-sec">
        <div className="st-side"><div className="st-n">05</div><small>Sécurité<br />et RGPD</small></div>
        <div className="st-body">
          <h2 className="st-h2">Vos données restent <span className="st-thin">en France.</span></h2>
          <div className="st-badges"><span>Hébergé en France</span><span>Chiffrement AES-256</span><span>Contrat de sous-traitance RGPD</span></div>
          <div className="st-secg">{SECURITY.map(([t, d]) => <div key={t}><b>{t}</b><p>{d}</p></div>)}</div>
        </div>
      </section>

      <section id="tarifs" className="st-sec">
        <div className="st-side"><div className="st-n">06</div><small>Tarifs<br />sans engagement</small></div>
        <div className="st-body">
          <h2 className="st-h2">7 jours d&apos;essai. <span className="st-thin">Puis un prix fixe.</span></h2>
          <div className="st-pr">
            {PAID_PLANS.map((id) => (
              <div key={id} className={id === "agency" ? "best" : id === "starter" ? "low" : ""}>
                <h3>{PLANS[id].name}<small>{PLAN_FEATURES[id].tag.toUpperCase()}</small></h3>
                <div className="st-amt">{euros(PLANS[id].price)}€<span>HT / MOIS, TOUTE L&apos;ÉQUIPE</span></div>
                <ul>
                  {PLAN_FEATURES[id].yes.map((t) => <li key={t}>{t}</li>)}
                  {PLAN_FEATURES[id].no.map((t) => <li key={t} className="no">{t}</li>)}
                </ul>
                <Link className="b" href={start}>ESSAYER 7 JOURS →</Link>
              </div>
            ))}
          </div>
          <p className="st-lead" style={{ fontSize: 16 }}>Exemple : 2 commerciaux internes + 1 freelance + 1 agence tiennent dans la formule Essentiel, soit {euros(PLANS.agency.price)} € HT par mois en tout. Jusqu&apos;à 10 commerciaux en Essentiel ; au-delà, Premium, sans limite.</p>
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
          <p>Vos commerciaux travaillent. Vous le voyez enfin, appel par appel.</p>
          <div className="st-btns">
            <Link className="st-btn p" href={start}>{u ? "OUVRIR MON ESPACE" : "SUIVRE MES COMMERCIAUX"} <span aria-hidden="true">→</span></Link>
            {!u && <a className="st-btn g" href="/demo" rel="nofollow">VOIR LA DÉMO <span aria-hidden="true">→</span></a>}
          </div>
        </div>
      </section>

      <footer className="st-foot">
        <span>© {new Date().getFullYear()} {LEGAL.brand.toUpperCase()} · DONNÉES DE DÉMONSTRATION FICTIVES SUR CETTE PAGE</span>
        <nav aria-label="Informations légales"><Link href="/mentions-legales">MENTIONS LÉGALES</Link><Link href="/cgv">CONDITIONS GÉNÉRALES</Link><Link href="/confidentialite">CONFIDENTIALITÉ</Link><a href={`mailto:${LEGAL.email}`}>{LEGAL.email.toUpperCase()}</a></nav>
      </footer>
    </div>
  );
}
