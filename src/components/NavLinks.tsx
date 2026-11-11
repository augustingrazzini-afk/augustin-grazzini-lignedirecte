"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

export type NavItem = { href: string; label: string; icon: string; badge?: number; sep?: boolean };

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "side" | "tab" }) {
  const path = usePathname();
  const active = (href: string) => {
    const matches = items.filter((i) => path === i.href || path.startsWith(i.href + "/"));
    const best = matches.sort((a, b) => b.href.length - a.href.length)[0];
    return best?.href === href;
  };
  return (
    <>
      {items.map((i) => (
        <span key={i.href} style={{ display: "contents" }}>
          {variant === "side" && i.sep && <div className="sep" />}
          <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} prefetch>
            <Icon name={i.icon} />
            <span>{variant === "tab" ? i.label.split(" ")[0] : i.label}</span>
            {variant === "side" && !!i.badge && <span className="badge">{i.badge}</span>}
          </Link>
        </span>
      ))}
    </>
  );
}
