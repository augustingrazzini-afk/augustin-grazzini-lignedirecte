import { db } from "./db";

/** Incrémente un compteur journalier (atomique) et renvoie la nouvelle valeur. Sert de quota (liens de suivi…). */
export async function bumpUsage(key: string) {
  const day = new Date().toISOString().slice(0, 10);
  const r = await db.$queryRaw<{ count: number }[]>`INSERT INTO "AiUsage" ("key", "day", "count") VALUES (${key}, ${day}, 1)
    ON CONFLICT ("key", "day") DO UPDATE SET "count" = "AiUsage"."count" + 1 RETURNING "count"`;
  return Number(r[0]?.count ?? 0);
}

/** Périmètre « client » donné par un lien de suivi (sans compte), ou null. */
export async function shareApiScope(token: string | undefined | null) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const c = await db.client.findUnique({ where: { shareToken: token }, select: { id: true, orgId: true } });
  return c ? { kind: "client" as const, orgId: c.orgId, clientId: c.id, userId: `share:${c.id}` } : null;
}
