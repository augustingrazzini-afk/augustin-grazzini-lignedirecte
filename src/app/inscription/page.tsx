import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { signup } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { TRIAL_DAYS } from "@/lib/billing";

export const metadata = { title: "Créer un compte" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect("/app");
  const q = sp.next ? `?next=${encodeURIComponent(sp.next)}` : "";
  return (
    <AuthCard title="Créer votre compte" subtitle={`${TRIAL_DAYS} jours d'essai gratuit, aucun débit avant la fin de l'essai.`}
      footer={<>Déjà un compte ? <Link href={`/login${q}`}><b>Se connecter</b></Link></>}>
      <ActionForm action={signup} submit="Créer mon compte">
        <label className="full">Email professionnel<input className="input" type="email" name="email" required autoComplete="email" autoFocus /></label>
        <label className="full">Mot de passe<input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" />
          <span className="small" style={{ color: "var(--dim)" }}>Au moins 10 caractères.</span></label>
        <label className="full auth-check"><input type="checkbox" name="accept" required /><span>J&apos;accepte les <Link href="/cgv" target="_blank">conditions générales</Link> et la <Link href="/confidentialite" target="_blank">politique de confidentialité</Link>. Service réservé aux professionnels.</span></label>
      </ActionForm>
      <p className="muted small" style={{ margin: "14px 0 0" }}>Nous vous envoyons un email pour confirmer votre adresse : votre compte est activé au clic.</p>
    </AuthCard>
  );
}
