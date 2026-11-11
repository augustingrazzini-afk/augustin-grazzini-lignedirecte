import { db } from "./db";
import { open } from "./crypto";
import { upsertCalls } from "./ingest";
import { getProvider } from "./providers";
import { ProviderError } from "./providers/types";

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
    for await (const page of p.list(creds, since)) {
      const r = await upsertCalls({ orgId: integ.orgId, provider: integ.provider, integrationId: integ.id, clientId: integ.clientId }, page);
      created += r.created; updated += r.updated;
    }
    if (p.details) await fillDetails(integ.id, integ.orgId, integ.provider, integ.clientId, creds);
    await db.integration.update({ where: { id: integ.id }, data: { lastSyncAt: startedAt, status: "active", lastError: null } });
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "Erreur inattendue pendant la synchronisation.";
    if (!(e instanceof ProviderError)) console.error("sync", integ.id, e);
    await db.integration.update({ where: { id: integ.id }, data: { status: "error", lastError: msg } });
    throw e;
  }
  return { created, updated, skipped: false };
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

/** Synchronise toutes les intégrations actives (appelé par la tâche planifiée). */
export async function syncAll(limit = 50) {
  // On ne synchronise que les espaces dont l'essai ou l'abonnement est en cours.
  const list = await db.integration.findMany({
    where: { status: { not: "paused" }, org: { OR: [{ subscriptionStatus: { in: ["active", "past_due"] } }, { subscriptionStatus: "trialing", trialEndsAt: { gt: new Date() } }] } },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } }, take: limit, select: { id: true },
  });
  const results: Record<string, string> = {};
  for (const i of list) {
    try {
      const r = await syncIntegration(i.id);
      results[i.id] = `+${r.created} / ~${r.updated}`;
    } catch (e) {
      results[i.id] = e instanceof Error ? e.message : "erreur";
    }
  }
  return results;
}
