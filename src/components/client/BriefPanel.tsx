"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Brief } from "@/lib/ai";

export type BriefHistory = { id: string; prospect: string; company: string; createdAt: string; content: Brief };

export function BriefDoc({ b, n }: { b: Brief; n?: number }) {
  const heat = Math.max(0, Math.min(100, b.chaleur || 0)), lab = heat >= 66 ? "Chaud" : heat >= 33 ? "Tiède" : "Froid";
  const ul = (a: string[]) => (a?.length ? <ul>{a.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">Rien d&apos;identifié.</p>);
  const text = `BRIEF PRÉ-MEETING — ${b.prospect}\n${[b.poste, b.entreprise].filter(Boolean).join(" · ")}\nChaleur : ${heat}/100\n\nEN BREF\n${b.resume}\n\nCONTEXTE\n${b.contexte.map((x) => "• " + x).join("\n")}\n\nBESOINS\n${b.besoins.map((x) => "• " + x).join("\n")}\n\nANGLE D'ATTAQUE\n${b.angle}\n\nOBJECTIONS PROBABLES\n${b.objections.map((o) => `• ${o.objection}\n  → ${o.reponse}`).join("\n")}\n\nQUESTIONS À POSER\n${b.questions.map((x) => "• " + x).join("\n")}\n\nÀ ÉVITER\n${b.eviter.map((x) => "• " + x).join("\n")}\n\nOBJECTIF\n${b.prochaine_etape}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="head" style={{ paddingBottom: 16, borderBottom: "1px solid var(--stroke)" }}>
        <div><h2 style={{ fontSize: 28 }}>{b.prospect || "Prospect"}</h2><p className="muted" style={{ margin: "2px 0 0" }}>{[b.poste, b.entreprise].filter(Boolean).join(" · ")}</p></div>
        <div className="temp"><div className="meter"><i style={{ left: `calc(${heat}% - 3px)` }} /></div><b style={{ fontFamily: "var(--f-mono)", fontSize: 13 }}>{lab} · {heat}/100</b></div>
      </div>
      <div className="sec"><h4>En bref</h4><p>{b.resume}</p></div>
      <div className="grid g-2e"><div className="sec"><h4>Contexte</h4>{ul(b.contexte)}</div><div className="sec"><h4>Besoins et douleurs</h4>{ul(b.besoins)}</div></div>
      <div className="sec angle"><h4>Angle d&apos;attaque</h4><p>{b.angle}</p></div>
      <div className="sec"><h4>Objections probables</h4><div className="qa">{b.objections.map((o, i) => <div key={i}><b>{o.objection}</b><span>{o.reponse}</span></div>)}</div></div>
      <div className="grid g-2e"><div className="sec"><h4>Questions à poser</h4>{ul(b.questions)}</div><div className="sec"><h4>À éviter</h4>{ul(b.eviter)}</div></div>
      <div className="sec"><h4>Objectif du rendez-vous</h4><p>{b.prochaine_etape}</p></div>
      <div className="row">{n != null && <span className="muted small">Basé sur {n} échange(s)</span>}<span className="spacer" />
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }}>{copied ? "Copié" : "Copier le brief"}</button></div>
    </div>
  );
}

export function BriefPanel({ clientId, history, initialQuery, aiReady }: { clientId: string | null; history: BriefHistory[]; initialQuery: string; aiReady: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [state, setState] = useState<{ status: "idle" | "run" | "done" | "error"; brief?: Brief; n?: number; err?: string }>({ status: "idle" });
  const ran = useRef(false);
  async function run(query: string) {
    if (query.trim().length < 3) return setState({ status: "error", err: "Tapez au moins 3 caractères." });
    setState({ status: "run" });
    const r = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, clientId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setState({ status: "error", err: j.error || "La génération a échoué." });
    setState({ status: "done", brief: j.brief, n: j.calls });
    router.refresh();
  }
  useEffect(() => { if (initialQuery && !ran.current && aiReady) { ran.current = true; run(initialQuery); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid g-2">
      <div className="stack">
        <div className="card"><h2>Nouveau brief</h2><p className="sub">Nom du prospect ou de l&apos;entreprise. L&apos;IA relit tous ses appels.</p>
          {!aiReady && <div className="banner">L&apos;IA n&apos;est pas encore activée sur ce serveur.</div>}
          <form className="row" onSubmit={(e) => { e.preventDefault(); run(q); }}>
            <input className="input" style={{ flex: "1 1 240px", fontSize: 15, padding: "13px 16px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. Jean Dupont ou Acme" aria-label="Prospect ou entreprise" />
            <button className="btn primary" disabled={state.status === "run" || !aiReady}>{state.status === "run" ? "Rédaction…" : "Générer le brief"}</button>
          </form>
          {state.status === "run" && <div className="steps"><div className="step ok"><i />Recherche des appels</div><div className="step on"><i />Rédaction du brief par l&apos;IA (30 s à 1 min)</div></div>}
          {state.status === "error" && <div className="banner err" style={{ margin: "16px 0 0" }}>{state.err}</div>}
        </div>
        {state.status === "done" && state.brief && <div className="card"><BriefDoc b={state.brief} n={state.n} /></div>}
      </div>
      <div className="card"><h2>Historique</h2><p className="sub">Derniers briefs préparés</p>
        {history.length ? <div className="list">{history.map((h) => (
          <button key={h.id} className="item" style={{ border: 0, background: "none", cursor: "pointer", textAlign: "left", width: "100%" }} onClick={() => { setState({ status: "done", brief: h.content }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <span className="av">{(h.prospect || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span className="who">{h.prospect} <span>· {h.company}</span></span>
            <span className="meta">{new Date(h.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
          </button>
        ))}</div> : <div className="empty">Vos briefs apparaîtront ici, partagés avec votre équipe.</div>}
      </div>
    </div>
  );
}
