"use client";
import { useState } from "react";
import type { CoachResult } from "@/lib/ai";

export function CoachPanel({ clientId, days, last, aiReady }: { clientId: string | null; days: number; last: { at: string; days: number; r: CoachResult } | null; aiReady: boolean }) {
  const [data, setData] = useState(last);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr("");
    const r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days, clientId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error || "L'analyse a échoué.");
    setData({ at: new Date().toISOString(), days, r: j });
  }
  const R = data?.r;
  return (
    <>
      <div className="card"><div className="head"><div><h2>Diagnostic de prospection</h2><p className="sub" style={{ margin: "4px 0 0" }}>L&apos;IA lit vos statistiques et vos conversations des {days} derniers jours.</p></div>
        <button className="btn primary" onClick={run} disabled={busy || !aiReady}>{busy ? "Analyse en cours…" : data ? "Relancer l'analyse" : "Lancer l'analyse"}</button></div>
        {err && <div className="banner err" style={{ margin: "14px 0 0" }}>{err}</div>}
        {data && <p className="muted small" style={{ margin: "10px 0 0" }}>Dernière analyse le {new Date(data.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {data.days} jours</p>}
      </div>
      {busy && <div className="card mt"><div className="stack" style={{ gap: 12 }}>{[90, 75, 60, 80].map((w) => <div key={w} className="skel" style={{ width: `${w}%` }} />)}</div></div>}
      {!busy && !R && <div className="card mt"><div className="empty"><b>Prêt à analyser</b>Diagnostic, 3 priorités, accroche et réponses aux objections, tirés de vos propres appels.</div></div>}
      {!busy && R && (
        <div className="grid g-2 mt">
          <div className="stack">
            <div className="card"><h2>Diagnostic</h2><p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65 }}>{R.diagnostic}</p></div>
            <div className="card"><h2>3 priorités</h2><div style={{ marginTop: 8 }}>{R.priorites.map((p, i) => <div key={i} className="prio"><span className="n">{i + 1}</span><div><b>{p.titre}</b><span className="muted">{p.detail}</span>{p.impact && <div style={{ marginTop: 8 }}><span className="pill win">{p.impact}</span></div>}</div></div>)}</div></div>
          </div>
          <div className="stack">
            <div className="sec angle"><h4>Accroche recommandée</h4><p>{R.accroche}</p></div>
            <div className="card"><h2>Réponses aux objections</h2><div className="qa" style={{ marginTop: 14 }}>{R.objections.map((o, i) => <div key={i}><b>{o.objection}</b><span>{o.reponse}</span></div>)}</div></div>
            <div className="card"><h2>Ciblage</h2><p style={{ margin: "10px 0 0" }}>{R.ciblage}</p></div>
          </div>
        </div>
      )}
    </>
  );
}
