"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { addIntegration, type FormState } from "@/app/actions";
import type { ProviderInfo } from "./IntegrationForm";
import { BrandLogo } from "../BrandLogo";

type Cat = "call" | "email" | "linkedin" | "other";

/** Présentation de chaque outil dans le catalogue : couleur, monogramme, accroche, où trouver la clé. */
const META: Record<string, { mono: string; color: string; tagline: string; cats: Cat[]; where?: string; url?: string }> = {
  minari: { mono: "Mi", color: "#5B4BFF", tagline: "Appels, résumés, objections et transcriptions", cats: ["call"], where: "Settings › API & webhook" },
  skipcall: { mono: "Sk", color: "#FF5A1F", tagline: "Appels de vos séquences, transcriptions, résumés et enregistrements", cats: ["call"], where: "Paramètres › Clés API", url: "https://web.withallo.com/settings/api" },
  aircall: { mono: "Ai", color: "#00A87A", tagline: "Appels, tags, enregistrements et transcriptions", cats: ["call"], where: "Intégrations & API › Clés API", url: "https://dashboard.aircall.io" },
  ringover: { mono: "Ri", color: "#2C6BED", tagline: "Appels, notes, tags et enregistrements", cats: ["call"], where: "Développeur › Créer une clé API (lecture des appels)", url: "https://dashboard.ringover.com" },
  hubspot: { mono: "Hs", color: "#FF5C35", tagline: "Appels journalisés dans le CRM", cats: ["call"], where: "Paramètres › Intégrations › Applications privées", url: "https://app.hubspot.com" },
  lemlist: { mono: "le", color: "#E8457A", tagline: "Emails, LinkedIn et appels de vos campagnes", cats: ["email", "linkedin", "call"], where: "Paramètres › Intégrations › API", url: "https://app.lemlist.com" },
  instantly: { mono: "In", color: "#2563EB", tagline: "Emails envoyés et réponses, par campagne", cats: ["email"], where: "Settings › Integrations › API keys", url: "https://app.instantly.ai" },
  smartlead: { mono: "Sl", color: "#7C3AED", tagline: "Envois, ouvertures et réponses par campagne", cats: ["email"], where: "Settings › API Key", url: "https://app.smartlead.ai" },
  custom: { mono: "API", color: "#334155", tagline: "Votre outil d'appel, avec sa clé API : les champs sont reconnus automatiquement", cats: ["call", "other"], where: "la documentation API de votre outil (rubrique « API » ou « Développeurs »)" },
  webhook: { mono: "⚡", color: "#0C3D2F", tagline: "Tous les autres outils d'appel via Zapier, Make ou n8n", cats: ["other", "call"] },
};
const CATS: [Cat | "all", string][] = [["all", "Tous"], ["call", "Téléphone"], ["other", "Autres outils"]];
const CH: Record<string, string> = { call: "Appels", email: "Email", linkedin: "LinkedIn" };

