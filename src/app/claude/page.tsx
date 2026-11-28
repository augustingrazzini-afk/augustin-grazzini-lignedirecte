import Link from "next/link";
import { claudeInstallLink } from "@/lib/claude-link";
import "@fontsource/ibm-plex-mono/400.css";
import "../studio.css";
import { LEGAL } from "@/lib/legal";

export const metadata = {
  title: "Trustpipe dans Claude",
  description: "Branchez Trustpipe sur Claude : vos relances, vos commerciaux et l'historique d'appels de vos prospects, directement dans la conversation.",
};

const URL_MCP = `${(process.env.APP_URL || "https://trustpipe.fr").replace(/\/$/, "")}/api/mcp`;

const STEPS: [string, string][] = [
  ["Cliquez sur « Connecter Claude »", "Claude s'ouvre sur l'ajout d'un connecteur, avec le nom et l'adresse de Trustpipe déjà remplis."],
  ["Confirmez l'ajout", "Vérifiez l'adresse affichée (" + URL_MCP + ") et cliquez sur « Ajouter »."],
  ["Connectez votre compte", "Claude ouvre Trustpipe : connectez-vous, puis cliquez sur « Autoriser ». C'est tout."],
];

const TOOLS: [string, string, string][] = [
  ["lister_relances", "Lecture", "Vos relances à faire, en retard, du jour ou de la semaine, filtrables par client ou par prospect."],
  ["historique_prospect", "Lecture", "Les derniers appels d'un prospect : date, durée, résumé IA, rendez-vous pris, et ses relances."],
  ["lister_clients", "Lecture", "Vos commerciaux, avec leurs appels des 7 derniers jours et leurs relances à faire."],
  ["creer_relance", "Écriture", "Planifie une relance à une date, rattachée automatiquement au prospect déjà appelé."],
  ["modifier_relance", "Écriture", "Marque une relance comme faite, l'ignore, la rouvre ou la reporte."],
];

const ASKS = [
  "Quelles relances sont en retard ?",
  "Prépare ma journée : relances d'aujourd'hui, avec le contexte de chaque prospect.",
  "Relis mon dernier appel avec Atelier Morel et propose-moi un message de relance.",
  "Reporte la relance de Paul Morel à jeudi 10 h.",
  "Crée une relance pour Julie Martin (Nova Habitat) lundi : envoyer la plaquette.",
  "Quel client a le plus de relances en attente ?",
];

