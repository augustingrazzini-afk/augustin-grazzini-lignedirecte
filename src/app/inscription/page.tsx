import Link from "next/link";
import { VisitBeacon } from "@/components/client/VisitBeacon";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { SignupForm } from "@/components/client/SignupForm";
import { AuthCard } from "@/components/AuthCard";

export const metadata = { title: "Créer un compte" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect("/app");
  const q = sp.next ? `?next=${encodeURIComponent(sp.next)}` : "";
  return (
    <AuthCard title="Créer votre compte" subtitle="7 jours d'essai, puis sans engagement."
      footer={<>Déjà un compte ? <Link href={`/login${q}`}><b>Se connecter</b></Link></>}>
      <VisitBeacon page="/inscription" />
      <SignupForm />
      <p className="muted small" style={{ margin: "14px 0 0" }}>Nous vous envoyons un email pour confirmer votre adresse : votre compte est activé au clic.</p>
    </AuthCard>
  );
}
