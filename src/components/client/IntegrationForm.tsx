"use client";
import { useActionState, useState } from "react";
import { addIntegration, type FormState } from "@/app/actions";

export type ProviderInfo = { id: string; label: string; beta?: boolean; help: string; channels: string[]; fields: { key: string; label: string; type?: string; help?: string; optional?: boolean }[] };
const COLORS: Record<string, string> = { minari: "linear-gradient(135deg,#6E5BFF,#2E5BFF)", aircall: "linear-gradient(135deg,#00B388,#00875F)", ringover: "linear-gradient(135deg,#2C6BED,#1A4FC2)", hubspot: "linear-gradient(135deg,#FF7A45,#FF5C35)", lemlist: "linear-gradient(135deg,#FF7A59,#F04E8C)" };
export const providerColor = (id: string) => COLORS[id] || "linear-gradient(135deg,#59628A,#2A3157)";

export function IntegrationForm({ providers, clientId }: { providers: ProviderInfo[]; clientId: string | null }) {
  const [pid, setPid] = useState(providers[0]?.id);
  const [state, action, pending] = useActionState<FormState, FormData>(addIntegration, null);
  const p = providers.find((x) => x.id === pid)!;
  return (
    <div className="card">
      <h2>Connecter un outil</h2><p className="sub">Vos identifiants sont chiffrés et ne sont jamais affichés. Les appels arrivent automatiquement, puis une fois par jour.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        {providers.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={x.id === pid} onClick={() => setPid(x.id)}>{x.label}{x.beta ? " (bêta)" : ""}</button>
        ))}
      </div>
      <form action={action} className="form" key={pid}>
        <input type="hidden" name="provider" value={pid} />
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <p className="full muted small" style={{ margin: 0 }}>{p.help}</p>
        {p.fields.map((f) => (
          <label key={f.key} className={p.fields.length === 1 ? "full" : undefined}>{f.label}{f.optional ? " (facultatif)" : ""}
            <input className="input" name={`cred_${f.key}`} type={f.type === "password" ? "password" : "text"} autoComplete="off" required={!f.optional} />
            {f.help && <span className="small" style={{ color: "var(--dim)" }}>{f.help}</span>}
          </label>
        ))}
        <label className="full">Nom affiché (facultatif)<input className="input" name="label" placeholder={`${p.label} — équipe Paris`} /></label>
        <div className="full row">
          <button className="btn primary" disabled={pending}>{pending ? "Vérification…" : `Connecter ${p.label}`}</button>
          {state?.error && <span className="pill bad">{state.error}</span>}
          {state?.ok && <span className="pill win">{state.ok}</span>}
        </div>
      </form>
    </div>
  );
}
