import { NextResponse } from "next/server";
import { z } from "zod";
import { apiScope, scopeClientId } from "@/lib/access";
import { assertActive, jsonError, sameOrigin } from "@/lib/api";
import { upsertActivities } from "@/lib/ingest";
import { ACTIVITY_TYPES } from "@/lib/providers/types";

const Row = z.object({
  externalId: z.string().min(1).max(120),
  channel: z.enum(["email", "linkedin"]),
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: z.string().datetime(),
  firstName: z.string().max(120).default(""),
  lastName: z.string().max(120).default(""),
  company: z.string().max(200).default(""),
  jobTitle: z.string().max(200).default(""),
  email: z.string().max(254).optional(),
  linkedinUrl: z.string().max(500).optional(),
  repName: z.string().max(120).default(""),
  campaign: z.string().max(200).default(""),
  step: z.number().int().min(0).max(100).nullable().optional(),
  subject: z.string().max(300).default(""),
  body: z.string().max(8000).default(""),
});
const Body = z.object({ source: z.enum(["csv", "manual"]), clientId: z.string().nullable().optional(), rows: z.array(Row).min(1).max(1000) });

/** Import CSV / ajout manuel d'événements email et LinkedIn. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Données invalides : " + parsed.error.issues[0]?.message);
  const scope = await apiScope(req, { clientId: parsed.data.clientId });
  if (!scope) return jsonError("Accès refusé", 403);
  const blocked = await assertActive(scope);
  if (blocked) return blocked;
  const r = await upsertActivities(
    { orgId: scope.orgId, provider: parsed.data.source, clientId: scopeClientId(scope) },
    parsed.data.rows.map((x) => ({ ...x, occurredAt: new Date(x.occurredAt) })),
  );
  return NextResponse.json(r);
}
