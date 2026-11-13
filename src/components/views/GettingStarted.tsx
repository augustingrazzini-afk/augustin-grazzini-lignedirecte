import Link from "next/link";
import { db } from "@/lib/db";
import { Dismissible } from "@/components/client/Dismissible";

/**
 * « Premiers pas » : le mini-tutoriel de l'espace commercial. Chaque étape se coche toute seule
 * à partir des données (outil connecté, client créé, lien partagé…). Disparaît quand tout est fait,
 * ou quand l'utilisateur le masque.
 */
export async function GettingStarted({ orgId, userId }: { orgId: string; userId: string }) {
  const [integrations, calls, clients, shared, convs] = await Promise.all([
    db.integration.count({ where: { orgId } }),
    db.call.count({ where: { orgId } }),
    db.client.findMany({ where: { orgId }, orderBy: { createdAt: "asc" }, select: { id: true }, take: 1 }),
    db.client.count({ where: { orgId, shareToken: { not: null } } }),
    db.conversation.count({ where: { orgId, owner: userId } }),
  ]);
  const firstClient = clients[0]?.id;
  const steps = [
    { done: integrations > 0 || calls > 0, title: "Connectez votre outil d'appel", text: "Minari, lemlist, Aircall, Ringover… Une clé à coller (ou un clic pour Minari), et vos appels arrivent tout seuls.", href: "/app/sources", cta: "Connecter un outil" },
    { done: clients.length > 0, title: "Créez votre premier client", text: "Donnez-lui un nom et indiquez ses listes d'appels : ses appels sont rangés chez lui automatiquement.", href: "/app/clients", cta: "Créer un client" },
    { done: shared > 0, title: "Envoyez-lui son lien de suivi", text: "Sur la fiche du client, créez le lien et envoyez-le. Il suit vos appels en direct, sans compte ni mot de passe.", href: firstClient ? `/app/clients/${firstClient}` : "/app/clients", cta: "Partager le lien" },
    { done: calls > 0, title: "Regardez vos appels arriver", text: "Chaque appel est résumé par l'IA, avec la transcription et les objections. Le tableau de bord se met à jour en continu.", href: "/app/calls", cta: "Voir mes appels" },
    { done: convs > 0, title: "Posez une question à l'assistant IA", text: "« Prépare mon rendez-vous de jeudi avec… », « Quelles objections reviennent ? » : il relit vos appels pour vous.", href: "/app/coach", cta: "Essayer l'assistant" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Dismissible storeKey={`tp-gs-${orgId}`} className="card gs">
      <div className="gs-head">
        <div>
          <h2>Premiers pas</h2>
          <p className="muted small" style={{ margin: "2px 0 0" }}>5 étapes, environ 2 minutes. Elles se cochent toutes seules.</p>
        </div>
        <span className="gs-count">{doneCount}/{steps.length}</span>
      </div>
      <div className="gs-bar" aria-hidden="true"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="gs-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "done" : i === next ? "next" : ""}>
            <span className="gs-dot" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <div className="gs-body">
              <b>{s.title}</b>
              <span className="muted small">{s.text}</span>
            </div>
            {!s.done && <Link className={`btn sm${i === next ? " primary" : ""}`} href={s.href}>{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </Dismissible>
  );
}

/** Accueil du client (lien de suivi ou espace client) : ce qu'il peut faire, en 4 points. */
export function ClientWelcome({ storeKey, base, by }: { storeKey: string; base: string; by: string }) {
  const items = [
    { icon: "📈", title: "Pilotage", text: "Vos résultats en direct : appels, conversations, rendez-vous.", href: base },
    { icon: "📞", title: "Appels", text: "Chaque conversation avec son résumé, sa transcription et les objections.", href: `${base}/calls` },
    { icon: "📅", title: "Mes rendez-vous", text: "Déposez la transcription de votre rendez-vous : l'IA vous le débriefe.", href: `${base}/rendez-vous` },
    { icon: "✨", title: "Assistant IA", text: "« Prépare mon rendez-vous avec… » : il relit les appels pour vous.", href: `${base}/coach` },
  ];
  return (
    <Dismissible storeKey={storeKey} className="card gs gs-client" closeLabel="J'ai compris">
      <h2 style={{ margin: "0 0 4px" }}>Bienvenue 👋</h2>
      <p className="muted small" style={{ margin: "0 0 14px" }}>Ici, vous suivez en direct la prospection menée pour vous par {by}. La page se met à jour toute seule.</p>
      <div className="gs-grid">
        {items.map((it) => (
          <Link key={it.title} href={it.href} className="gs-tile">
            <span aria-hidden="true">{it.icon}</span>
            <b>{it.title}</b>
            <span className="muted small">{it.text}</span>
          </Link>
        ))}
      </div>
    </Dismissible>
  );
}
