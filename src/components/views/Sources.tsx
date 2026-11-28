import { Btn } from "@/components/client/Btn";
import type { Scope } from "@/lib/access";
import { ActionForm } from "../client/ActionForm";
import { planOf } from "@/lib/plan";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { getProvider, providerList } from "@/lib/providers";
import { storageEnabled } from "@/lib/storage";
import { deleteIntegration, fetchRecordings, syncNow } from "@/app/actions";
import { hasRecordings, listeningHelp } from "@/lib/listening";
import type { ProviderInfo } from "../client/IntegrationForm";
import { providerColor } from "@/lib/provider-colors";
import { Connectors } from "../client/Connectors";
import { oneClickReady } from "@/lib/mcp";
import { CsvImport } from "../client/CsvImport";
import { ManualAdd } from "../client/ManualAdd";
import { CopyButton } from "../client/CallActions";

export async function Sources({ scope }: { scope: Scope }) {
  const canListen = (await planOf(scope.orgId)).premium;
  const clientId = scope.kind === "client" ? scope.clientId : null;
  const integrations = await db.integration.findMany({
    where: { orgId: scope.orgId, ...(clientId ? { clientId } : {}) },
    include: { client: true, _count: { select: { calls: true, activities: true } } },
    orderBy: { createdAt: "asc" },
  });
  const withAudio = integrations.length ? await db.call.groupBy({ by: ["integrationId"], where: { integrationId: { in: integrations.map((i) => i.id) }, OR: [{ recordingUrl: { not: null } }, { recordingKey: { not: null } }] }, _count: { _all: true } }) : [];
  const audioCount = new Map(withAudio.map((x) => [x.integrationId, x._count._all]));
  const CH: Record<string, string> = { call: "appels", email: "email", linkedin: "LinkedIn" };
  const providers: ProviderInfo[] = providerList.filter((p) => ["minari", "skipcall", "lemlist", "aircall", "ringover", "justcall", "allo", "dialpad", "close", "salesloft", "apollo", "gong", "custom", "webhook"].includes(p.id)).map((p) => ({ id: p.id, label: p.label, beta: p.beta, help: `${p.help} Canaux : ${p.channels.map((c) => CH[c]).join(", ")}.`, channels: p.channels, fields: p.credentialFields }));
  const app = process.env.APP_URL || "http://localhost:3000";
  return (
    <div className="stack">
      {integrations.length > 0 && (
        <div className="card"><h2>Outils connectés</h2><p className="sub">Synchronisation automatique chaque jour, et en direct si vous ajoutez l&apos;URL de webhook dans l&apos;outil.</p>
          <div className="list">{integrations.map((i) => {
            const p = getProvider(i.provider);
            const universal = i.provider === "webhook";
            const hook = universal ? `${app}/api/ingest/${i.webhookToken}` : `${app}/api/webhooks/${i.webhookToken}`;
            return (
              <div key={i.id} className="item" style={{ gridTemplateColumns: "42px minmax(0,1fr) auto" }}>
                <span className="logo-src" style={{ background: providerColor(i.provider), gridRow: "span 2" }}>{p.label[0]}</span>
                <span className="who">{i.label}{i.client && scope.kind === "org" && <span> · branché par {i.client.name}</span>}</span>
                <span>{i.status === "error" ? <span className="pill bad">Erreur</span> : <span className="pill win">Actif</span>}</span>
                <span className="sum" style={{ WebkitLineClamp: 3 }}>{i._count.calls} appels · {universal ? "dernier envoi" : "dernière synchro"} {ago(i.lastSyncAt)}{i.lastError ? ` · ${i.lastError}` : ""}{p.beta ? " · intégration bêta" : ""}</span>
                <span className="tags" style={{ gridColumn: "1/-1" }}>
                  <details style={{ flex: "1 1 280px" }} open={universal && i._count.calls + i._count.activities === 0}><summary className="muted small" style={{ cursor: "pointer" }}>{universal ? "URL à brancher dans Zapier, Make ou n8n" : "URL de webhook (temps réel)"}</summary>
                    <div className="row" style={{ marginTop: 8 }}><span className="code" style={{ flex: 1 }}>{hook}</span><CopyButton text={hook} /></div>
                    {universal ? (
                      <div className="muted small" style={{ marginTop: 8 }}>
                        <p style={{ margin: "0 0 6px" }}>Dans Zapier / Make / n8n : déclencheur = votre outil (nouvelle réponse, invitation acceptée, email envoyé…), action = « Webhook POST » vers cette URL, en JSON :</p>
                        <pre className="code" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{`{ "channel": "email" | "linkedin" | "call",
  "event": "sent" | "replied" | "invite_sent" | "invite_accepted" | "message_sent" | "meeting_booked",
  "occurred_at": "2026-11-12T10:30:00Z",
  "first_name": "Jean", "last_name": "Dupont", "company": "Acme",
  "email": "jean@acme.fr", "campaign": "Q4 SaaS",
  "subject": "…", "body": "texte de la réponse" }`}</pre>
                        <p style={{ margin: "6px 0 0" }}>Le libellé d&apos;événement de votre outil est aussi compris (« emailsReplied », « Connection accepted »…). Gardez cette URL secrète.</p>
                      </div>
                    ) : <p className="muted small" style={{ margin: "6px 0 0" }}>À coller dans {p.label} (réglages API / webhooks). Gardez-la secrète.</p>}</details>
                  {canListen && hasRecordings(i.provider) && i._count.calls > 0 && (() => {
                    const n = audioCount.get(i.id) || 0, h = listeningHelp(i.provider, p.label);
                    return (
                      <details id="ecoute" style={{ flex: "1 1 100%" }} open={n === 0}>
                        <summary className="small" style={{ cursor: "pointer" }}>{n > 0 ? <>🎧 Écoute des appels : <b>{n}</b> appel(s) écoutable(s) sur {i._count.calls}</> : <b>🎧 Écoute des appels : à activer</b>}</summary>
                        <div className="banner" style={{ margin: "8px 0 0", display: "block" }}>
                          <b>{h.title}</b>
                          <ol className="small" style={{ margin: "6px 0 10px", paddingLeft: 18, lineHeight: 1.6 }}>{h.steps.map((st) => <li key={st}>{st}</li>)}</ol>
                          <ActionForm action={fetchRecordings} submit="Récupérer les enregistrements" className="" hidden={{ integrationId: i.id }} />
                          <p className="muted small" style={{ margin: "6px 0 0" }}>Le résultat s&apos;affiche ici en quelques secondes : nombre d&apos;appels écoutables, ou ce qu&apos;il reste à activer dans votre outil.</p>
                        </div>
                      </details>
                    );
                  })()}
                  {!universal && <form action={syncNow}><input type="hidden" name="integrationId" value={i.id} /><Btn className="btn sm">Synchroniser</Btn></form>}
                  <form action={deleteIntegration}><input type="hidden" name="integrationId" value={i.id} /><Btn className="btn sm danger" row>Déconnecter</Btn></form>
                </span>
              </div>
            );
          })}</div>
        </div>
      )}
      <Connectors providers={providers} clientId={clientId} connected={[...new Set(integrations.map((i) => i.provider))]} oneClick={providers.map((p) => p.id).filter(oneClickReady)} />
      {/* Saisie manuelle et CSV : réservés à l'entreprise, pour que les chiffres d'un commercial viennent de son outil. */}
      {scope.kind === "org" && <><CsvImport clientId={clientId} />
      <ManualAdd clientId={clientId} uploads={storageEnabled()} /></>}
      <div className="card"><h2>Où vont vos données</h2><p className="sub" style={{ marginBottom: 0 }}>
        {scope.kind === "client" ? "Les appels de l'outil que vous branchez arrivent dans votre espace, et l'entreprise pour qui vous prospectez les suit en direct. " : "Chaque appel est attribué à un commercial (l'outil qu'il a branché, ou les règles de l'onglet Commerciaux) : un commercial ne voit jamais les appels d'un autre. "}
        Les clés API sont chiffrées. Le téléphone et l'email des prospects sont chiffrés.</p></div>
    </div>
  );
}