/** Page publique : connecter Trustpipe à Claude (connecteur MCP). Sert aussi de documentation du connecteur. */
export default function Page() {
  return (
    <div className="studio">
      <header className="st-rail">
        <Link href="/" className="st-logo" aria-label="Trustpipe, accueil">TRUSTPIPE</Link>
        <nav className="st-links" aria-label="Sections"><a href="#installer">Installer</a><a href="#outils">Outils</a><a href="#securite">Sécurité</a><Link className="st-push st-keep" href="/login">Connexion</Link></nav>
        <Link className="st-go" href="/inscription">COMMENCER <span aria-hidden="true">→</span></Link>
      </header>

      <section className="st-sec">
        <div className="st-side"><div className="st-n">AI</div><small>Connecteur<br />Claude</small></div>
        <div className="st-body" style={{ paddingTop: 80 }}>
          <h1 className="st-h1" style={{ fontSize: "clamp(40px, 6vw, 88px)" }}>Trustpipe.<br /><span className="st-thin">Dans Claude.</span></h1>
          <p className="st-lead" style={{ fontSize: 21 }}>Demandez à Claude vos relances du jour, le contexte d&apos;un prospect ou de reporter un rappel : il lit et gère vos relances Trustpipe, directement dans la conversation. Inclus dans la formule Premium.</p>
          <div className="st-btns" style={{ maxWidth: 420, marginTop: 32 }}>
            <a className="st-btn p" href={claudeInstallLink()} target="_blank" rel="noopener noreferrer">CONNECTER CLAUDE EN 1 CLIC <span aria-hidden="true">→</span></a>
            <a className="st-btn g" href="#installer">VOIR LES ÉTAPES <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>

      <section id="installer" className="st-sec">
        <div className="st-side"><div className="st-n">01</div><small>Installer</small></div>
        <div className="st-body">
          <h2 className="st-h2">Trois étapes. <span className="st-thin">Une minute.</span></h2>
          <div className="st-list" style={{ gridTemplateColumns: "1fr" }}>
            {STEPS.map(([t, d], i) => (
              <div key={t}><span>{String(i + 1).padStart(2, "0")}</span><div><b>{t}</b>{i === 1 ? <code className="st-mono" style={{ display: "block", marginTop: 8, padding: "14px 16px", border: "1px solid var(--o)", color: "var(--bone)", fontSize: 17, userSelect: "all", wordBreak: "break-all" }}>{d}</code> : <p>{d}</p>}</div></div>
            ))}
          </div>
          <p className="st-lead" style={{ fontSize: 16 }}>Il faut un compte Trustpipe avec la formule Premium active. Pas encore de compte ? <Link href="/inscription" style={{ color: "var(--o)" }}>Créez-le ici</Link>.</p>
        </div>
      </section>

      <section className="st-sec">
        <div className="st-side"><div className="st-n">02</div><small>Exemples</small></div>
        <div className="st-body">
          <h2 className="st-h2">Ce que vous pouvez <span className="st-thin">lui demander.</span></h2>
          <div className="st-ai" style={{ gridTemplateColumns: "1fr" }}>
            <div className="q"><div className="st-prompt">{ASKS.map((a) => <div key={a}><span className="u1">vous ~ </span>{a}</div>)}<span className="st-cur" /></div></div>
          </div>
        </div>
      </section>

      <section id="outils" className="st-sec">
        <div className="st-side"><div className="st-n">03</div><small>Les outils<br />du connecteur</small></div>
        <div className="st-body">
          <h2 className="st-h2">Cinq outils. <span className="st-thin">Rien de plus.</span></h2>
          <div className="st-secg">{TOOLS.map(([n, k, d]) => <div key={n}><b className="st-mono" style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{n}</b><span className="st-mono" style={{ display: "inline-block", fontSize: 11, letterSpacing: ".12em", color: k === "Lecture" ? "var(--dim)" : "var(--o)", border: "1px solid currentColor", padding: "2px 6px", margin: "0 0 10px" }}>{k.toUpperCase()}</span><p>{d}</p></div>)}</div>
          <p className="st-lead" style={{ fontSize: 16 }}>Claude ne peut ni supprimer de données, ni modifier vos réglages, vos outils connectés ou votre abonnement.</p>
        </div>
      </section>

      <section id="securite" className="st-sec">
        <div className="st-side"><div className="st-n">04</div><small>Sécurité</small></div>
        <div className="st-body">
          <h2 className="st-h2">Votre espace, <span className="st-thin">et lui seul.</span></h2>
          <div className="st-secg">
            <div><b>Connexion OAuth</b><p>Vous autorisez Claude depuis Trustpipe, sans jamais lui donner votre mot de passe. Connexion sécurisée par PKCE.</p></div>
            <div><b>Cloisonné</b><p>L&apos;accès est limité à votre espace : vos commerciaux et vos relances, rien d&apos;un autre compte.</p></div>
            <div><b>Révocable</b><p>Coupez l&apos;accès en un clic dans Trustpipe : Réglages › Claude. Il s&apos;arrête aussi si vous quittez l&apos;espace.</p></div>
            <div><b>Jetons protégés</b><p>Les jetons d&apos;accès sont stockés hachés, renouvelés automatiquement et valables 30 jours.</p></div>
            <div><b>Hébergé en France</b><p>Vos données restent dans la base Trustpipe, à Paris. Le connecteur ne les envoie qu&apos;à Claude, à votre demande.</p></div>
            <div><b>Vos données</b><p>Ce que Claude lit via le connecteur suit votre compte Claude et sa politique de confidentialité. <Link href="/confidentialite" style={{ color: "var(--o)" }}>Notre politique</Link>.</p></div>
          </div>
        </div>
      </section>

      <section className="st-end">
        <div className="st-endrow">
          <p>Une question sur le connecteur ? Écrivez-nous : <a href={`mailto:${LEGAL.email}`} style={{ color: "var(--o)" }}>{LEGAL.email}</a></p>
          <Link className="st-btn p" href="/inscription">CRÉER MON COMPTE <span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <footer className="st-foot">
        <span>© {new Date().getFullYear()} {LEGAL.brand.toUpperCase()}</span>
        <nav aria-label="Informations légales"><Link href="/mentions-legales">MENTIONS LÉGALES</Link><Link href="/cgv">CONDITIONS GÉNÉRALES</Link><Link href="/confidentialite">CONFIDENTIALITÉ</Link></nav>
      </footer>
    </div>
  );
}
