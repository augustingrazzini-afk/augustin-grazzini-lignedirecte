"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

export type NavItem = { href: string; label: string; icon: string; badge?: number; sep?: boolean; /** Nom de la formule qui ouvre cette page, si elle n'est pas incluse. */ locked?: string };

/** Les 4 écrans du quotidien, toujours visibles en bas sur téléphone ; le reste est rangé dans « Plus ». */
const MAIN = ["pilotage", "appels", "relances", "coach"];

export function NavLinks({ items, variant, footer }: { items: NavItem[]; variant: "side" | "tab"; footer?: React.ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const active = (href: string) => {
    const matches = items.filter((i) => path === i.href || path.startsWith(i.href + "/"));
    const best = matches.sort((a, b) => b.href.length - a.href.length)[0];
    return best?.href === href;
  };
  if (variant === "tab" && items.length > 5) {
    const main = items.filter((i) => MAIN.includes(i.icon)), rest = items.filter((i) => !MAIN.includes(i.icon));
    const tab = (i: NavItem) => i.locked ? (
      <span key={i.href} className="tab-locked" aria-disabled="true" title={`Inclus dans la formule ${i.locked}`}><Icon name={i.icon} /><span>{i.label.split(" ")[0]}</span><em className="lock-pill">{i.locked}</em></span>
    ) : (
      <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined} prefetch>
        <Icon name={i.icon} /><span>{i.label.split(" ")[0]}</span>{!!i.badge && <em className="tab-badge">{i.badge > 99 ? "99+" : i.badge}</em>}
      </Link>
    );
    return (
      <>
        {more && <button type="button" className="tab-veil" aria-label="Fermer le menu" onClick={() => setMore(false)} />}
        {more && (
          <div className="tab-more" role="menu">
            {rest.map((i) => i.locked
              ? <span key={i.href} className="tab-locked" aria-disabled="true"><Icon name={i.icon} /><span>{i.label}</span><em className="lock-pill">{i.locked}</em></span>
              : <Link key={i.href} href={i.href} role="menuitem" aria-current={active(i.href) ? "page" : undefined} onClick={() => setMore(false)}><Icon name={i.icon} /><span>{i.label}</span></Link>)}
            {footer}
          </div>
        )}
        {main.map(tab)}
        <button type="button" className="tab-plus" aria-expanded={more} aria-current={rest.some((i) => active(i.href)) ? "page" : undefined} onClick={() => setMore(!more)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg><span>Plus</span>
        </button>
      </>
    );
  }
  return (
    <>
      {items.map((i) => (
        <span key={i.href} style={{ display: "contents" }}>
          {variant === "side" && i.sep && <div className="sep" />}
          {i.locked ? (
            <span className="nav-locked" aria-disabled="true" title={`Inclus dans la formule ${i.locked}`}>
              <Icon name={i.icon} /><span>{variant === "tab" ? i.label.split(" ")[0] : i.label}</span><em className="lock-pill">{i.locked}</em>
            </span>
          ) : (
            <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} prefetch>
              <Icon name={i.icon} />
              <span>{variant === "tab" ? i.label.split(" ")[0] : i.label}</span>
              {variant === "side" && !!i.badge && <span className="badge">{i.badge}</span>}
            </Link>
          )}
        </span>
      ))}
    </>
  );
}
