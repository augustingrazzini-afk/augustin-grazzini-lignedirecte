"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";

/** Formulaire branché sur une Server Action, avec message de succès / d'erreur. */
export function ActionForm({ action, children, submit, className = "form", hidden }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  submit: string;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div className="full row">
        <button className="btn primary" disabled={pending}>{pending ? "…" : submit}</button>
        {state?.error && <span className="pill bad">{state.error}</span>}
        {state?.ok && <span className="pill win">{state.ok}</span>}
      </div>
    </form>
  );
}
