import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { requestLogin } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";

export const metadata = { title: "Connexion" };
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app");
  return (
    <div className="auth">
      <div className="card">
        <div className="row" style={{ gap: 12, marginBottom: 20 }}><img src="/logo-mark.png" alt="" style={{ width: 44, background: "var(--navy)", borderRadius: 12, padding: 6 }} /><div className="wm" style={{ color: "var(--ink)" }}><span>Ligne</span><b>Directe</b></div></div>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 28, margin: "0 0 6px", letterSpacing: "-.02em" }}>Connexion</h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>Entrez votre email : on vous envoie un lien de connexion. Pas de mot de passe.</p>
        {sp.error === "expired" && <div className="banner err">Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.</div>}
        <ActionForm action={requestLogin} submit="Recevoir mon lien" hidden={sp.next ? { next: sp.next } : undefined}>
          <label className="full">Email professionnel<input className="input" type="email" name="email" required autoComplete="email" autoFocus /></label>
        </ActionForm>
      </div>
    </div>
  );
}
