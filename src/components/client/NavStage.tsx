"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Navigation perçue comme instantanée depuis le menu.
 * - `navStart(href)` : appelé au clic sur un lien du menu.
 * - Si la page n'est pas arrivée au bout de 90 ms (elle n'était pas préchargée), on affiche sa structure :
 *   des blocs aux dimensions exactes de sa dernière visite (mémorisées dans le navigateur), donc sans saut à l'arrivée.
 * - Quand la page arrive, elle remplace la structure avec un fondu court.
 */
const EVT = "tp:nav";
export const navStart = (href: string) => window.dispatchEvent(new CustomEvent(EVT, { detail: href }));

type Block = { h: number; mt: number; cls?: string; kids?: number[] };
const key = (path: string) => `tp-sk:${path}:${window.innerWidth < 760 ? "m" : "d"}`;
const load = (path: string): Block[] | null => { try { return JSON.parse(sessionStorage.getItem(key(path)) || "null"); } catch { return null; } };

export function NavStage({ children }: { children: React.ReactNode }) {
  const path = usePathname(), search = useSearchParams().toString();
  const [target, setTarget] = useState<string | null>(null); // page demandée, pas encore arrivée
  const [show, setShow] = useState(false); // structure affichée (après 90 ms d'attente)
  const [fade, setFade] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      if (href === window.location.pathname) return;
      setTarget(href); clearTimeout(t);
      t = setTimeout(() => setShow(true), 90);
      // Filet de sécurité : si la navigation n'aboutit pas, on rend la main à la page en place.
      setTimeout(() => { setTarget((cur) => (cur === href ? null : cur)); setShow(false); }, 12_000);
    };
    window.addEventListener(EVT, on);
    return () => { window.removeEventListener(EVT, on); clearTimeout(t); };
  }, []);

  // La page demandée est arrivée : on retire la structure, avec un fondu si elle a été montrée.
  useLayoutEffect(() => {
    setFade(show);
    setTarget(null); setShow(false);
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mémorise la forme de la page affichée (hauteur de chaque bloc), pour la redessiner à l'identique la prochaine fois.
  useEffect(() => {
    if (search) return; // la forme de référence est celle de la page sans filtre
    const t = setTimeout(() => {
      const el = box.current; if (!el || el.hidden) return;
      const blocks: Block[] = [...el.children].slice(0, 16).map((c) => {
        const e = c as HTMLElement, grid = e.classList.contains("grid");
        return { h: e.offsetHeight, mt: parseFloat(getComputedStyle(e).marginTop) || 0, ...(grid ? { cls: e.className, kids: [...e.children].slice(0, 8).map((k) => (k as HTMLElement).offsetHeight) } : {}) };
      });
      try { sessionStorage.setItem(key(path), JSON.stringify(blocks)); } catch { /* stockage indisponible : structure par défaut */ }
    }, 700);
    return () => clearTimeout(t);
  }, [path, search, children]);

  const waiting = show && target;
  return (
    <>
      {waiting && <Skeleton blocks={load(target)} />}
      <div ref={box} hidden={!!waiting} className={fade ? "nav-fade" : undefined} style={{ display: waiting ? "none" : "contents" }}>{children}</div>
    </>
  );
}

function Skeleton({ blocks }: { blocks: Block[] | null }) {
  if (!blocks?.length) return (
    <div className="nav-skel" aria-busy="true" aria-label="Chargement">
      <div className="skel-h" /><div className="skel-s" />
      <div className="grid g-kpi" style={{ marginTop: 20 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="card skel-c" />)}</div>
      <div className="card skel-b" style={{ marginTop: 16 }} />
    </div>
  );
  return (
    <div className="nav-skel" aria-busy="true" aria-label="Chargement">
      {blocks.map((b, i) => i === 0
        ? <div key={i} style={{ height: b.h, marginTop: b.mt }}><div className="skel-h" /><div className="skel-s" /></div>
        : b.kids ? <div key={i} className={b.cls} style={{ marginTop: b.mt, minHeight: b.h }}>{b.kids.map((h, k) => <div key={k} className="card skel-x" style={{ height: h }} />)}</div>
        : <div key={i} className="card skel-x" style={{ height: b.h, marginTop: b.mt }} />)}
    </div>
  );
}
