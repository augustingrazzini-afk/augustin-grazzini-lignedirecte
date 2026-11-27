"use client";
import { useState } from "react";
import { BRAND_LOGOS } from "@/lib/brand-logos";

/** Logo d'un outil : le vrai logo (vectoriel, sinon l'icône officielle du site), à défaut un monogramme à sa couleur. */
export function BrandLogo({ id, mono, color, size = 44 }: { id: string; mono?: string; color?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const l = BRAND_LOGOS[id];
  if (l) {
    return (
      <span className="brand-logo" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} role="img" aria-label={id} fill={l.hex}><path d={l.path} /></svg>
      </span>
    );
  }
  if (!failed && !["custom", "webhook", "csv", "manual"].includes(id)) {
    return (
      <span className="brand-logo" style={{ width: size, height: size, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/logo/${encodeURIComponent(id)}`} alt={id} width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} loading="lazy" onError={() => setFailed(true)} style={{ objectFit: "contain", borderRadius: 6 }} />
      </span>
    );
  }
  return <span className="cx-logo" style={{ width: size, height: size, background: color || "#59628A", fontSize: size * 0.36 }}>{mono || id.slice(0, 2)}</span>;
}
