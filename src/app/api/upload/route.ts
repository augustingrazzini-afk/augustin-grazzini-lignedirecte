import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { presignUpload, storageEnabled } from "@/lib/storage";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const b = z.object({ contentType: z.string(), size: z.number().int().positive(), clientId: z.string().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Requête invalide");
  const scope = await apiScope(req, { clientId: b.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const blocked = await assertActive(scope);
  if (blocked) return blocked;
  if (!storageEnabled()) return jsonError("L'envoi de fichiers n'est pas encore activé : collez un lien vers l'enregistrement.", 503);
  try {
    return NextResponse.json(await presignUpload(scope.orgId, b.data.contentType, b.data.size));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Envoi impossible");
  }
}
