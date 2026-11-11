// Logo Trustpipe : le symbole « tp » (t vert foncé, p vert menthe) et le mot « Trust » + « pipe ».
export const TP_DARK = "#0C3D2F";
export const TP_MINT = "#31D287";

/** Le symbole seul. `onDark` : le t passe en blanc pour rester lisible sur fond foncé. */
export function LogoMark({ size = 36, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 360 370" role="img" aria-label="Trustpipe" style={{ flex: "none" }}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="56">
        <path d="M111 80 V232 Q111 295 168 295" stroke={onDark ? "#fff" : TP_DARK} />
        <path d="M72 143 H160" stroke={onDark ? "#fff" : TP_DARK} />
        <path d="M232 160 V335" stroke={TP_MINT} />
      </g>
      <path fillRule="evenodd" fill={TP_MINT} d="M232 160 Q232 128 290 128 Q352 128 352 207 Q352 287 290 287 L232 287 Z M268 182 Q268 175 285 175 Q305 175 305 207 Q305 238 285 238 Q268 238 268 232 Z" />
    </svg>
  );
}

/** Symbole + mot « Trustpipe ». `onDark` pour la barre latérale. */
export function Logo({ size = 22, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span className="tp-logo" style={{ fontSize: size }}>
      <LogoMark size={Math.round(size * 1.55)} onDark={onDark} />
      <span className="tp-word"><span style={{ color: onDark ? "#fff" : TP_DARK }}>Trust</span><span style={{ color: TP_MINT }}>pipe</span></span>
    </span>
  );
}
