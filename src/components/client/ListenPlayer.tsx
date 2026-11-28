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
  // L'erreur peut survenir avant que la page soit interactive : on la rattrape au montage.
  useEffect(() => { const a = ref.current; if (a && (a.error || a.networkState === 3)) setFailed(true); else if (a && a.duration) setDur(a.duration); }, []);
  if (failed) return fallback
    ? <a className="btn primary" href={fallback} target="_blank" rel="noopener noreferrer">▶ Écouter dans {tool}</a>
    : <span className="muted small">Enregistrement indisponible pour le moment. Réessayez dans quelques minutes.</span>;
  const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) a.play().catch(() => setFailed(true)); else a.pause(); };
  const seek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const a = ref.current; if (!a || !Number.isFinite(a.duration)) return toggle();
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
    if (a.paused) a.play().catch(() => setFailed(true));
  };
  const speed = () => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(next); if (ref.current) ref.current.playbackRate = next; };
  const done = Number.isFinite(dur) && dur > 0 ? t / dur : 0;
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
