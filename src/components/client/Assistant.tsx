"use client";
import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string; local?: boolean };

const STEP_LABEL: Record<string, string> = {
  stats: "les statistiques", search_calls: "les appels", get_call: "un appel en détail", search_messages: "les emails et LinkedIn",
  prospect_history: "l'historique du prospect", list_followups: "les relances",
};

/** Mise en forme légère et sûre (aucun HTML injecté) : **gras**, listes, paragraphes. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [], ordered = false;
  const flush = () => { if (list.length) { const L = ordered ? "ol" : "ul"; blocks.push(<L key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</L>); list = []; } };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const b = line.match(/^\s*[-•*]\s+(.*)$/), n = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (b || n) { if (list.length && ordered !== !!n) flush(); ordered = !!n; list.push((b || n)![1]); continue; }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? <p key={blocks.length} className="as-h">{inline(h[1])}</p> : <p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function Assistant({ clientId, isClient, aiReady, compact = false, shareToken }: { clientId: string | null; isClient: boolean; aiReady: boolean; compact?: boolean; shareToken?: string }) {
  const storeKey = `trustpipe-assistant-${clientId || "org"}`;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; title: string; updatedAt: string }[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem(storeKey); if (s) { const v = JSON.parse(s); if (Array.isArray(v)) setTurns(v); else { setTurns(v.turns || []); setConvId(v.id || null); } } } catch { /* stockage indisponible */ } }, [storeKey]);
  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify({ id: convId, turns: turns.slice(-40) })); } catch { /* stockage indisponible */ } end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy, storeKey, convId]);

  const qs = () => { const p = new URLSearchParams(); if (clientId) p.set("clientId", clientId); if (shareToken) p.set("shareToken", shareToken); return p; };
  async function openHistory() {
    if (history) { setHistory(null); return; }
    const r = await fetch(`/api/assistant/conversations?${qs()}`).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => ({})) : {};
    setHistory(j.conversations || []);
  }
  async function load(id: string) {
    const p = qs(); p.set("id", id);
    const r = await fetch(`/api/assistant/conversations?${p}`).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (!j) { setErr("Conversation introuvable."); return; }
    setTurns(Array.isArray(j.messages) ? j.messages : []); setConvId(j.id); setHistory(null); setSteps([]); setErr(null);
  }
  async function remove(id: string) {
    const p = qs(); p.set("id", id);
    await fetch(`/api/assistant/conversations?${p}`, { method: "DELETE" }).catch(() => null);
    setHistory((h) => (h || []).filter((x) => x.id !== id));
    if (id === convId) { setConvId(null); setTurns([]); }
  }
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const all = isClient
    ? ["Prépare mon rendez-vous avec …", "Quels prospects sont les plus chauds ce mois-ci ?", "Quelles objections reviennent le plus ?", "Résume la semaine de prospection"]
    : ["Prépare mon rendez-vous avec …", "Fais-moi un diagnostic de la semaine", "Quelles objections reviennent le plus ce mois-ci et comment y répondre ?", "Quel est mon meilleur créneau d'appel ?", "Quelles relances dois-je faire aujourd'hui ?"];
  const suggestions = compact ? all.slice(0, 3) : all;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    if (q.endsWith("…")) { setInput(q.replace(/…$/, "")); box.current?.focus(); return; }
    const next = [...turns, { role: "user" as const, content: q }].slice(-40);
    setTurns(next); setInput(""); setBusy(true); setErr(null); setSteps([]);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, conversationId: convId, messages: next.map(({ role, content }) => ({ role, content })), ...(shareToken ? { shareToken } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "L'assistant n'a pas pu répondre.");
      setSteps(j.steps || []);
      if (j.conversationId) setConvId(j.conversationId);
      setTurns([...next, { role: "assistant", content: j.text, local: j.mode === "local" }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "L'assistant n'a pas pu répondre.");
      setTurns(turns); setInput(q);
    } finally { setBusy(false); }
  }

  if (!aiReady) return <div className={compact ? "as-compact as-off" : "card"}><div className="empty"><b>L&apos;assistant IA n&apos;est pas encore activé</b>Il sera disponible dès que la clé de l&apos;API Claude sera configurée sur le serveur.</div></div>;

  return (
    <div className={compact ? "as-wrap as-compact" : "card as-wrap"}>
      <div className="as-bar">
        <button type="button" className="as-link" onClick={openHistory} aria-expanded={!!history}>{history ? "Fermer l'historique" : "Historique"}</button>
        {turns.length > 0 && <button type="button" className="as-link" onClick={() => { setTurns([]); setSteps([]); setErr(null); setConvId(null); setHistory(null); }}>+ Nouvelle conversation</button>}
      </div>
      {history && (
        <div className="as-history">
          {!history.length ? <p className="muted small">Aucune conversation enregistrée pour l&apos;instant.</p> : history.map((h) => (
            <div key={h.id} className={`as-hrow${h.id === convId ? " on" : ""}`}>
              <button type="button" onClick={() => load(h.id)}><b>{h.title}</b><span className="muted small">{fmt(h.updatedAt)}</span></button>
              <button type="button" className="as-del" aria-label="Supprimer cette conversation" onClick={() => remove(h.id)}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="as-log" hidden={!!history}>
        {!turns.length && (
          <div className="as-hello">
            {!compact && <div className="as-avatar">✦</div>}
            <h2>{compact ? "Bonjour, je suis Pip 👋" : "Posez votre question"}</h2>
            <p className="muted">{isClient ? "L'assistant lit les appels menés pour vous, et vous aide à préparer vos rendez-vous." : "L'assistant lit vos appels, transcriptions et relances pour vous répondre."}</p>
            <div className="as-sugg">{suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`as-msg ${t.role}`}>
            {t.role === "assistant" && <div className="as-avatar">✦</div>}
            <div className="as-bubble">{t.role === "assistant" ? <Rich text={t.content} /> : t.content}{t.local && <p className="as-mode">Mode essentiel : réponse tirée de vos données, sans IA.</p>}</div>
          </div>
        ))}
        {busy && <div className="as-msg assistant"><div className="as-avatar">✦</div><div className="as-bubble as-typing"><i /><i /><i /><span className="muted small">Je consulte vos données…</span></div></div>}
        {!busy && steps.length > 0 && <p className="muted small as-steps">Consulté : {[...new Set(steps)].map((s) => STEP_LABEL[s] || s).join(", ")}</p>}
        <div ref={end} />
      </div>
      {err && <div className="banner err" style={{ margin: "0 0 10px" }}>{err}</div>}
      <form className="as-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea ref={box} rows={1} value={input} maxLength={4000} placeholder={isClient ? "Ex. : prépare mon rendez-vous de jeudi avec Talentis RH" : "Ex. : qu'a dit Yanis Boyer sur son budget ?"} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="btn primary" disabled={busy || !input.trim()}>Envoyer</button>
      </form>
    </div>
  );
}
