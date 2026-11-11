"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function TaskActions({ id, status, clientId }: { id: string; status: string; clientId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  async function act(action: "done" | "dismiss" | "reopen" | "snooze", days?: number) {
    setErr("");
    const r = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, days, clientId }) });
    if (!r.ok) return setErr("Échec, réessayez");
    start(() => router.refresh());
  }
  if (status !== "open") return <button className="btn sm" disabled={pending} onClick={() => act("reopen")}>Rouvrir</button>;
  return (
    <>
      {err && <span className="pill bad">{err}</span>}
      <button className="btn sm" disabled={pending} onClick={() => act("snooze", 1)} title="Reporter d'un jour">+1 j</button>
      <button className="btn sm" disabled={pending} onClick={() => act("snooze", 7)} title="Reporter d'une semaine">+1 sem.</button>
      <button className="btn sm" disabled={pending} onClick={() => act("dismiss")}>Ignorer</button>
      <button className="btn sm primary" disabled={pending} onClick={() => act("done")}>{pending ? "…" : "Fait"}</button>
    </>
  );
}
