import Link from "next/link";
import { resetPassword } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";
import { AuthCard } from "@/components/AuthCard";

export const metadata = { title: "Nouveau mot de passe", robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = ((await searchParams).token || "").slice(0, 200);
  if (!token) return <AuthCard title="Lien incomplet" subtitle="Ouvrez le lien reçu par email, ou refaites une demande." footer={<Link href="/mot-de-passe-oublie">Mot de passe oublié</Link>}><span /></AuthCard>;
  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Choisissez votre nouveau mot de passe (au moins 10 caractères)."
      footer={<Link href="/login">Retour à la connexion</Link>}>
      <ActionForm action={resetPassword} submit="Enregistrer et me connecter" hidden={{ token }}>
        <label className="full">Nouveau mot de passe<input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" autoFocus /></label>
        <label className="full">Confirmez<input className="input" type="password" name="confirm" required minLength={10} autoComplete="new-password" /></label>
      </ActionForm>
    </AuthCard>
  );
}
