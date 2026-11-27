/**
 * Illustration animée (CSS seul, en boucle) : les appels arrivent, l'assistant IA les lit,
 * une question est tapée et la réponse s'écrit. Noms et chiffres fictifs.
 */
const CALLS = [
  ["09:12", "Paul Morel", "par Léa · interne", "RDV PRIS", "rdv"],
  ["09:26", "Julie Martin", "par Prospectio · agence", "À RAPPELER", "rappel"],
  ["09:41", "Marc Duval", "par Karim · freelance", "À SUIVRE", "conv"],
  ["10:03", "Sophie Lemaire", "par Prospectio · agence", "PAS INTÉRESSÉ", "refus"],
] as const;

export function AssistantDemo() {
  return (
    <div className="st-ad" role="img" aria-label="Animation : les appels de l'équipe arrivent, l'assistant IA les lit, puis répond à la question « qui a pris le plus de rendez-vous cette semaine ? » en comparant les commerciaux.">
      <div className="st-ad-bar"><span className="st-dot" /><span>TRUSTPIPE · VOTRE ÉQUIPE COMMERCIALE</span><span className="st-ad-live">EN DIRECT</span></div>
      <div className="st-ad-grid">
        <div className="st-ad-calls">
          <div className="st-ad-h">APPELS DE L&apos;ÉQUIPE</div>
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
          <div className="st-ad-q"><span>qui a pris le plus de RDV cette semaine ?</span></div>
          <div className="st-ad-think" aria-hidden="true"><i /><i /><i /></div>
          <div className="st-ad-a">
            <p className="st-ad-in4"><b>Léa (interne) : 4 rendez-vous sur 61 appels.</b></p>
            <p className="st-ad-in5">Elle parle du délai dès la première phrase : les prospects restent en ligne.</p>
            <p className="st-ad-in6"><span className="st-o">Prospectio (agence) :</span> 1 RDV sur 154 appels, conversations trop courtes.</p>
            <p className="st-ad-in7"><span className="st-o">Piste :</span> faire écouter 2 appels de Léa à l&apos;agence.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
