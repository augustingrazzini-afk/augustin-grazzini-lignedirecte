"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Lecteur de l'enregistrement, directement dans Trustpipe. Si le fichier ne peut pas être lu ici
 * (l'outil exige d'être connecté, lien expiré…), on propose d'ouvrir l'enregistrement dans l'outil.
 */
export function ListenPlayer({ src, fallback, tool }: { src: string; fallback?: string | null; tool: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLAudioElement>(null);
  // L'erreur peut survenir avant que la page soit interactive : on la rattrape au montage.
  useEffect(() => { const a = ref.current; if (a && (a.error || a.networkState === 3)) setFailed(true); }, []);
  if (failed) return fallback
    ? <a className="btn primary" href={fallback} target="_blank" rel="noopener noreferrer">▶ Écouter dans {tool}</a>
    : <span className="muted small">Enregistrement indisponible pour le moment. Réessayez dans quelques minutes.</span>;
  return <audio ref={ref} controls preload="metadata" src={src} onError={() => setFailed(true)} />;
}
