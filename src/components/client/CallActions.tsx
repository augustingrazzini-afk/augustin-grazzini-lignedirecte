"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CallActions({ id, canDelete, canAnalyze, back, clientId, meeting = false }: { id: string; canDelete: boolean; canAnalyze: boolean; back: string; clientId: string | null; meeting?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const q = clientId ? `?client=${encodeURIComponent(clientId)}` : "";
  async function run(method: "POST" | "DELETE") {
    setBusy(method); setErr("");
    const r = await fetch(`/api/calls/${id}${q}`, { method });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setErr(j.error || "Action impossible");
    if (method === "DELETE") router.push(back); else router.refresh();
  }
  return (
    <>
      {canAnalyze && <button className="btn" disabled={!!busy} onClick={() => run("POST")}>{busy === "POST" ? (meeting ? "Débrief en cours…" : "Analyse…") : meeting ? "Refaire le débrief IA" : "Analyser avec l'IA"}</button>}
      {canDelete && (confirm
        ? <button className="btn danger" disabled={!!busy} onClick={() => run("DELETE")}>Confirmer la suppression</button>
        : <button className="btn" onClick={() => setConfirm(true)}>Supprimer</button>)}
      {err && <span className="pill bad">{err}</span>}
    </>
  );
}

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* le navigateur refuse : rien à faire */ }
    }}>{done ? "Copié" : label}</button>
  );
}
