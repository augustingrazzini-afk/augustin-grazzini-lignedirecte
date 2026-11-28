"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useEffect, useRef, useTransition } from "react";

/**
 * Lien de filtre (période, commercial, type d'appel) : la page visée est préchargée dès que la souris ou le doigt
 * approche (ou d'office avec `eager`), et la sélection change à l'écran au clic, sans attendre le serveur.
 */
export function FastLink({ href, className, current, eager, children }: { href: string; className?: string; current?: boolean; eager?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [, start] = useTransition();
  const ref = useRef<HTMLAnchorElement>(null);
  const done = useRef("");
  const warm = () => { if (done.current !== href) { done.current = href; router.prefetch(href, { kind: PrefetchKind.FULL }); } };
  useEffect(() => { if (eager && !current) { const t = setTimeout(warm, 400); return () => clearTimeout(t); } }, [href, eager, current]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Link ref={ref} href={href} className={className} scroll={false} prefetch={false} aria-current={current ? "true" : undefined}
      onPointerEnter={warm} onTouchStart={warm} onFocus={warm}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        // Sélection affichée tout de suite ; React remet l'état exact à l'arrivée des données.
        ref.current?.parentElement?.querySelectorAll('[aria-current="true"]').forEach((el) => el.removeAttribute("aria-current"));
        if (!current) ref.current?.setAttribute("aria-current", "true");
        start(() => router.push(href, { scroll: false }));
      }}>{children}</Link>
  );
}
