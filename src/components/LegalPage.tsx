import Link from "next/link";
import { Logo } from "./Logo";
import { LEGAL, isTodo } from "@/lib/legal";

/** Affiche une valeur légale, ou « à compléter » bien visible tant qu'elle n'est pas renseignée. */
export function V({ v }: { v: string }) {
  return isTodo(v) ? <mark className="todo">à compléter</mark> : <>{v}</>;
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="landing legal">
      <header className="lp-nav"><Link href="/" style={{ textDecoration: "none" }}><Logo size={22} /></Link><Link className="btn primary" href="/inscription">Essai gratuit</Link></header>
      <article>
        <h1>{title}</h1>
        <p className="muted">Dernière mise à jour : {LEGAL.updatedAt}</p>
        {children}
      </article>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="lp-footer">
      <span>© {new Date().getFullYear()} {LEGAL.brand}</span>
      <Link href="/mentions-legales">Mentions légales</Link>
      <Link href="/cgv">Conditions générales</Link>
      <Link href="/confidentialite">Confidentialité et cookies</Link>
    </footer>
  );
}
