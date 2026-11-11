import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { loginPassword, requestLogin } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";
import { AuthCard } from "@/components/AuthCard";

export const metadata = { title: "Connexion" };
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : undefined;
  if (await currentUser()) redirect(next || "/app");
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthCard title="Connexion" subtitle="Heureux de vous revoir."
      footer={<>Pas encore de compte ? <Link href={`/inscription${q}`}><b>Créer un compte</b></Link> · 14 jours d&apos;essai gratuit</>}>
      {sp.error === "expired" && <div className="banner err">Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.</div>}
      <ActionForm action={loginPassword} submit="Se connecter" hidden={next ? { next } : undefined}>
        <label className="full">Email professionnel<input className="input" type="email" name="email" required autoComplete="email" autoFocus /></label>
        <label className="full">Mot de passe<input className="input" type="password" name="password" required autoComplete="current-password" /></label>
        <p className="full small" style={{ margin: "-4px 0 0", textAlign: "right" }}><Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
      </ActionForm>
      <details className="auth-alt">
        <summary>Ou recevoir un lien de connexion par email</summary>
        <ActionForm action={requestLogin} submit="Recevoir mon lien" hidden={next ? { next } : undefined}>
          <label className="full">Email<input className="input" type="email" name="email" required autoComplete="email" /></label>
        </ActionForm>
      </details>
    </AuthCard>
  );
}
