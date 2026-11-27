import Link from "next/link";
import "@fontsource/ibm-plex-mono/400.css";
import "../studio.css";
import { LogoMark } from "@/components/Logo";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { AssistantDemo } from "@/components/marketing/AssistantDemo";
import { AI_CAN } from "@/lib/assistant-content";
import { LEGAL } from "@/lib/legal";

export const metadata = {
  title: "L'assistant IA de Trustpipe",
  description: "Un assistant IA qui a écouté chaque appel de prospection : il prépare les rendez-vous, répond sur la campagne et explique les objections. Pour vous et pour vos clients.",
};

const HOW: [string, string][] = [
  ["Vos appels arrivent", "Minari, lemlist, Aircall, Ringover… Chaque appel remonte tout seul dans Trustpipe, avec son enregistrement quand votre outil le fournit."],
  ["L'IA les lit", "Chaque appel est transcrit et résumé : ce que le prospect a dit, ses objections, le résultat et la prochaine étape."],
  ["On lui pose ses questions", "Votre client depuis son lien de suivi, vous depuis votre espace : on lui écrit comme à un collègue, il répond à partir des vrais appels."],
];

const CLIENT_ASKS = [
  "Prépare mon rendez-vous de jeudi avec Atelier Morel",
  "Qu'est-ce qui bloque le plus chez les prospects ?",
  "Combien de rendez-vous cette semaine ?",
  "Débriefe ma visio de ce matin",
];
const YOU_ASKS = [
  "Qui dois-je rappeler en priorité aujourd'hui ?",
  "À quelle heure les prospects décrochent-ils le plus ?",
  "Résume la semaine pour mon client",
  "Comment répondre à « on a déjà un fournisseur » ?",
];

const FAQ: [string, string][] = [
  ["Est-ce inclus dans l'abonnement ?", "Oui. L'assistant IA est inclus dans toutes les formules, sans option ni supplément."],
  ["Mon client a-t-il besoin d'un compte ?", "Non. Il ouvre son lien de suivi et l'assistant est là, dans l'onglet Assistant IA. Il ne voit que ses propres appels."],
  ["Sur quoi se base-t-il pour répondre ?", "Sur les appels de l'espace : résumés, transcriptions, résultats, rendez-vous et relances. Il n'invente pas de chiffres : s'il n'a pas l'information, il le dit."],
  ["Peut-il se tromper ?", "Comme toute IA, oui. Ses réponses sont une aide à la préparation : relisez avant d'envoyer quoi que ce soit au prospect."],
  ["Et dans Claude ?", "Oui : avec le connecteur Trustpipe, vous retrouvez vos relances et l'historique de vos prospects directement dans Claude."],
];

/** Page publique : l'assistant IA de Trustpipe, expliqué avec une illustration animée. */
export default function Page() {
  return (
    <div className="studio">
      <VisitBeacon page="/assistant" />
      <header className="st-rail">
        <Link href="/" className="st-logo" aria-label="Trustpipe, accueil"><LogoMark size={30} />TRUSTPIPE</Link>
        <nav className="st-links" aria-label="Sections"><a href="#comment">Comment ça marche</a><a href="#capacites">Ce qu&apos;il sait faire</a><a href="#questions">Questions</a><Link className="st-push st-keep" href="/login">Connexion</Link></nav>
        <Link className="st-go" href="/inscription">COMMENCER <span aria-hidden="true">→</span></Link>
      </header>

      <section className="st-sec">
        <div className="st-side"><div className="st-n">IA</div><small>Assistant IA<br />inclus</small></div>
        <div className="st-body">
          <div className="st-hero2">
            <div>
              <span className="st-aitag"><span className="st-dot" />INCLUS DANS TOUTES LES FORMULES</span>
              <h1 className="st-h1" style={{ fontSize: "clamp(40px, 5.2vw, 80px)" }}>L&apos;assistant IA.<br /><span className="st-thin">Il a écouté</span><br /><span className="st-o">chaque appel.</span></h1>
              <p className="st-lead" style={{ fontSize: 19 }}>Dans Trustpipe, un assistant IA connaît toute votre prospection : chaque appel, chaque objection, chaque rendez-vous. Votre client et vous lui posez vos questions en français, il répond en quelques secondes à partir des vrais appels.</p>
              <div className="st-btns" style={{ maxWidth: 440, marginTop: 28 }}>
                <Link className="st-btn p" href="/inscription">ESSAYER TRUSTPIPE <span aria-hidden="true">→</span></Link>
                <a className="st-btn g" href="#comment">COMMENT ÇA MARCHE <span aria-hidden="true">↓</span></a>
              </div>
            </div>
            <AssistantDemo />
          </div>
        </div>
      </section>

      <section id="comment" className="st-sec">
        <div className="st-side"><div className="st-n">01</div><small>Comment<br />ça marche</small></div>
        <div className="st-body">
          <h2 className="st-h2">Trois étapes. <span className="st-thin">Rien à configurer.</span></h2>
          <div className="st-trio">
            {HOW.map(([t, d], i) => <div key={t}><div className={`st-big${i === 2 ? " st-o" : ""}`}>{String(i + 1).padStart(2, "0")}</div><h4>{t}</h4><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="st-sec">
        <div className="st-side"><div className="st-n">02</div><small>Pour qui</small></div>
        <div className="st-body">
          <h2 className="st-h2">Votre client lui parle. <span className="st-thin">Vous aussi.</span></h2>
          <div className="st-two">
            <div><span className="who">VOTRE CLIENT · DEPUIS SON LIEN DE SUIVI</span><h3>Il prépare ses rendez-vous</h3><p className="st-lead" style={{ fontSize: 15.5, marginTop: 8 }}>Sans vous appeler ni attendre le reporting du vendredi : il demande, l&apos;assistant répond.</p><ul>{CLIENT_ASKS.map((a) => <li key={a}>{a}</li>)}</ul></div>
            <div><span className="who">VOUS · DEPUIS VOTRE ESPACE</span><h3>Vous pilotez la campagne</h3><p className="st-lead" style={{ fontSize: 15.5, marginTop: 8 }}>Priorités du jour, objections, bons créneaux : votre coach de prospection, qui connaît chaque appel.</p><ul>{YOU_ASKS.map((a) => <li key={a}>{a}</li>)}</ul></div>
          </div>
        </div>
      </section>

      <section id="capacites" className="st-sec">
        <div className="st-side"><div className="st-n">03</div><small>Ce qu&apos;il<br />sait faire</small></div>
        <div className="st-body">
          <h2 className="st-h2">Six choses. <span className="st-thin">Tous les jours.</span></h2>
          <div className="st-secg">{AI_CAN.map(([t, d]) => <div key={t}><b>{t}</b><p>{d}</p></div>)}</div>
          <p className="st-lead" style={{ fontSize: 16 }}>Vous utilisez Claude ? <Link href="/claude" style={{ color: "var(--o)" }}>Branchez aussi Trustpipe sur Claude</Link> pour gérer vos relances depuis la conversation.</p>
        </div>
      </section>

      <section id="questions" className="st-sec">
        <div className="st-side"><div className="st-n">04</div><small>Vos<br />questions</small></div>
        <div className="st-body">
          <h2 className="st-h2">Questions <span className="st-thin">fréquentes.</span></h2>
          <div className="st-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="st-end">
        <div className="st-endrow">
          <p>L&apos;assistant IA est inclus dès la formule Solo, à 24,99 € HT par mois.</p>
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
