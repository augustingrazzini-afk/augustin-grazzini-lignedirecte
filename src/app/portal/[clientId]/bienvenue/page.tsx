import Link from "next/link";
import { requireClientScope } from "@/lib/access";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";
import { hasAi, hasPremium } from "@/lib/billing";
import { SOURCE_LABEL } from "@/lib/providers";
import { Sources } from "@/components/views/Sources";
import { finishOnboarding } from "@/app/actions";
import { Btn } from "@/components/client/Btn";

export const metadata = { title: "Bienvenue" };

const STEPS = ["Votre espace", "Branchez votre outil", "Ce que Trustpipe fait pour vous"];

/** Première connexion d'un commercial invité : 3 étapes guidées, puis son tableau de bord. */
export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ etape?: string; erreur?: string; connecte?: string }> }) {
  const scope = await requireClientScope((await params).clientId);
  const sp = await searchParams;
  const step = Math.min(3, Math.max(1, Number(sp.etape) || 1));
  const base = `/portal/${scope.clientId}`;
  const [client, member, integrations, calls] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: scope.clientId }, include: { org: true } }),
    db.clientMember.findUnique({ where: { clientId_userId: { clientId: scope.clientId, userId: scope.userId } } }),
    db.integration.findMany({ where: { clientId: scope.clientId }, include: { _count: { select: { calls: true } } } }),
    db.call.count({ where: { clientId: scope.clientId } }),
  ]);
  if (member && !member.joinedAt) await db.clientMember.update({ where: { id: member.id }, data: { joinedAt: new Date() } });
  const org = client.org.name, premium = hasPremium(client.org), ai = hasAi(client.org);
  const next = (n: number) => `${base}/bienvenue?etape=${n}`;

  return (
    <div className="ob">
      <ol className="ob-steps">
        {STEPS.map((t, i) => (
          <li key={t} className={i + 1 === step ? "on" : i + 1 < step && (i !== 1 || integrations.length) ? "done" : ""}>
            <Link href={next(i + 1)}><span>{i + 1 < step ? "✓" : i + 1}</span>{t}</Link>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="card ob-card">
          <p className="ob-kicker">Bienvenue{client.name ? `, ${client.name}` : ""} 👋</p>
          <h1 className="ob-title">{org} suit sa prospection avec Trustpipe.</h1>
          <p className="ob-lead">Vous branchez votre outil d&apos;appel une fois. Ensuite, chaque appel arrive ici tout seul, résumé par l&apos;IA, et {org} voit vos résultats en direct. Vous n&apos;avez rien à saisir.</p>
          <div className="ob-two">
            <div className="ob-box">
              <h3>Ce que {org} voit</h3>
              <ul>
                <li>Vos appels passés avec l&apos;outil que vous branchez, avec leur résumé et leur transcription</li>
                <li>Vos chiffres : appels, décroché, conversations, rendez-vous</li>
                <li>Vos relances et vos rendez-vous à venir</li>
              </ul>
            </div>
            <div className="ob-box ob-safe">
              <h3>Ce qui reste privé</h3>
              <ul>
                <li>Seuls les appels de l&apos;outil branché remontent : rien d&apos;autre de votre ordinateur ni de vos comptes</li>
                <li>Votre clé d&apos;accès est chiffrée : personne ne peut la lire, pas même {org}</li>
                <li>Les autres commerciaux ne voient jamais vos appels, et vous ne voyez pas les leurs</li>
              </ul>
            </div>
          </div>
          <div className="ob-actions"><Link className="btn primary" href={next(2)}>Brancher mon outil →</Link></div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="card ob-card">
            <p className="ob-kicker">Étape 2 sur 3 · 2 minutes</p>
            <h1 className="ob-title">Branchez votre outil d&apos;appel</h1>
            <p className="ob-lead">Choisissez votre outil ci-dessous et collez votre clé API. Chaque outil indique où la trouver (en général : Réglages, puis Intégrations ou API).</p>
            {sp.erreur && <div className="banner err ob-status"><div>{sp.erreur}</div></div>}
            {integrations.length ? (
              <div className="banner ok ob-status"><div><b>✓ C&apos;est branché : {integrations.map((i) => SOURCE_LABEL[i.provider] || i.label).join(", ")}.</b> {calls ? `${fmt(calls)} appel${calls > 1 ? "s" : ""} déjà récupéré${calls > 1 ? "s" : ""}.` : "Vos appels arrivent dans quelques minutes."}</div></div>
            ) : (
              <div className="banner info ob-status"><div><b>En attente du branchement.</b> Une fois votre outil connecté, ce message passe au vert avec le nombre d&apos;appels récupérés.</div></div>
            )}
            <div className="ob-actions">
              <Link className="btn" href={next(1)}>← Retour</Link>
              <Link className={`btn${integrations.length ? " primary" : ""}`} href={next(3)}>{integrations.length ? "Continuer →" : "Je le ferai plus tard →"}</Link>
            </div>
          </div>
          <Sources scope={scope} />
        </>
      )}

      {step === 3 && (
        <div className="card ob-card">
          <p className="ob-kicker">Étape 3 sur 3</p>
          <h1 className="ob-title">Ce que Trustpipe fait pour vous</h1>
          <p className="ob-lead">Ce n&apos;est pas qu&apos;un suivi pour {org} : votre espace vous fait gagner du temps chaque jour.</p>
          <div className="ob-grid">
            <Tile icon="📞" title="Vos appels" text="Chaque conversation avec son résumé, sa transcription et les objections du prospect." />
            <Tile icon="⏰" title="Vos relances" text="Les rappels à faire, quand les faire, avec le message déjà rédigé." locked={!ai} />
            <Tile icon="📋" title="Brief avant rendez-vous" text="Tout ce qui s'est dit avec le prospect, résumé en une page avant votre rendez-vous." locked={!premium} />
            <Tile icon="✨" title="Coach et assistant IA" text="« Comment je traite l'objection budget ? », « Prépare mon rappel avec… » : il relit vos appels." locked={!ai} />
            <Tile icon="🎧" title="Écoute des appels" text="Réécoutez vos appels ici même, et ceux que votre responsable vous envoie en exemple." locked={!premium} />
            <Tile icon="📈" title="Vos chiffres" text="Votre taux de décroché, votre meilleure heure d'appel et vos rendez-vous, en direct." />
          </div>
          <form action={finishOnboarding} className="ob-actions">
            <input type="hidden" name="clientId" value={scope.clientId} />
            <Link className="btn" href={next(2)}>← Retour</Link>
            <Btn className="btn primary">Ouvrir mon espace →</Btn>
          </form>
        </div>
      )}
    </div>
  );
}

function Tile({ icon, title, text, locked }: { icon: string; title: string; text: string; locked?: boolean }) {
  return (
    <div className={`ob-tile${locked ? " ob-locked" : ""}`}>
      <span aria-hidden="true">{icon}</span>
      <b>{title}{locked && <em> · non inclus dans la formule de votre entreprise</em>}</b>
      <span className="muted small">{text}</span>
    </div>
  );
}
