import { NextResponse, after } from "next/server";
import { z } from "zod";
import { debriefPending, processPendingAi } from "@/lib/ai";
import { apiScope, scopeClientId } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { upsertCalls } from "@/lib/ingest";
import { processTranscriptions } from "@/lib/transcribe";
import { bumpUsage, shareApiScope } from "@/lib/usage";
import { OBJECTION_KEYS, trimTranscript } from "@/lib/providers/types";

// La synchro / l'analyse IA continuent après la réponse (after) : on laisse le temps de finir.
export const maxDuration = 300;

const Line = z.object({ s: z.string().max(80), t: z.string().max(5000), ts: z.string().max(12) });
const Row = z.object({
  externalId: z.string().min(1).max(120),
  startedAt: z.string().datetime(),
  durationSec: z.number().int().min(0).max(86400),
  status: z.string().max(60),
  connected: z.boolean(),
  meetingBooked: z.boolean(),
  kind: z.enum(["call", "meeting"]).default("call"),
  firstName: z.string().max(120).default(""),
  lastName: z.string().max(120).default(""),
  company: z.string().max(200).default(""),
  jobTitle: z.string().max(200).default(""),
  repName: z.string().max(120).default(""),
  listName: z.string().max(200).default(""),
  summary: z.string().max(8000).default(""),
  objections: z.array(z.string()).max(10).default([]),
  transcript: z.array(Line).max(3000).default([]),
  recordingUrl: z.string().url().max(2000).startsWith("https://").nullable().optional(),
  recordingKey: z.string().max(300).nullable().optional(),
});
const Body = z.object({ source: z.enum(["csv", "manual"]), clientId: z.string().nullable().optional(), shareToken: z.string().min(20).max(100).optional(), rows: z.array(Row).min(1).max(1000) });

/** Import CSV et ajout manuel. Un utilisateur de portail client ne peut écrire que chez son client. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Données invalides : " + parsed.error.issues[0]?.message);
  const { source, rows } = parsed.data;
  // Lien de suivi (client sans compte) : uniquement ses propres rendez-vous, avec un quota journalier.
  const share = await shareApiScope(parsed.data.shareToken);
  if (parsed.data.shareToken && !share) return jsonError("Lien de suivi invalide", 403);
  if (share) {
    if (rows.some((r) => r.kind !== "meeting" || r.recordingKey)) return jsonError("Depuis le lien de suivi, vous pouvez ajouter uniquement des rendez-vous.", 403);
    if (rows.some((r) => !r.transcript.length && !r.recordingUrl)) return jsonError("Chaque rendez-vous doit avoir sa transcription ou son enregistrement.");
    if ((await bumpUsage(`import:${share.clientId}`)) > 40) return jsonError("Limite d'ajouts atteinte pour aujourd'hui. Réessayez demain.", 429);
  }
  const scope = share ?? (await apiScope(req, { clientId: parsed.data.clientId }));
  if (!scope) return jsonError("Accès refusé", 403);
  const blocked = await assertActive(scope);
  if (blocked) return blocked;
  const clientId = scopeClientId(scope);

  for (const r of rows) if (r.recordingKey && !r.recordingKey.startsWith(scope.orgId + "/")) return jsonError("Fichier d'enregistrement invalide", 403);

  const res = await upsertCalls(
    { orgId: scope.orgId, provider: source, clientId },
    rows.map((r) => ({
      ...r,
      startedAt: new Date(r.startedAt),
      objections: r.objections.filter((k) => (OBJECTION_KEYS as readonly string[]).includes(k)),
      transcript: trimTranscript(r.transcript),
      recordingUrl: r.recordingUrl ?? null,
    })),
  );
  // Fichiers d'enregistrement envoyés chez nous
  for (const r of rows.filter((x) => x.recordingKey)) {
    await db.call.updateMany({ where: { orgId: scope.orgId, provider: source, externalId: r.externalId }, data: { recordingKey: r.recordingKey } });
  }
  // Analyse IA des appels importés juste après la réponse.
  const orgId = scope.orgId;
  // Enregistrement sans transcription : transcrit d'abord (jusqu'à ~2 min), puis analyse et débrief IA.
  after(async () => {
    await processTranscriptions({ orgId, waitMs: 120_000 });
    await processPendingAi({ orgId, limit: 100 }).catch((e) => console.error("analyse IA import", e));
    await debriefPending({ orgId });
  });
  return NextResponse.json(res);
}
