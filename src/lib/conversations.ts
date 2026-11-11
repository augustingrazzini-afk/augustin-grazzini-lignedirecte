import { db } from "./db";
import { apiScope, scopeClientId, type Scope } from "./access";
import { shareApiScope } from "./usage";

/** Historique de l'assistant : chaque personne (ou lien de suivi) ne voit que ses conversations, dans l'espace courant. */
export async function chatScope(req: Request, o: { clientId?: string | null; shareToken?: string | null }): Promise<Scope | null> {
  if (o.shareToken) return shareApiScope(o.shareToken);
  return apiScope(req, { clientId: o.clientId ?? null });
}

export const ownerWhere = (scope: Scope) => ({ owner: String(scope.userId || ""), orgId: scope.orgId, clientId: scopeClientId(scope) ?? null });

const MAX_KEPT = 60; // conversations gardées par personne et par espace

export function titleOf(q: string) {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 70 ? t.slice(0, 67).trimEnd() + "…" : t || "Conversation";
}

/** Enregistre la conversation (création ou mise à jour) et renvoie son identifiant. Ne lève jamais d'erreur. */
export async function saveConversation(scope: Scope, id: string | null | undefined, messages: { role: string; content: string; local?: boolean }[]): Promise<string | null> {
  try {
    const where = ownerWhere(scope);
    if (!where.owner) return null;
    if (id) {
      const r = await db.conversation.updateMany({ where: { id, ...where }, data: { messages: messages as any } });
      if (r.count) return id;
    }
    const c = await db.conversation.create({ data: { ...where, title: titleOf(messages.find((m) => m.role === "user")?.content || ""), messages: messages as any }, select: { id: true } });
    const old = await db.conversation.findMany({ where, orderBy: { updatedAt: "desc" }, skip: MAX_KEPT, select: { id: true } });
    if (old.length) await db.conversation.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return c.id;
  } catch (e) {
    console.error("historique assistant", e);
    return null;
  }
}
