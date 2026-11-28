"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useEffect, useState } from "react";
import { navStart } from "./client/NavStage";
import { Icon } from "./icons";

export type NavItem = { href: string; label: string; icon: string; badge?: number; /** Titre du groupe ouvert par cette entrée (menu latéral). */ group?: string; /** Nom de la formule qui ouvre cette page, si elle n'est pas incluse. */ locked?: string };

/** Les 4 écrans du quotidien, toujours visibles en bas sur téléphone ; le reste est rangé dans « Plus ». */
const MAIN = ["pilotage", "appels", "relances", "coach"];

export function NavLinks({ items, variant, footer }: { items: NavItem[]; variant: "side" | "tab"; footer?: React.ReactNode }) {
  const real = usePathname(), router = useRouter();
  const [more, setMore] = useState(false);
  // Page demandée au clic : l'entrée du menu s'allume tout de suite, sans attendre l'arrivée de la page.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setMore(false); setPending(null); }, [real]);
  const path = pending ?? real;
  const warm = (href: string) => router.prefetch(href, { kind: PrefetchKind.FULL });
  const go = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || href === real) return;
    setPending(href); navStart(href);
  };
  // Après le rafraîchissement automatique (toutes les 60 s), les pages préchargées sont perdues : on recharge
  // en avance les écrans du quotidien, pour que le clic suivant reste immédiat.
  useEffect(() => {
    if (variant !== "side") return;
    const again = () => items.filter((i) => !i.locked && MAIN.includes(i.icon) && i.href !== real).forEach((i) => warm(i.href));
    window.addEventListener("tp:refreshed", again);
    return () => window.removeEventListener("tp:refreshed", again);
  }, [items, real, variant]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined} prefetch onClick={go(i.href)} onTouchStart={() => warm(i.href)}>
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
              : <Link key={i.href} href={i.href} role="menuitem" aria-current={active(i.href) ? "page" : undefined} onTouchStart={() => warm(i.href)} onClick={(e) => { go(i.href)(e); setMore(false); }}><Icon name={i.icon} /><span>{i.label}</span></Link>)}
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
          {variant === "side" && i.group && <div className="nav-grp">{i.group}</div>}
          {i.locked ? (
            <span className="nav-locked" aria-disabled="true" title={`Inclus dans la formule ${i.locked}`}>
              <Icon name={i.icon} /><span>{variant === "tab" ? i.label.split(" ")[0] : i.label}</span><em className="lock-pill">{i.locked}</em>
            </span>
          ) : (
            <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} prefetch onClick={go(i.href)} onPointerEnter={() => warm(i.href)} onTouchStart={() => warm(i.href)}>
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
