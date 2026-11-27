"use client";
import { useEffect } from "react";

/** Page d'erreur : message clair, pas de détail technique, et un bouton pour réessayer. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="auth">
      <div className="card" style={{ width: "min(520px,100%)" }}>
        <h1 style={{ fontFamily: "var(--f-display)", margin: "0 0 8px" }}>Un problème est survenu</h1>
        <p className="muted">La page n&apos;a pas pu s&apos;afficher. Vos données ne sont pas touchées. Réessayez ; si le problème continue, écrivez-nous en indiquant le code ci-dessous.</p>
        {error.digest && <p className="muted small">Code : <code>{error.digest}</code></p>}
        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <button className="btn primary" onClick={() => reset()}>Réessayer</button>
          <a className="btn" href="/app">Retour à mon espace</a>
        </div>
      </div>
    </div>
  );
}
