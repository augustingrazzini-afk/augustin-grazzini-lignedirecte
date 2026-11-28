"use client";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * Bouton d'un formulaire d'action : il réagit dès le clic (grisé, « … »), le serveur confirme en arrière-plan.
 * `row` : la ligne concernée s'estompe aussitôt (retrait d'un élément) et revient si l'action n'aboutit pas.
 */
export function Btn({ className = "btn", children, row, title }: { className?: string; children: React.ReactNode; row?: boolean; title?: string }) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!row) return;
    const el = ref.current?.closest<HTMLElement>(".item");
    if (el) { el.style.transition = "opacity .15s"; el.style.opacity = pending ? ".35" : ""; }
  }, [pending, row]);
  return <button ref={ref} type="submit" className={className} title={title} disabled={pending} aria-busy={pending || undefined}>{pending ? <span className="btn-wait">{children}<i aria-hidden="true"> …</i></span> : children}</button>;
}
