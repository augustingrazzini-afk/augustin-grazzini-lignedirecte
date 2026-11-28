import Link from "next/link";
import { PLANS, euros } from "@/lib/billing";
import "@fontsource/ibm-plex-mono/400.css";
import "../studio.css";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { AssistantDemo } from "@/components/marketing/AssistantDemo";
import { AI_CAN } from "@/lib/assistant-content";
import { LEGAL } from "@/lib/legal";

export const metadata = {
  title: "L'assistant IA de Trustpipe",
  description: "Un assistant IA qui a écouté chaque appel de chacun de vos commerciaux : il compare l'équipe, repère qui a besoin d'aide, explique les objections et prépare vos rendez-vous.",
};

const HOW: [string, string][] = [
  ["Les appels arrivent", "Chaque commercial branche son outil (Minari, Aircall, Ringover, lemlist…) : tous les appels de l'équipe remontent tout seuls dans Trustpipe."],
  ["L'IA les écoute", "Chaque appel est transcrit et résumé : ce que le prospect a dit, ses objections, le résultat et la prochaine étape."],
  ["Vous lui posez vos questions", "Comme à un directeur commercial : il répond en quelques secondes, à partir des vrais appels de chacun."],
];

const BOSS_ASKS = [
  "Que s'est-il dit dans les appels d'aujourd'hui ?",
  "Quels appels dois-je écouter en priorité, et pourquoi ?",
  "Dans quels appels a-t-on perdu le prospect ?",
  "L'agence fait-elle le travail promis ?",
  "Prépare mon rendez-vous de jeudi avec Atelier Morel",
];
const REP_ASKS = [
  "Qui dois-je rappeler en priorité aujourd'hui ?",
  "À quelle heure mes prospects décrochent-ils le plus ?",
  "Comment répondre à « on a déjà un fournisseur » ?",
  "Résume ma semaine",
];

const FAQ: [string, string][] = [
  ["Dans quelle formule est-il inclus ?", `Dès la formule Essentiel, à ${euros(PLANS.agency.price)} € HT par mois pour 4 commerciaux, avec la transcription, le résumé et l'analyse IA de chaque appel. La formule Premium (${euros(PLANS.premium.price)} € HT, jusqu'à 10 commerciaux) ajoute l'écoute des enregistrements, le connecteur Claude, les briefs et débriefs de rendez-vous.`],
  ["Mes commerciaux y ont-ils accès ?", "Oui, chacun dans son espace : son assistant ne connaît que ses propres appels. Le vôtre connaît toute l'équipe."],
  ["Sur quoi se base-t-il pour répondre ?", "Sur les appels de vos commerciaux : résumés, transcriptions, résultats, rendez-vous et relances. Il n'invente pas de chiffres : s'il n'a pas l'information, il le dit."],
  ["Peut-il se tromper ?", "Comme toute IA, oui. Ses réponses sont une aide à la préparation : relisez avant d'envoyer quoi que ce soit au prospect."],
  ["Et dans Claude ?", "Oui : avec le connecteur Trustpipe, vous retrouvez vos relances et l'historique de vos prospects directement dans Claude."],
];

/** Page publique : l'assistant IA de Trustpipe, expliqué avec une illustration animée. */
export default function Page() {
  return (
    <div className="studio">
      <VisitBeacon page="/assistant" />
      <header className="st-rail">
        <Link href="/" className="st-logo" aria-label="Trustpipe, accueil">TRUSTPIPE</Link>
        <nav className="st-links" aria-label="Sections"><a href="#comment">Comment ça marche</a><a href="#capacites">Ce qu&apos;il sait faire</a><a href="#questions">Questions</a><Link className="st-push st-keep" href="/login">Connexion</Link></nav>
        <Link className="st-go" href="/inscription">COMMENCER <span aria-hidden="true">→</span></Link>
      </header>

      <section className="st-sec">
        <div className="st-side"><div className="st-n">IA</div><small>Assistant IA<br />dès Essentiel</small></div>
        <div className="st-body">
          <div className="st-hero2">
            <div>
              <span className="st-aitag"><span className="st-dot" />FORMULE PREMIUM</span>
              <h1 className="st-h1" style={{ fontSize: "clamp(40px, 5.2vw, 80px)" }}>L&apos;assistant IA.<br /><span className="st-thin">Il a écouté</span><br /><span className="st-o">chaque appel.</span></h1>
              <p className="st-lead" style={{ fontSize: 19 }}>Dans Trustpipe, un assistant IA a écouté chaque appel de chacun de vos commerciaux : salariés, freelances, agences. Vous lui posez vos questions en français, il répond en quelques secondes à partir des vrais appels.</p>
              <div className="st-btns" style={{ maxWidth: 440, marginTop: 28 }}>
                <Link className="st-btn p" href="/inscription">SUIVRE MES COMMERCIAUX <span aria-hidden="true">→</span></Link>
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
          <h2 className="st-h2">Vous pilotez. <span className="st-thin">Vos commerciaux progressent.</span></h2>
          <div className="st-two">
            <div><span className="who">VOUS · DIRIGEANT OU MANAGER</span><h3>Vous pilotez l&apos;équipe</h3><p className="st-lead" style={{ fontSize: 15.5, marginTop: 8 }}>Sans attendre le reporting du vendredi : vous demandez, l&apos;assistant répond avec les chiffres et les appels.</p><ul>{BOSS_ASKS.map((a) => <li key={a}>{a}</li>)}</ul></div>
            <div><span className="who">VOS COMMERCIAUX · DANS LEUR ESPACE</span><h3>Ils progressent</h3><p className="st-lead" style={{ fontSize: 15.5, marginTop: 8 }}>Chaque commercial a son propre assistant, qui ne connaît que ses appels : relances, objections, préparation.</p><ul>{REP_ASKS.map((a) => <li key={a}>{a}</li>)}</ul></div>
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
          <p>L&apos;assistant IA est inclus dès la formule Essentiel : {euros(PLANS.agency.price)} € HT par mois, jusqu&apos;à 4 commerciaux.</p>
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
