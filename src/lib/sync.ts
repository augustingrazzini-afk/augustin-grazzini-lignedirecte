import { db } from "./db";
import { open, seal } from "./crypto";
import { upsertActivities, upsertCalls } from "./ingest";
import { getProvider } from "./providers";
import { ProviderError } from "./providers/types";
import { processPendingAi } from "./ai";
import { runPool } from "./pool";
import { processTranscriptions } from "./transcribe";
import { bumpUsage } from "./usage";

const DETAIL_BUDGET = 40;

/** Synchronise une intégration. Première synchro : 90 jours. Ensuite : depuis la dernière, avec 2 h de recouvrement. */
export async function syncIntegration(integrationId: string, opts: { full?: boolean } = {}) {
  const integ = await db.integration.findUnique({ where: { id: integrationId } });
  if (!integ || integ.status === "paused") return { created: 0, updated: 0, skipped: true };
  const p = getProvider(integ.provider);
  const creds = open<Record<string, string>>(integ.credentials);
  const since = !opts.full && integ.lastSyncAt ? new Date(integ.lastSyncAt.getTime() - 2 * 3600e3) : new Date(Date.now() - 90 * 864e5);
  const startedAt = new Date();
  let created = 0, updated = 0;
  try {
    const target = { orgId: integ.orgId, provider: integ.provider, integrationId: integ.id, clientId: integ.clientId };
    if (p.list) for await (const page of p.list(creds, since)) {
      const r = await upsertCalls(target, page);
      created += r.created; updated += r.updated;
    }
    if (p.listActivities) for await (const page of p.listActivities(creds, since)) {
      const r = await upsertActivities(target, page);
      created += r.created; updated += r.updated;
    }
    if (p.details) await fillDetails(integ.id, integ.orgId, integ.provider, integ.clientId, creds);
    await saveCreds(integ.id, creds);
    await db.integration.update({ where: { id: integ.id }, data: { lastSyncAt: startedAt, status: "active", lastError: null } });
  } catch (e) {
    await saveCreds(integ.id, creds);
    const msg = e instanceof ProviderError ? e.message : "Erreur inattendue pendant la synchronisation.";
    if (!(e instanceof ProviderError)) console.error("sync", integ.id, e);
    await db.integration.update({ where: { id: integ.id }, data: { status: "error", lastError: msg } });
    throw e;
  }
  return { created, updated, skipped: false };
}

/** Connexion OAuth : les jetons renouvelés pendant la synchro sont réenregistrés (chiffrés). */
async function saveCreds(id: string, creds: Record<string, string>) {
  if (!creds.__dirty) return;
  delete creds.__dirty;
  await db.integration.update({ where: { id }, data: { credentials: seal(creds) } }).catch((e) => console.error("jetons", id, e));
}

/** Récupère transcriptions et détails des conversations qui n'en ont pas encore. */
async function fillDetails(integrationId: string, orgId: string, provider: string, clientId: string | null, creds: Record<string, string>) {
  const p = getProvider(provider);
  const todo = await db.call.findMany({
    where: { integrationId, connected: true, durationSec: { gte: 30 }, transcript: { equals: [] } },
    orderBy: { startedAt: "desc" },
    take: DETAIL_BUDGET,
    select: { externalId: true },
  });
  for (const t of todo) {
    try {
      const d = await p.details!(creds, t.externalId);
      if (!d) continue;
      const base = await db.call.findUnique({ where: { orgId_provider_externalId: { orgId, provider, externalId: t.externalId } } });
      if (!base) continue;
      await upsertCalls({ orgId, provider, integrationId, clientId }, [{
        startedAt: base.startedAt, durationSec: base.durationSec, direction: (base.direction as any) ?? undefined,
        status: base.status, connected: base.connected, meetingBooked: base.meetingBooked, firstName: base.firstName, lastName: base.lastName,
        company: base.company, jobTitle: base.jobTitle, repName: base.repName, listName: base.listName, campaign: base.campaign, tags: base.tags,
        ...d, externalId: t.externalId,
      }]);
    } catch (e) {
      if (e instanceof ProviderError && e.status === 429) break;
    }
  }
}

/** Synchronise une intégration puis analyse aussitôt ses nouveaux appels (webhook, première connexion). */
export async function syncAndAnalyze(integrationId: string, opts: { full?: boolean } = {}) {
  const r = await syncIntegration(integrationId, opts);
  if (!r.skipped) {
    const integ = await db.integration.findUnique({ where: { id: integrationId }, select: { orgId: true } });
    // Enregistrements sans transcription : on les transcrit (et on récupère ce qui est prêt) avant l'analyse IA.
    if (integ) await processTranscriptions({ orgId: integ.orgId, waitMs: 45_000 });
    await analyzeOrg(integrationId);
  }
  return r;
}

/** Analyse IA des appels en attente de l'organisation propriétaire de l'intégration. Ne lève jamais d'erreur. */
export async function analyzeOrg(integrationId: string) {
  try {
    const integ = await db.integration.findUnique({ where: { id: integrationId }, select: { orgId: true } });
    if (integ) await processPendingAi({ orgId: integ.orgId, limit: 40 });
  } catch (e) {
    console.error("analyse IA", integrationId, e);
  }
}

/**
 * Synchronise les intégrations actives (tâche planifiée), les plus anciennement synchronisées d'abord,
 * plusieurs en parallèle, jusqu'à `deadline`. Celles qui ne passent pas cette fois passent en tête la fois suivante.
 */
export async function syncAll(opts: { limit?: number; concurrency?: number; deadline?: number } = {}) {
  const { limit = 1000, concurrency = 6, deadline } = opts;
  // On ne synchronise que les espaces dont l'essai ou l'abonnement est en cours.
  const list = await db.integration.findMany({
    where: { status: { not: "paused" }, provider: { not: "webhook" }, org: { OR: [{ subscriptionStatus: { in: ["active", "past_due"] } }, { subscriptionStatus: "trialing", trialEndsAt: { gt: new Date() } }] } },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } }, take: limit, select: { id: true },
  });
  let ok = 0, failed = 0;
  await runPool(list, concurrency, async (i) => {
    try {
      await syncIntegration(i.id);
      ok++;
    } catch {
      failed++; // l'erreur est enregistrée sur l'intégration
    }
  }, deadline);
  return { total: list.length, ok, failed, remaining: list.length - ok - failed };
}

/**
 * Synchro « en direct » : quand quelqu'un ouvre son espace ou un lien de suivi, les outils de l'organisation
 * sont resynchronisés s'ils ne l'ont pas été depuis 10 minutes (une seule fois par tranche de 10 minutes).
 */
export async function syncIfStale(orgId: string) {
  try {
    const cutoff = new Date(Date.now() - 10 * 60e3);
    const stale = await db.integration.findMany({ where: { orgId, status: { not: "paused" }, provider: { not: "webhook" }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }] }, select: { id: true } });
    const slot = Math.floor(Date.now() / 600e3);
    for (const i of stale) {
      if ((await bumpUsage(`autosync:${i.id}:${slot}`)) !== 1) continue; // déjà lancée par un autre visiteur
      await syncAndAnalyze(i.id).catch(() => {});
    }
  } catch (e) {
    console.error("synchro à la visite", e);
  }
}
