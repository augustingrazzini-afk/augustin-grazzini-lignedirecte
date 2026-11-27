import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { currentUser } from "@/lib/session";
import { checkAuthorize, issueCode } from "@/lib/mcp-server";

export const metadata = { title: "Connecter Claude", robots: { index: false } };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** Autorisation du connecteur Claude : l'utilisateur connecté accepte que Claude lise et gère ses relances. */
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  const p = await checkAuthorize(sp);
  if ("error" in p) return <AuthCard title="Connexion impossible" subtitle={p.error}><p className="muted small">Fermez cette page et relancez la connexion depuis Claude.</p></AuthCard>;
  const m = u.memberships[0];
  if (!m) return <AuthCard title="Connexion impossible" subtitle="Ce compte n'a pas d'espace commercial Trustpipe. Connectez-vous avec le compte de votre espace."><p className="muted small">Connecté en tant que {u.email}.</p></AuthCard>;

  async function allow(form: FormData) {
    "use server";
    const me = await currentUser();
    const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    const ok = await checkAuthorize(params);
    const mm = me?.memberships[0];
    if (!me || !mm || "error" in ok) redirect("/app");
    redirect(await issueCode(ok, me.id, mm.orgId));
  }
  async function deny(form: FormData) {
    "use server";
    const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    const ok = await checkAuthorize(params);
    if ("error" in ok) redirect("/app");
    const back = new URL(ok.redirectUri);
    back.searchParams.set("error", "access_denied");
    if (ok.state) back.searchParams.set("state", ok.state);
    redirect(back.toString());
  }
  const hidden = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state"].map((k) => sp[k] !== undefined && <input key={k} type="hidden" name={k} value={sp[k]} />);

  return (
    <AuthCard title={`Connecter ${p.clientName}`} subtitle={`${p.clientName} demande l'accès à l'espace « ${m.org.name} ».`}>
      <ul className="small" style={{ margin: "0 0 18px", paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Lire vos relances, vos commerciaux et l&apos;historique d&apos;appels de vos prospects</li>
        <li>Créer, reporter et marquer comme faites vos relances</li>
        <li>Rien d&apos;autre : pas d&apos;accès à vos réglages, à vos outils connectés ni à la facturation</li>
      </ul>
      <p className="muted small" style={{ margin: "0 0 18px" }}>Connecté en tant que {u.email}. Vous pourrez couper l&apos;accès à tout moment depuis Réglages.</p>
      <div className="row" style={{ gap: 10 }}>
        <form action={allow}>{hidden}<button className="btn primary" type="submit">Autoriser</button></form>
        <form action={deny}>{hidden}<button className="btn" type="submit">Refuser</button></form>
      </div>
    </AuthCard>
  );
}