export function Connectors({ providers, clientId, connected }: { providers: ProviderInfo[]; clientId: string | null; connected: string[] }) {
  const [cat, setCat] = useState<Cat | "all">("all");
  const [open, setOpen] = useState<ProviderInfo | null>(null);
  const list = providers.filter((p) => cat === "all" || (META[p.id]?.cats || ["other"]).includes(cat));
  return (
    <div className="card">
      <div className="head"><div><h2>Connecteurs</h2><p className="sub">Connectez votre compte, vos stats arrivent toutes seules. Vos clés sont chiffrées et jamais affichées.</p></div></div>
      <div className="filters" style={{ marginBottom: 14 }}>
        {CATS.map(([k, lab]) => <button key={k} type="button" className="chip" aria-current={k === cat ? "true" : undefined} onClick={() => setCat(k)}>{lab}</button>)}
      </div>
      <div className="cx-grid">
        {list.map((p) => {
          const m = META[p.id], isOn = connected.includes(p.id);
          return (
            <div key={p.id} className="cx-tile">
              <BrandLogo id={p.id === "webhook" ? "zapier" : p.id} mono={m?.mono} color={m?.color} />
              <div className="cx-body">
                <div className="cx-name">{p.id === "webhook" ? "Zapier, Make, n8n" : p.label}{p.beta && <span className="pill mute">bêta</span>}</div>
                <div className="cx-tag">{m?.tagline || p.help}</div>
                <div className="cx-ch">{p.channels.map((c) => <span key={c}>{CH[c]}</span>)}</div>
              </div>
              {isOn ? <span className="pill win cx-btn">Connecté</span> : <button type="button" className="btn sm primary cx-btn" onClick={() => setOpen(p)}>Connecter</button>}
            </div>
          );
        })}
      </div>
      {open && <ConnectDialog p={open} clientId={clientId} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Outils connectables en un clic (OAuth, comme les connecteurs de Claude). */
const ONE_CLICK = new Set(["minari"]);

function ConnectDialog({ p, clientId, onClose }: { p: ProviderInfo; clientId: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(addIntegration, null);
  const m = META[p.id];
  const main = p.fields.filter((f) => !f.optional), extra = p.fields.filter((f) => f.optional);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="cx-dialog" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="cx-dhead">
        <BrandLogo id={p.id === "webhook" ? "zapier" : p.id} mono={m?.mono} color={m?.color} />
        <div><h2>Connecter {p.id === "webhook" ? "un autre outil" : p.label}</h2><p className="sub" style={{ margin: 0 }}>{m?.tagline}</p></div>
        <button type="button" className="cx-x" aria-label="Fermer" onClick={() => ref.current?.close()}>×</button>
      </div>
      {state?.ok ? (
        <div className="cx-done">
          <div className="cx-check">✓</div>
          <h3>{p.id === "webhook" ? "C'est prêt" : `${p.label} est connecté`}</h3>
          <p className="muted">{state.ok}</p>
          <p className="muted small">{p.id === "webhook" ? "Votre URL personnelle est affichée dans « Outils connectés » : collez-la dans Zapier, Make ou n8n." : "Pour un suivi en temps réel, vous pourrez aussi coller l'URL de webhook (dans « Outils connectés ») dans les réglages de l'outil."}</p>
          <button type="button" className="btn primary" onClick={() => ref.current?.close()}>Terminé</button>
        </div>
      ) : (
        <form action={action} className="cx-form">
          <input type="hidden" name="provider" value={p.id} />
          {clientId && <input type="hidden" name="clientId" value={clientId} />}
          {ONE_CLICK.has(p.id) && (
            <div className="cx-oneclick">
              <a className="btn primary cx-oauth" href={`/api/connect/${p.id}/start${clientId ? `?client=${clientId}` : ""}`}>
                <BrandLogo id={p.id} mono={m?.mono} color={m?.color} /> Se connecter avec {p.label}
              </a>
              <p className="muted small">Vous vous connectez à {p.label}, vous autorisez Trustpipe, c&apos;est tout. Aucune clé à copier.</p>
              <div className="cx-or"><span>ou avec une clé API</span></div>
            </div>
          )}
          {p.id === "webhook" ? (
            <ol className="cx-steps">
              <li>Cliquez sur « Créer mon URL » : vous obtenez une adresse personnelle et secrète.</li>
              <li>Dans Zapier, Make ou n8n, choisissez votre outil comme déclencheur (réponse reçue, invitation acceptée, appel…).</li>
              <li>Ajoutez l&apos;action « Webhook POST » vers votre URL : les événements arrivent en direct.</li>
            </ol>
          ) : p.id === "custom" ? (
            <ol className="cx-steps">
              <li>Dans votre outil d&apos;appel, ouvrez la rubrique <b>API</b> (ou « Développeurs ») et créez une clé en lecture.</li>
              <li>Repérez dans sa documentation l&apos;adresse qui <b>liste les appels</b> (souvent en <code>/calls</code>).</li>
              <li>Collez les deux ici : on vérifie la connexion et on reconnaît vos appels automatiquement.</li>
            </ol>
          ) : (
            <ol className="cx-steps">
              <li>Ouvrez {m?.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{p.label} ↗</a> : p.label}{m?.where && <> puis <b>{m.where}</b></>}.</li>
              <li>Créez ou copiez votre clé{main.length > 1 ? "s" : ""}.</li>
              <li>Collez-la ici : on vérifie qu&apos;elle fonctionne, et la première synchronisation démarre.</li>
            </ol>
          )}
          {main.map((f) => (
            <label key={f.key}>{f.label}
              <input className="input" name={`cred_${f.key}`} type={f.type === "password" ? "password" : "text"} autoComplete="off" required autoFocus={f === main[0]} placeholder="Collez ici" />
              {f.help && <span className="small" style={{ color: "var(--dim)" }}>{f.help}</span>}
            </label>
          ))}
          {(extra.length > 0 || p.id !== "webhook") && (
            <details className="cx-adv"><summary>Options avancées</summary>
              {extra.map((f) => (
                <label key={f.key}>{f.label} (facultatif)
                  <input className="input" name={`cred_${f.key}`} type="text" autoComplete="off" />
                  {f.help && <span className="small" style={{ color: "var(--dim)" }}>{f.help}</span>}
                </label>
              ))}
              <label>Nom affiché (facultatif)<input className="input" name="label" placeholder={`${p.label} — compte principal`} /></label>
            </details>
          )}
          {state?.error && <div className="banner err">{state.error}</div>}
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Annuler</button>
            <button className="btn primary" disabled={pending}>{pending ? "Vérification…" : p.id === "webhook" ? "Créer mon URL" : `Connecter ${p.label}`}</button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>🔒 Clé chiffrée (AES-256), jamais affichée, utilisée uniquement pour lire vos données. Hébergé en France, conforme RGPD.</p>
        </form>
      )}
    </dialog>
  );
}
