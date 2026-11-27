/**
 * Illustration animée (CSS seul, en boucle) : les appels arrivent, l'assistant IA les lit,
 * une question est tapée et la réponse s'écrit. Noms et chiffres fictifs.
 */
const CALLS = [
  ["09:12", "Paul Morel", "Atelier Morel", "RDV PRIS", "rdv"],
  ["09:26", "Julie Martin", "Nova Habitat", "À RAPPELER", "rappel"],
  ["09:41", "Karim Benali", "Benali Transports", "À SUIVRE", "conv"],
  ["10:03", "Sophie Lemaire", "Lemaire & Fils", "PAS INTÉRESSÉ", "refus"],
] as const;

export function AssistantDemo() {
  return (
    <div className="st-ad" role="img" aria-label="Animation : les appels du jour arrivent, l'assistant IA les lit, puis répond à la question « prépare mon rendez-vous de jeudi avec Atelier Morel » avec un brief du prospect.">
      <div className="st-ad-bar"><span className="st-dot" /><span>TRUSTPIPE · ESPACE DE VOTRE CLIENT</span><span className="st-ad-live">EN DIRECT</span></div>
      <div className="st-ad-grid">
        <div className="st-ad-calls">
          <div className="st-ad-h">APPELS DU JOUR</div>
          {CALLS.map(([t, n, c, r, k], i) => (
            <div key={n} className={`st-ad-row st-ad-in${i}`}>
              <span className="t">{t}</span>
              <span className="n"><b>{n}</b><small>{c}</small></span>
              <span className={`st-fk ${k}`}>{r}</span>
            </div>
          ))}
          <div className="st-ad-scan" aria-hidden="true" />
          <div className="st-ad-read"><span className="st-ad-n" />APPELS LUS PAR L&apos;ASSISTANT</div>
        </div>
        <div className="st-ad-chat">
          <div className="st-ad-h"><span className="st-ad-ia">IA</span>ASSISTANT IA</div>
          <div className="st-ad-q"><span>prépare mon RDV de jeudi avec Atelier Morel</span></div>
          <div className="st-ad-think" aria-hidden="true"><i /><i /><i /></div>
          <div className="st-ad-a">
            <p className="st-ad-in4"><b>Paul Morel, gérant d&apos;Atelier Morel.</b></p>
            <p className="st-ad-in5">Appelé mardi à 9 h 12 : il veut réduire ses coûts d&apos;énergie, a accepté quand on a parlé de délai.</p>
            <p className="st-ad-in6"><span className="st-o">Objection probable :</span> le timing, il sort d&apos;un contrat.</p>
            <p className="st-ad-in7"><span className="st-o">Pour ouvrir :</span> « Qu&apos;est-ce qui bloquait jusqu&apos;ici ? »</p>
          </div>
        </div>
      </div>
    </div>
  );
}
