import { db } from "@/lib/db";
import { open } from "@/lib/crypto";
import { checkAudioSig } from "@/lib/audio";
import { getProvider } from "@/lib/providers";

export const maxDuration = 120;

/** Relais audio signé : lit l'enregistrement chez l'outil avec sa clé, sans jamais l'exposer. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  if (!checkAudioSig(id, u.searchParams.get("exp"), u.searchParams.get("sig"))) return new Response("Lien expiré", { status: 403 });
  const call = await db.call.findUnique({ where: { id }, select: { provider: true, recordingUrl: true, integrationId: true } });
  if (!call?.recordingUrl || !call.integrationId) return new Response("Introuvable", { status: 404 });
  const integ = await db.integration.findUnique({ where: { id: call.integrationId } });
  if (!integ) return new Response("Introuvable", { status: 404 });
  const p = getProvider(call.provider);
  const r = p.fetchAudio ? await p.fetchAudio(open<Record<string, string>>(integ.credentials), call.recordingUrl, req.headers.get("range")).catch(() => null) : null;
  if (!r || (!r.ok && r.status !== 206)) return new Response("Enregistrement indisponible", { status: 502 });
  const h = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
  h.set("cache-control", "private, max-age=3600");
  return new Response(r.body, { status: r.status, headers: h });
}
