// Logo Trustpipe (direction « Studio / On Air ») : un carré orange électrique avec le point REC
// et une onde sonore, suivi du mot TRUSTPIPE en Unbounded.
export const TP_ORANGE = "#FF5A1F";
export const TP_INK = "#140700";
// Anciennes couleurs, gardées pour les éléments qui les utilisent encore.
export const TP_DARK = "#0C3D2F";
export const TP_MINT = "#31D287";

/** Le symbole seul. */
export function LogoMark({ size = 36 }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 360 360" role="img" aria-label="Trustpipe" style={{ flex: "none" }}>
      <rect width="360" height="360" rx="84" fill={TP_ORANGE} />
      <circle cx="110" cy="180" r="48" fill={TP_INK} />
      <rect x="186" y="118" width="32" height="124" rx="16" fill={TP_INK} />
      <rect x="232" y="74" width="32" height="212" rx="16" fill={TP_INK} />
      <rect x="278" y="138" width="32" height="84" rx="16" fill={TP_INK} />
    </svg>
  );
}

/** Le mot « TRUSTPIPE » seul, en gros (sans symbole ni signature). `onDark` pour les fonds sombres. */
export function Logo({ size = 22, onDark = false }: { size?: number; onDark?: boolean; by?: boolean }) {
  return (
    <span className="tp-logo" style={{ fontSize: size }}>
      <span className="tp-word" style={{ color: onDark ? "#EDE9E1" : "var(--ink, #140700)", fontFamily: "\"Unbounded Variable\", \"Arial Black\", sans-serif", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".01em", fontSize: "1.25em", lineHeight: 1 }}>Trustpipe</span>
    </span>
  );
}
