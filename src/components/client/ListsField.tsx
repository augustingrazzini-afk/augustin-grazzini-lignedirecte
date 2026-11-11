"use client";
import { useState } from "react";

/** Plusieurs listes d'appels pour un même client, avec les listes déjà vues dans vos outils en suggestion. */
export function ListsField({ known }: { known: { name: string; calls: number; taken: boolean }[] }) {
  const [rows, setRows] = useState<string[]>([""]);
  const chosen = new Set(rows.map((r) => r.trim().toLowerCase()).filter(Boolean));
  const free = known.filter((k) => !k.taken && !chosen.has(k.name.toLowerCase()));
  const set = (i: number, v: string) => setRows((r) => r.map((x, j) => (j === i ? v : x)));
  const add = (v = "") => setRows((r) => (r.length === 1 && !r[0] && v ? [v] : [...r, v]));
  return (
    <div className="full lists-field">
      <span className="lf-label">Listes d&apos;appels de ce client <span className="muted small">(une ou plusieurs)</span></span>
      {rows.map((v, i) => (
        <div key={i} className="lf-row">
          <input className="input" name="list" value={v} onChange={(e) => set(i, e.target.value)} list="known-lists" placeholder="Nom exact de la liste dans Minari, Aircall…" autoComplete="off" />
          {rows.length > 1 && <button type="button" className="lf-x" aria-label="Retirer cette liste" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      <button type="button" className="lf-add" onClick={() => add()}>+ Ajouter une autre liste</button>
      {free.length > 0 && (
        <div className="lf-sugg">
          <span className="muted small">Listes trouvées dans vos appels, cliquez pour ajouter :</span>
          <div className="lf-chips">{free.slice(0, 12).map((k) => <button key={k.name} type="button" className="chip" onClick={() => add(k.name)}>+ {k.name} <em className="lf-count">{k.calls} appels</em></button>)}</div>
        </div>
      )}
      <datalist id="known-lists">{known.map((k) => <option key={k.name} value={k.name} />)}</datalist>
    </div>
  );
}
