"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function FollowUpToggle({ contactKey, done, clientId }: { contactKey: string; done: boolean; clientId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  return (
    <button className={`btn sm ${done ? "" : "primary"}`} disabled={pending} onClick={async () => {
      setErr(false);
      const r = await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactKey, done: !done, clientId }) });
      if (!r.ok) return setErr(true);
      start(() => router.refresh());
    }}>{err ? "Réessayer" : pending ? "…" : done ? "Rouvrir" : "Fait"}</button>
  );
}
