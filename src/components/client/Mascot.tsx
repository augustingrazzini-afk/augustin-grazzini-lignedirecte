/** Pip, la mascotte de l'assistant : un petit personnage qui flotte, cligne des yeux et fait coucou. */
export function Mascot({ size = 56, talking = false }: { size?: number; talking?: boolean }) {
  return (
    <svg className={`pip${talking ? " talking" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g className="pip-body">
        <line x1="32" y1="9" x2="32" y2="15" stroke="#0C3D2F" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="pip-bulb" cx="32" cy="7" r="3.6" fill="#31D287" />
        <rect x="11" y="15" width="42" height="34" rx="15" fill="#0C3D2F" />
        <rect x="16" y="20" width="32" height="22" rx="10" fill="#E9FBF2" />
        <g className="pip-eyes" fill="#0C3D2F">
          <ellipse cx="25.5" cy="30" rx="3" ry="3.6" />
          <ellipse cx="38.5" cy="30" rx="3" ry="3.6" />
        </g>
        <circle cx="21" cy="36" r="2.2" fill="#31D287" opacity=".55" />
        <circle cx="43" cy="36" r="2.2" fill="#31D287" opacity=".55" />
        <path className="pip-mouth" d="M28 36.5 Q32 40 36 36.5" stroke="#0C3D2F" strokeWidth="2" fill="none" strokeLinecap="round" />
        <rect className="pip-arm-l" x="5" y="30" width="8" height="5" rx="2.5" fill="#0C3D2F" />
        <rect className="pip-arm-r" x="51" y="24" width="8" height="5" rx="2.5" fill="#31D287" />
        <rect x="22" y="49" width="7" height="6" rx="3" fill="#0C3D2F" />
        <rect x="35" y="49" width="7" height="6" rx="3" fill="#0C3D2F" />
      </g>
      <ellipse className="pip-shadow" cx="32" cy="61" rx="13" ry="2.4" fill="#0C3D2F" opacity=".14" />
    </svg>
  );
}
