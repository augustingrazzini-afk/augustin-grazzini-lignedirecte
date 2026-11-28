"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Appel simulé de la page d'accueil (données fictives) : la conversation s'écrit en direct, l'onde suit la personne
 * qui parle, puis Trustpipe affiche ce qu'il en tire (transcription, résumé, objection, rendez-vous). En boucle.
 */
type Line = { who: "rep" | "pro"; text: string };
const LINES: Line[] = [
  { who: "rep", text: "Bonjour M. Morel, Léa de Solaris. Je vous appelle au sujet de vos coûts d'énergie." },
  { who: "pro", text: "On a déjà un fournisseur, et le budget de l'année est bouclé." },
  { who: "rep", text: "Justement : sans rien changer, je vous montre l'écart sur votre dernière facture. Quinze minutes." },
  { who: "pro", text: "Bon… jeudi, je vous donne un quart d'heure." },
  { who: "rep", text: "Parfait. Jeudi 15 h 30, je vous envoie l'invitation." },
];
const STEPS = ["Transcription", "Résumé IA", "Objection : budget, traitée", "Rendez-vous : jeudi 15 h 30"];
const NAMES = { rep: "Léa", pro: "Paul Morel" };
const CHAR_MS = 26, PAUSE_MS = 520, STEP_MS = 620, HOLD_MS = 4200;
const BARS = 44;
const TOTAL = LINES.reduce((n, l) => n + l.text.length, 0);

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function LiveCall() {
  // phase : index de la réplique en cours ; chars : lettres déjà écrites ; step : étapes Trustpipe affichées (après l'appel).
  const [st, setSt] = useState({ line: 0, chars: 0, step: 0, done: false });
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animations réduites demandées par la personne : on montre directement le résultat.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setSt({ line: LINES.length, chars: 0, step: STEPS.length, done: true }); return; }
    let t: ReturnType<typeof setTimeout>;
    let cur = { line: 0, chars: 0, step: 0, done: false };
    const tick = () => {
      if (document.hidden) { t = setTimeout(tick, 600); return; } // onglet en arrière-plan : on attend
      if (cur.line < LINES.length) {
        const len = LINES[cur.line].text.length;
        if (cur.chars < len) { cur = { ...cur, chars: Math.min(len, cur.chars + 2) }; setSt(cur); t = setTimeout(tick, CHAR_MS * 2); }
        else { cur = { ...cur, line: cur.line + 1, chars: 0 }; setSt(cur); t = setTimeout(tick, PAUSE_MS); }
      } else if (cur.step < STEPS.length) { cur = { ...cur, step: cur.step + 1, done: true }; setSt(cur); t = setTimeout(tick, STEP_MS); }
      else { t = setTimeout(() => { cur = { line: 0, chars: 0, step: 0, done: false }; setSt(cur); tick(); }, HOLD_MS); }
    };
    t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [st.line, st.chars]);

  // Chronomètre de l'appel : il avance avec la conversation (47 secondes d'appel, montrées en accéléré).
  const said = LINES.slice(0, st.line).reduce((n, l) => n + l.text.length, 0) + st.chars;
  const sec = Math.round((Math.min(said, TOTAL) / TOTAL) * 47);
  const speaking = !st.done && st.line < LINES.length && st.chars < LINES[st.line].text.length ? LINES[st.line].who : null;
  const shown = LINES.slice(0, Math.min(LINES.length, st.line + 1)).map((l, i) => ({ ...l, text: i < st.line ? l.text : l.text.slice(0, st.chars), live: i === st.line && !st.done }));

  return (
    <div className={`st-live${st.done ? " done" : ""}`} aria-label="Exemple : un appel suivi en direct, puis ce que Trustpipe en retient (données fictives)">
      <div className="st-lv-head">
        <span className="st-lv-state">{st.done ? <><i className="ok" />APPEL TERMINÉ</> : <><i />APPEL EN COURS</>}</span>
        <span className="st-lv-who">LÉA · INTERNE <b>→</b> PAUL MOREL · <b>ATELIER MOREL</b></span>
        <span className="st-lv-time">{mmss(sec)}</span>
      </div>
      <div className="st-lv-body">
        <div className="st-lv-call">
          <div className={`st-lv-bars${speaking ? " " + speaking : ""}`} aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 137) % 900)}ms`, animationDuration: `${520 + ((i * 53) % 380)}ms` }} />)}
          </div>
          <div className="st-lv-feed" ref={feed} aria-hidden="true">
            {shown.map((l, i) => l.text && (
              <p key={i} className={l.who}><b>{NAMES[l.who]}</b><span>{l.text}{l.live && <em className="st-lv-caret" />}</span></p>
            ))}
          </div>
        </div>
        <div className="st-lv-out" aria-hidden="true">
          <small>CE QUE TRUSTPIPE EN RETIENT</small>
          <ul>
            {STEPS.map((s, i) => <li key={s} className={`${i < st.step ? "on" : ""}${i === STEPS.length - 1 ? " rdv" : ""}`}><i>{i < st.step ? "✓" : ""}</i>{s}</li>)}
          </ul>
          <p className={st.step >= 2 ? "on" : ""}>« Déjà équipé et budget bouclé, mais accepte 15 minutes pour comparer sa facture. Rendez-vous jeudi à 15 h 30. »</p>
        </div>
      </div>
    </div>
  );
}
