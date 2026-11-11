import type { Scope } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { getProvider, providerList } from "@/lib/providers";
import { storageEnabled } from "@/lib/storage";
import { deleteIntegration, syncNow } from "@/app/actions";
import type { ProviderInfo } from "../client/IntegrationForm";
import { providerColor } from "@/lib/provider-colors";
import { Connectors } from "../client/Connectors";
import { CsvImport } from "../client/CsvImport";
import { ManualAdd } from "../client/ManualAdd";
import { CopyButton } from "../client/CallActions";

export async function Sources({ scope }: { scope: Scope }) {
  const clientId = scope.kind === "client" ? scope.clientId : null;
  const integrations = await db.integration.findMany({
    where: { orgId: scope.orgId, ...(clientId ? { clientId } : {}) },
    include: { client: true, _count: { select: { calls: true, activities: true } } },
    orderBy: { createdAt: "asc" },
  });
  const CH: Record<string, string> = { call: "appels", email: "email", linkedin: "LinkedIn" };
  const providers: ProviderInfo[] = providerList.filter((p) => ["minari", "skipcall", "lemlist", "aircall", "ringover", "justcall", "allo", "dialpad", "close", "salesloft", "apollo", "gong", "hubspot", "custom", "webhook"].includes(p.id)).map((p) => ({ id: p.id, label: p.label, beta: p.beta, help: `${p.help} Canaux : ${p.channels.map((c) => CH[c]).join(", ")}.`, channels: p.channels, fields: p.credentialFields }));
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
                <span className="who">{i.label}{i.client && scope.kind === "org" && <span> · espace {i.client.name}</span>}</span>
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
                  {!universal && <form action={syncNow}><input type="hidden" name="integrationId" value={i.id} /><button className="btn sm">Synchroniser</button></form>}
                  <form action={deleteIntegration}><input type="hidden" name="integrationId" value={i.id} /><button className="btn sm danger">Déconnecter</button></form>
                </span>
              </div>
            );
          })}</div>
        </div>
      )}
      <Connectors providers={providers} clientId={clientId} connected={[...new Set(integrations.map((i) => i.provider))]} />
      <CsvImport clientId={clientId} />
      <ManualAdd clientId={clientId} uploads={storageEnabled()} />
      <div className="card"><h2>Où vont vos données</h2><p className="sub" style={{ marginBottom: 0 }}>
        {scope.kind === "client" ? "Les appels que vous ajoutez restent dans votre espace : seuls votre équipe et votre prestataire les voient. " : "Chaque appel est rangé chez un client grâce aux règles de l'onglet Clients : un client ne voit jamais les appels d'un autre. "}
        Les clés API sont chiffrées. Les numéros de téléphone ne sont pas conservés (seulement les 4 derniers chiffres).</p></div>
    </div>
  );
}
