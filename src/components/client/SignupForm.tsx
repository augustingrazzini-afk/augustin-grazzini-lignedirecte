"use client";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { signup, type FormState } from "@/app/actions";
import { Mascot } from "./Mascot";

/** Inscription, puis écran « Vérifiez votre boîte mail » (au lieu d'un simple message). */
export function SignupForm() {
  const [state, run, pending] = useActionState<FormState, FormData>(signup, null);
  const [editing, setEditing] = useState(false);
  const last = useRef<FormData | null>(null);
  const [resent, setResent] = useState(false);
  const email = state?.ok && !editing ? state.ok : null;

  if (email) {
    const domain = email.split("@")[1] || "";
    const webmail = /gmail|googlemail/.test(domain) ? { label: "Ouvrir Gmail", href: "https://mail.google.com/mail/u/0/#inbox" }
      : /outlook|hotmail|live|msn/.test(domain) ? { label: "Ouvrir Outlook", href: "https://outlook.live.com/mail/" } : null;
    return (
      <div className="check-mail">
        <Mascot size={76} talking />
        <h2>Un dernier clic et c&apos;est parti</h2>
        <p>Nous venons d&apos;envoyer un lien de confirmation à<br /><b>{email}</b></p>
        <ol>
          <li>Ouvrez l&apos;email « Trustpipe : confirmez votre adresse email »</li>
          <li>Cliquez sur <b>Confirmer mon email</b></li>
          <li>Choisissez votre formule et démarrez votre essai de 14 jours</li>
        </ol>
        {webmail && <a className="btn primary" href={webmail.href} target="_blank" rel="noopener noreferrer">{webmail.label} ↗</a>}
        <p className="muted small">Rien reçu après 2 minutes ? Regardez dans les spams ou les promotions.</p>
        <div className="check-mail-actions">
          <button type="button" className="as-reset" disabled={pending || resent} onClick={() => { if (last.current) { setResent(true); run(last.current); } }}>
            {resent ? "Email renvoyé ✓" : "Renvoyer l'email"}
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="as-reset" onClick={() => { setEditing(true); setResent(false); }}>Changer d&apos;adresse</button>
        </div>
      </div>
    );
  }

  return (
    <form action={(f) => { last.current = f; setEditing(false); run(f); }} className="form">
      <label className="full">Email professionnel<input className="input" type="email" name="email" required autoComplete="email" autoFocus /></label>
      <label className="full">Mot de passe<input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" />
        <span className="small" style={{ color: "var(--dim)" }}>Au moins 10 caractères.</span></label>
      <label className="full auth-check"><input type="checkbox" name="accept" required /><span>J&apos;accepte les <Link href="/cgv" target="_blank">conditions générales</Link> et la <Link href="/confidentialite" target="_blank">politique de confidentialité</Link>. Service réservé aux professionnels.</span></label>
      {state?.error && <div className="full banner err" role="alert">{state.error}</div>}
      <div className="full row"><button className="btn primary" disabled={pending}>{pending ? "Un instant…" : "Créer mon compte"}</button></div>
    </form>
  );
}
