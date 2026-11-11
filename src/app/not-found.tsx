import Link from "next/link";
export default function NotFound() {
  return <div className="auth"><div className="card"><h1 style={{ fontFamily: "var(--f-display)", margin: "0 0 8px" }}>Page introuvable</h1><p className="muted">Cette page n&apos;existe pas ou vous n&apos;y avez pas accès.</p><Link className="btn" href="/app">Retour à mon espace</Link></div></div>;
}
