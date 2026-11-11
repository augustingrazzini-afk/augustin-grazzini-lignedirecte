import { BRAND_LOGOS } from "@/lib/brand-logos";

/** Logo d'un outil : le vrai logo s'il est disponible, sinon un monogramme à sa couleur. */
export function BrandLogo({ id, mono, color, size = 44 }: { id: string; mono?: string; color?: string; size?: number }) {
  const l = BRAND_LOGOS[id];
  if (l) {
    return (
      <span className="brand-logo" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} role="img" aria-label={id} fill={l.hex}><path d={l.path} /></svg>
      </span>
    );
  }
  return <span className="cx-logo" style={{ width: size, height: size, background: color || "#59628A", fontSize: size * 0.36 }}>{mono || id.slice(0, 2)}</span>;
}
