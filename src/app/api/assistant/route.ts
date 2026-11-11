import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope, scopeClientId } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { AiError, aiEnabled } from "@/lib/ai";
import { askAssistant } from "@/lib/assistant";

export const maxDuration = 120;

const Body = z.object({
  clientId: z.string().max(40).nullable().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(40),
});

/** Chatbot : réservé aux personnes connectées, limité à leur périmètre (espace SDR ou espace client). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Requête invalide");
  const msgs = b.data.messages;
  if (msgs[0].role !== "user" || msgs[msgs.length - 1].role !== "user") return jsonError("Requête invalide");
  if (!aiEnabled()) return jsonError("L'IA n'est pas encore activée sur ce serveur.", 503);
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const blocked = await assertActive(scope);
  if (blocked) return blocked;
  const clientId = scopeClientId(scope);
  const [org, client] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: scope.orgId } }),
    clientId ? db.client.findUnique({ where: { id: clientId } }) : Promise.resolve(null),
  ]);
  try {
    const r = await askAssistant(scope, msgs, {
      who: client ? `${client.name} (suivi par ${org.name})` : org.name,
      offer: client?.offer || org.offer,
      isClient: scope.kind === "client",
    });
    return NextResponse.json(r);
  } catch (e) {
    if (!(e instanceof AiError)) console.error("assistant", e);
    return jsonError(e instanceof AiError ? e.message : "L'assistant n'a pas pu répondre.", 502);
  }
}
