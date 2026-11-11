"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Assistant } from "./Assistant";
import { Mascot } from "./Mascot";

type Tab = "chat" | "avis";
const EVENT = "trustpipe:widget";

/** Ouvre le widget depuis n'importe où (ex. lien « Donner mon avis » de la barre latérale). */
export function openWidget(tab: Tab) { window.dispatchEvent(new CustomEvent(EVENT, { detail: tab })); }

export function FeedbackLink() {
  return <button type="button" className="side-avis" onClick={() => openWidget("avis")}>💬 Donner mon avis</button>;
}

/** Bulle flottante en bas à droite, présente sur toutes les pages : assistant IA + case « Votre avis ». */
export function HelpWidget({ clientId, isClient, aiReady, chat = true, shareToken }: { clientId: string | null; isClient: boolean; aiReady: boolean; chat?: boolean; shareToken?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(chat ? "chat" : "avis");
  const [hint, setHint] = useState(false);
  const path = usePathname();
  const onCoach = path.endsWith("/coach");

  useEffect(() => {
    const on = (e: Event) => { setTab((e as CustomEvent<Tab>).detail); setOpen(true); };
    window.addEventListener(EVENT, on);
    let seen = false;
    try { seen = !!sessionStorage.getItem("pip-hint"); } catch { /* stockage indisponible */ }
    const t = seen ? undefined : setTimeout(() => { setHint(true); try { sessionStorage.setItem("pip-hint", "1"); } catch { /* */ } }, 2500);
    return () => { window.removeEventListener(EVENT, on); if (t) clearTimeout(t); };
  }, []);
  useEffect(() => { if (hint) { const t = setTimeout(() => setHint(false), 7000); return () => clearTimeout(t); } }, [hint]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <div className={`hw${open ? " open" : ""}`}>
      {open && (
        <div className="hw-panel" role="dialog" aria-label="Assistant et avis">
          <div className="hw-head">
            <Mascot size={34} talking />
            <div className="hw-tabs" role="tablist">
              {chat && <button role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>Assistant IA</button>}
              {!shareToken && <button role="tab" aria-selected={tab === "avis"} onClick={() => setTab("avis")}>Votre avis</button>}
            </div>
            <button className="hw-x" aria-label="Fermer" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="hw-body">
            {(tab === "chat" && chat) || shareToken ? (
              onCoach ? <p className="muted small hw-note">Vous êtes déjà sur la page de l&apos;assistant : posez votre question dans la fenêtre principale.</p>
                : <Assistant compact clientId={clientId} isClient={isClient} aiReady={aiReady} shareToken={shareToken} />
            ) : <FeedbackForm />}
          </div>
        </div>
      )}
      {hint && !open && <button className="hw-hint" onClick={() => { setOpen(true); setHint(false); }}>Une question ? Je lis vos appels pour vous 👋</button>}
      <button className="hw-fab" aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"} aria-expanded={open} onClick={() => { setOpen(!open); setHint(false); }}>
        <Mascot size={50} talking={open} />
      </button>
    </div>
  );
}

function FeedbackForm() {
  const [rating, setRating] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const faces = ["😞", "😕", "😐", "🙂", "😍"];
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("busy"); setErr(null);
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, rating, page: location.pathname }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Envoi impossible.");
      setState("done"); setMsg(""); setRating(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Envoi impossible."); setState("idle"); }
  }
  if (state === "done") return (
    <div className="hw-thanks"><Mascot size={64} talking /><h3>Merci beaucoup !</h3><p className="muted">Votre avis est bien arrivé. On lit tout et on s&apos;en sert pour améliorer Trustpipe.</p>
      <button className="btn" onClick={() => setState("idle")}>Envoyer un autre avis</button></div>
  );
  return (
    <form className="hw-avis" onSubmit={send}>
      <h3>Aidez-nous à améliorer Trustpipe</h3>
      <p className="muted small">Une idée, un bug, quelque chose qui manque ? Dites-nous tout.</p>
      <div className="hw-faces" role="radiogroup" aria-label="Votre note">
        {faces.map((f, i) => <button key={i} type="button" role="radio" aria-checked={rating === i + 1} aria-label={`${i + 1} sur 5`} onClick={() => setRating(rating === i + 1 ? null : i + 1)}>{f}</button>)}
      </div>
      <textarea className="input" rows={5} required minLength={3} maxLength={4000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex. : j'aimerais pouvoir exporter les stats en PDF pour mon client…" />
      {err && <div className="banner err">{err}</div>}
      <button className="btn primary" disabled={state === "busy" || msg.trim().length < 3}>{state === "busy" ? "Envoi…" : "Envoyer mon avis"}</button>
    </form>
  );
}
