import { db } from "./db";
import { isAdminOrg } from "./admin";
import { deleteStored } from "./storage";

export const PURGE_AFTER_DAYS = 30;

/**
 * Fin de contrat + 30 jours : suppression des données de prospection de l'espace (appels, transcriptions, activités,
 * relances, briefs, conversations) et des accès aux outils. Le compte et l'historique d'abonnement restent,
 * pour la facturation et une éventuelle reprise. C'est l'engagement pris dans la politique de confidentialité.
 */
export async function purgeEndedOrgs(now = new Date()) {
  const limit = new Date(now.getTime() - PURGE_AFTER_DAYS * 864e5);
  const orgs = await db.organization.findMany({ where: { subscriptionStatus: "canceled", endedAt: { lt: limit }, purgedAt: null }, select: { id: true }, take: 20 });
  let n = 0;
  for (const o of orgs) {
    if (isAdminOrg(o.id)) continue;
    await db.$transaction([
      db.task.deleteMany({ where: { orgId: o.id } }),
      db.activity.deleteMany({ where: { orgId: o.id } }),
      db.call.deleteMany({ where: { orgId: o.id } }),
      db.brief.deleteMany({ where: { orgId: o.id } }),
      db.coach.deleteMany({ where: { orgId: o.id } }),
      db.conversation.deleteMany({ where: { orgId: o.id } }),
      db.integration.deleteMany({ where: { orgId: o.id } }),
      db.mcpToken.deleteMany({ where: { orgId: o.id } }),
      db.client.updateMany({ where: { orgId: o.id }, data: { shareToken: null } }),
      db.organization.update({ where: { id: o.id }, data: { purgedAt: now } }),
    ]);
    n++;
  }
  return n;
}

/** Durées de conservation (politique de confidentialité) : enregistrements 6 mois, transcriptions 12 mois. Résumés et statistiques sont gardés. */
export const RECORDING_MONTHS = 6, TRANSCRIPT_MONTHS = 12;
const monthsAgo = (n: number, now: Date) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d; };

export async function purgeOldMedia(now = new Date()) {
  // Fichiers stockés chez nous : supprimés un par un, par lots, avant d'effacer leur référence.
  const stored = await db.call.findMany({ where: { startedAt: { lt: monthsAgo(RECORDING_MONTHS, now) }, recordingKey: { not: null } }, select: { id: true, recordingKey: true }, take: 200 });
  for (const c of stored) {
    try { await deleteStored(c.recordingKey!); } catch (e) { console.error("suppression enregistrement", c.id, e); continue; }
    await db.call.update({ where: { id: c.id }, data: { recordingKey: null } });
  }
  const links = await db.call.updateMany({ where: { startedAt: { lt: monthsAgo(RECORDING_MONTHS, now) }, recordingUrl: { not: null } }, data: { recordingUrl: null } });
  const old = await db.call.findMany({ where: { startedAt: { lt: monthsAgo(TRANSCRIPT_MONTHS, now) }, NOT: { transcript: { equals: [] } } }, select: { id: true }, take: 2000 });
  if (old.length) await db.call.updateMany({ where: { id: { in: old.map((c) => c.id) } }, data: { transcript: [], objDetails: [] } });
  return { recordings: stored.length + links.count, transcripts: old.length };
}
