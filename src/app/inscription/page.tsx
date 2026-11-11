import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { SignupForm } from "@/components/client/SignupForm";
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
      <SignupForm />
      <p className="muted small" style={{ margin: "14px 0 0" }}>Nous vous envoyons un email pour confirmer votre adresse : votre compte est activé au clic.</p>
    </AuthCard>
  );
}
