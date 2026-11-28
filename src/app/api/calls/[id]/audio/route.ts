import { db } from "@/lib/db";
import { open } from "@/lib/crypto";
import { checkAudioSig } from "@/lib/audio";
import { getProvider } from "@/lib/providers";
import { hasPremium } from "@/lib/billing";
import { isAudio } from "@/lib/providers/types";

export const maxDuration = 120;
/** Taille maximale relue en mémoire pour servir l'audio par morceaux (environ 2 h d'appel). */
const MAX_BUFFER = 60 * 1024 * 1024;

/** Relais audio signé : lit l'enregistrement chez l'outil avec sa clé, sans jamais l'exposer. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  if (!checkAudioSig(id, u.searchParams.get("exp"), u.searchParams.get("sig"))) return new Response("Lien expiré", { status: 403 });
  const call = await db.call.findUnique({ where: { id }, select: { provider: true, recordingUrl: true, integrationId: true, externalId: true, org: { select: { plan: true } } } });
  if (!call?.recordingUrl) return new Response("Introuvable", { status: 404 });
  // L'écoute des enregistrements est réservée à la formule Premium : vérifié ici aussi, pas seulement à l'affichage.
  if (!hasPremium(call.org)) return new Response("Écoute incluse dans la formule Premium", { status: 402 });
  // Les identifiants de l'outil quand il en faut (Skipcall, lemlist…) ; certains outils (Minari) servent l'audio par lien de partage.
  const integ = call.integrationId ? await db.integration.findUnique({ where: { id: call.integrationId } }) : null;
  let creds: Record<string, string> = {};
  try { if (integ) creds = open<Record<string, string>>(integ.credentials); } catch { /* identifiants illisibles : on tente sans */ }
  const p = getProvider(call.provider);
  const r = p.fetchAudio ? await p.fetchAudio(creds, call.recordingUrl, req.headers.get("range"), call.externalId).catch(() => null) : null;
  if (!isAudio(r)) return new Response("Enregistrement indisponible", { status: 502 });
  // L'outil ne sait pas servir un morceau du fichier (Minari) : on le fait nous-mêmes, sinon l'iPhone refuse de lire
  // et on ne peut pas avancer dans l'enregistrement.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (r.status === 200 && Number(r.headers.get("content-length") || 0) <= MAX_BUFFER) {
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length <= MAX_BUFFER) {
      const base = { "content-type": r.headers.get("content-type") || "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
      if (!range || (!range[1] && !range[2])) return new Response(buf, { status: 200, headers: { ...base, "content-length": String(buf.length) } });
      const start = range[1] ? Number(range[1]) : Math.max(0, buf.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
      if (start >= buf.length || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${buf.length}` } });
      return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...base, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${buf.length}` } });
    }
    return new Response(buf, { status: 200, headers: { "content-type": r.headers.get("content-type") || "audio/mpeg" } });
  }
  const h = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
  h.set("cache-control", "private, max-age=3600");
  return new Response(r.body, { status: r.status, headers: h });
}
