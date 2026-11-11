"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const tomorrow = () => { const d = new Date(Date.now() + 864e5); return d.toISOString().slice(0, 10); };

export function NewTask({ contactKey, clientId }: { contactKey: string; clientId: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true); setMsg({});
      const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactKey, clientId, channel: f.get("channel"), reason: f.get("reason"), dueAt: new Date(`${f.get("date")}T09:00:00`).toISOString() }) });
      const j = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) return setMsg({ err: j.error || "Impossible de créer la relance" });
      (e.target as HTMLFormElement).reset(); setMsg({ ok: "Relance ajoutée" }); router.refresh();
    }}>
      <label>Date<input className="input" type="date" name="date" defaultValue={tomorrow()} required /></label>
      <label>Canal<select className="select" name="channel"><option value="call">Appel</option></select></label>
      <label className="full">Motif<input className="input" name="reason" required placeholder="Rappeler après son comité de direction" /></label>
      <div className="full row"><button className="btn" disabled={busy}>{busy ? "…" : "Ajouter une relance"}</button>{msg.err && <span className="pill bad">{msg.err}</span>}{msg.ok && <span className="pill win">{msg.ok}</span>}</div>
    </form>
  );
}
