import { db } from "./db";
import { isAdminOrg } from "./admin";

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
