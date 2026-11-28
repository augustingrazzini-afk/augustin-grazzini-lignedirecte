"use client";
import { useEffect, useRef, useState } from "react";

const BARS = 56;
/** Hauteur de chaque barre de l'onde (fixe par enregistrement, pour un dessin stable). */
const shape = (seed: string) => {
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARS }, (_, i) => { h = (h * 1664525 + 1013904223) >>> 0; return 22 + Math.round(((h >>> 8) % 100) * 0.55 + Math.abs(Math.sin(i / 3.5)) * 23); });
};
const mmss = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––");

/**
 * Lecteur de l'enregistrement, directement dans Trustpipe : onde animée pendant l'écoute, clic pour avancer, vitesse.
 * Si le fichier ne peut pas être lu ici (l'outil exige d'être connecté, lien expiré…), on propose d'ouvrir l'enregistrement dans l'outil.
 */
export function ListenPlayer({ src, fallback, tool }: { src: string; fallback?: string | null; tool: string }) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(NaN);
  const [rate, setRate] = useState(1);
  const ref = useRef<HTMLAudioElement>(null);
  const [bars] = useState(() => shape(src.split("?")[0]));
  // Une vraie erreur de lecture peut survenir avant que la page soit interactive : on la rattrape au montage.
  // (On ne se fie pas à l'état « réseau » du lecteur : sur iPhone il est trompeur tant qu'on n'a pas appuyé sur lecture.)
  useEffect(() => { const a = ref.current; if (a?.error) setFailed(true); else if (a && Number.isFinite(a.duration)) setDur(a.duration); }, []);
  // L'écoute se fait toujours ici. En cas d'échec, on propose de réessayer ; le lien vers l'outil n'est qu'un dernier recours discret.
  const retry = () => { setFailed(false); setT(0); requestAnimationFrame(() => { const a = ref.current; if (a) { a.load(); a.play().catch(() => {}); } }); };
  const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) a.play().catch(() => { /* lecture refusée par le navigateur : l'utilisateur rappuie */ }); else a.pause(); };
  const seek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const a = ref.current; if (!a || !Number.isFinite(a.duration)) return toggle();
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
    if (a.paused) a.play().catch(() => {});
  };
  const speed = () => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(next); if (ref.current) ref.current.playbackRate = next; };
  const done = Number.isFinite(dur) && dur > 0 ? t / dur : 0;
  if (failed) return (
    <div className="lp lp-err">
      <audio ref={ref} preload="none" src={src} onError={() => setFailed(true)} onPlay={() => { setFailed(false); setPlaying(true); }} />
      <button type="button" className="btn primary" onClick={retry}>▶ Réessayer l&apos;écoute</button>
      <span className="muted small">L&apos;enregistrement n&apos;a pas pu être lu.{fallback && <> En dernier recours : <a href={fallback} target="_blank" rel="noopener noreferrer">l&apos;ouvrir dans {tool}</a>.</>}</span>
    </div>
  );
  return (
    <div className={`lp${playing ? " playing" : ""}`}>
      <audio ref={ref} preload="metadata" src={src} onError={() => setFailed(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onDurationChange={(e) => setDur(e.currentTarget.duration)} />
      <button type="button" className="lp-btn" onClick={toggle} aria-label={playing ? "Mettre en pause" : "Écouter l'appel"}>{playing ? "❚❚" : "▶"}</button>
      <button type="button" className="lp-wave" onClick={seek} aria-label="Avancer dans l'enregistrement">
        {bars.map((h, i) => <i key={i} className={i / BARS < done ? "on" : ""} style={{ height: `${h}%`, ["--i" as string]: i }} />)}
      </button>
      <span className="lp-time">{mmss(t)} / {mmss(dur)}</span>
      <button type="button" className="lp-speed" onClick={speed} aria-label="Vitesse de lecture">×{rate}</button>
    </div>
  );
}
