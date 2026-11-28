"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const LABEL: Record<string, string> = { done: "Fait ✓", dismiss: "Ignorée", reopen: "Rouverte", snooze: "Reportée" };

/**
 * Actions sur une relance. Affichage immédiat : la ligne s'efface au clic, le serveur confirme en arrière-plan,
 * et tout revient en place avec un message si l'enregistrement échoue.
 */
export function TaskActions({ id, status, clientId }: { id: string; status: string; clientId: string | null }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const row = () => ref.current?.closest<HTMLElement>(".item");
  const fade = (on: boolean) => { const r = row(); if (r) { r.style.transition = "opacity .15s"; r.style.opacity = on ? ".35" : ""; r.style.pointerEvents = on ? "none" : ""; } };
  // Le serveur a confirmé (la liste est à jour) : on rend la main à l'affichage normal.
  useEffect(() => { setSent(null); fade(false); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(action: "done" | "dismiss" | "reopen" | "snooze", days?: number) {
    setErr(""); setSent(action); fade(true); // retour visuel tout de suite
    const r = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, days, clientId }) }).catch(() => null);
    if (!r?.ok) {
      fade(false); setSent(null); // retour à l'état précédent
      const msg = r?.status === 403 ? ((await r.json().catch(() => null))?.error?.startsWith("Démo") ? "Démo en lecture seule" : "Accès refusé") : "Échec, réessayez";
      return setErr(msg);
    }
    start(() => router.refresh());
  }
  if (sent) return <span ref={ref} className="pill win">{LABEL[sent]}</span>;
  if (status !== "open") return <span ref={ref}><button className="btn sm" onClick={() => act("reopen")}>Rouvrir</button></span>;
  return (
    <span ref={ref} style={{ display: "contents" }}>
      {err && <span className="pill bad">{err}</span>}
      <button className="btn sm" onClick={() => act("snooze", 1)} title="Reporter d'un jour">+1 j</button>
      <button className="btn sm" onClick={() => act("snooze", 7)} title="Reporter d'une semaine">+1 sem.</button>
      <button className="btn sm" onClick={() => act("dismiss")}>Ignorer</button>
      <button className="btn sm primary" onClick={() => act("done")}>Fait</button>
    </span>
  );
}
