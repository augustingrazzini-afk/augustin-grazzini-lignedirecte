import Link from "next/link";
import { forgotPassword } from "@/app/actions";
import { ActionForm } from "@/components/client/ActionForm";
import { AuthCard } from "@/components/AuthCard";

export const metadata = { title: "Mot de passe oublié" };
export default function Page() {
  return (
    <AuthCard title="Mot de passe oublié" subtitle="Indiquez votre email : nous vous envoyons un lien pour en choisir un nouveau."
      footer={<Link href="/login">Retour à la connexion</Link>}>
      <ActionForm action={forgotPassword} submit="Recevoir le lien">
        <label className="full">Email professionnel<input className="input" type="email" name="email" required autoComplete="email" autoFocus /></label>
      </ActionForm>
    </AuthCard>
  );
}
