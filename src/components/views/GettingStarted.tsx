import Link from "next/link";
import { db } from "@/lib/db";
import { Dismissible } from "@/components/client/Dismissible";
import { getProvider } from "@/lib/providers";
import { hasRecordings, listeningHelp } from "@/lib/listening";

/**
 * « Premiers pas » : le mini-tutoriel de l'espace commercial. Chaque étape se coche toute seule
 * à partir des données (commercial ajouté, outil branché…). Disparaît quand tout est fait,
 * ou quand l'utilisateur le masque.
 */
export async function GettingStarted({ orgId, userId }: { orgId: string; userId: string }) {
  const [integrations, calls, clients, convs, recorded, firstInteg] = await Promise.all([
    db.integration.count({ where: { orgId } }),
    db.call.count({ where: { orgId } }),
    db.client.findMany({ where: { orgId }, orderBy: { createdAt: "asc" }, select: { id: true }, take: 1 }),
    db.conversation.count({ where: { orgId, owner: userId } }),
    db.call.count({ where: { orgId, OR: [{ recordingUrl: { not: null } }, { recordingKey: { not: null } }] } }),
    db.integration.findFirst({ where: { orgId }, orderBy: { createdAt: "asc" }, select: { provider: true } }),
  ]);
  // Écoute des appels : ce qu'il faut activer dans l'outil connecté (ex. le partage externe des appels chez Minari).
  const prov = firstInteg && hasRecordings(firstInteg.provider) ? firstInteg.provider : null;
  const label = prov ? (() => { try { return getProvider(prov).label; } catch { return prov; } })() : "votre outil d'appel";
  const listen = listeningHelp(prov || "", label);
  const firstRep = clients[0]?.id;
  const steps = [
    { done: clients.length > 0, title: "Ajoutez vos commerciaux", text: "Internes, freelances ou agence de prospection : un nom, son statut, son email. Il reçoit une invitation.", href: "/app/clients", cta: "Ajouter un commercial" },
    { done: integrations > 0 || calls > 0, title: "Branchez leurs outils d'appel", text: "Chaque commercial branche son outil (Minari, Aircall, Ringover, lemlist…) depuis son invitation. Votre équipe partage un outil ? Branchez-le vous-même.", href: firstRep && !integrations ? `/app/clients/${firstRep}` : "/app/sources", cta: "Brancher un outil" },
    { done: recorded > 0, title: "Activez l'écoute des appels", text: `${listen.title} : chaque appel aura son bouton Écouter. Puis cliquez sur « Récupérer les enregistrements ».`, href: "/app/sources#ecoute", cta: "Activer l'écoute" },
    { done: calls > 0, title: "Regardez les appels arriver", text: "Chaque appel de chaque commercial, résumé par l'IA, avec la transcription et les objections. Le classement se met à jour en direct.", href: "/app/calls", cta: "Voir les appels" },
    { done: convs > 0, title: "Posez une question à l'assistant IA", text: "« Que s'est-il dit dans les appels d'aujourd'hui ? », « Quels appels écouter en priorité ? » : il a écouté tous les appels.", href: "/app/coach", cta: "Essayer l'assistant" },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Dismissible storeKey={`tp-gs3-${orgId}`} className="card gs">
      <div className="gs-head">
        <div>
          <h2>Premiers pas</h2>
          <p className="muted small" style={{ margin: "2px 0 0" }}>{steps.length} étapes pour suivre toute votre équipe commerciale. Elles se cochent toutes seules.</p>
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

/** Accueil de l'espace du commercial invité (ou d'un ancien lien de suivi en lecture seule). */
export function ClientWelcome({ storeKey, base, by, rep = false }: { storeKey: string; base: string; by: string; rep?: boolean }) {
  const items = [
    ...(rep ? [{ icon: "🔌", title: "Branchez votre outil", text: "Minari, Aircall, Ringover, lemlist… 2 minutes, et vos appels arrivent ici.", href: `${base}/sources` }] : []),
    { icon: "📈", title: "Pilotage", text: "Vos résultats en direct : appels, conversations, rendez-vous.", href: base },
    { icon: "📞", title: "Appels", text: "Chaque conversation avec son résumé, sa transcription et les objections.", href: `${base}/calls` },
    { icon: "✨", title: "Assistant IA", text: "« Prépare mon rendez-vous avec… » : il relit vos appels pour vous.", href: `${base}/coach` },
  ];
  return (
    <Dismissible storeKey={storeKey} className="card gs gs-client" closeLabel="J'ai compris">
      <h2 style={{ margin: "0 0 4px" }}>Bienvenue 👋</h2>
      <p className="muted small" style={{ margin: "0 0 14px" }}>{rep ? `${by} suit sa prospection avec Trustpipe. Branchez votre outil d'appel : vos appels arrivent ici, résumés par l'IA, et ${by} les suit en direct.` : `Ici, vous suivez en direct les appels de ${by}. La page se met à jour toute seule.`}</p>
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
