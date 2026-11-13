"use client";
import { useEffect, useState } from "react";

/**
 * Bloc d'aide masquable : une fois fermé, il ne revient plus sur cet appareil (mémoire locale du navigateur).
 * Il reste affiché si la mémoire locale n'est pas disponible (navigation privée stricte).
 */
export function Dismissible({ storeKey, children, className, closeLabel = "Masquer" }: { storeKey: string; children: React.ReactNode; className?: string; closeLabel?: string }) {
  const [hidden, setHidden] = useState(true); // évite un flash avant la lecture de la mémoire locale
  useEffect(() => {
    try { setHidden(localStorage.getItem(storeKey) === "1"); } catch { setHidden(false); }
  }, [storeKey]);
  if (hidden) return null;
  return (
    <div className={className} style={{ position: "relative" }}>
      <button type="button" className="gs-close" aria-label={closeLabel} title={closeLabel}
        onClick={() => { setHidden(true); try { localStorage.setItem(storeKey, "1"); } catch { /* mémoire indisponible */ } }}>×</button>
      {children}
    </div>
  );
}
