import Link from "next/link";
import { Logo } from "./Logo";

/** Carte commune aux pages de connexion, d'inscription et de mot de passe. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="auth">
      <Link href="/" className="auth-back">← Retour à l&apos;accueil</Link>
      <div className="card">
        <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 20 }}><Logo size={24} /></Link>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 28, margin: "0 0 6px", letterSpacing: "-.02em" }}>{title}</h1>
        {subtitle && <p className="muted" style={{ margin: "0 0 20px" }}>{subtitle}</p>}
        {children}
        {footer && <div className="auth-foot">{footer}</div>}
      </div>
    </div>
  );
}
