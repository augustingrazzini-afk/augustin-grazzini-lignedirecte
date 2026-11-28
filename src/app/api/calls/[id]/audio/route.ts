import { db } from "@/lib/db";
import { open } from "@/lib/crypto";
import { checkAudioSig } from "@/lib/audio";
import { getProvider } from "@/lib/providers";
import { hasPremium } from "@/lib/billing";
import { isAudio } from "@/lib/providers/types";

export const maxDuration = 120;
/** Taille maximale relue en mémoire pour servir l'audio par morceaux (environ 2 h d'appel). */
const MAX_BUFFER = 60 * 1024 * 1024;

/**
 * Enregistrements gardés en mémoire quelques minutes : le navigateur demande l'audio par morceaux (au chargement, à la lecture,
 * à chaque saut) et, sans cela, chaque morceau retéléchargeait le fichier entier chez l'outil d'appel.
 */
type Entry = { buf: Uint8Array; type: string; at: number };
const TTL = 15 * 60_000, MAX_TOTAL = 150 * 1024 * 1024;
const g = globalThis as unknown as { tpAudio?: Map<string, Entry>; tpAudioPending?: Map<string, Promise<Entry | null>> };
const cache = (g.tpAudio ??= new Map()), pending = (g.tpAudioPending ??= new Map());
const fresh = (id: string) => { const e = cache.get(id); if (e && Date.now() - e.at < TTL) return e; if (e) cache.delete(id); return undefined; };
function remember(id: string, e: Entry) {
  cache.delete(id); cache.set(id, e);
  let total = 0; for (const v of cache.values()) total += v.buf.length;
  for (const [k, v] of cache) { if (total <= MAX_TOTAL || k === id) break; cache.delete(k); total -= v.buf.length; } // les plus anciens d'abord
  return e;
}

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
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  // Enregistrement déjà téléchargé il y a peu (ou en cours de téléchargement par une autre requête) : servi depuis la mémoire.
  let hit: Entry | null = fresh(id) ?? null;
  const wait = hit ? undefined : pending.get(id);
  if (wait) hit = await wait; // sans attente quand rien n'est en cours : la réservation ci-dessous reste immédiate
  let r: Response | null = null;
  if (!hit) {
    const p = getProvider(call.provider);
    const load = (async (): Promise<Entry | null> => {
      r = p.fetchAudio ? await p.fetchAudio(creds, call.recordingUrl!, req.headers.get("range"), call.externalId).catch(() => null) : null;
      if (!isAudio(r)) return null;
      // L'outil ne sait pas servir un morceau du fichier (Minari) : on garde le fichier entier et on sert les morceaux nous-mêmes,
      // sinon l'iPhone refuse de lire et chaque saut dans l'enregistrement retélécharge tout.
      if (r.status !== 200 || Number(r.headers.get("content-length") || 0) > MAX_BUFFER) return null;
      const buf = new Uint8Array(await r.arrayBuffer());
      const e = { buf, type: r.headers.get("content-type") || "audio/mpeg", at: Date.now() };
      return buf.length <= MAX_BUFFER ? remember(id, e) : e; // trop gros pour être gardé : servi une fois, sans mémoire
    })();
    pending.set(id, load);
    try { hit = await load; } finally { pending.delete(id); }
    if (!hit && !isAudio(r)) return new Response("Enregistrement indisponible", { status: 502 });
  }
  if (hit) {
    const { buf, type } = hit;
    const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
    if (!range || (!range[1] && !range[2])) return new Response(buf, { status: 200, headers: { ...base, "content-length": String(buf.length) } });
    const start = range[1] ? Number(range[1]) : Math.max(0, buf.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
    if (start >= buf.length || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${buf.length}` } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...base, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${buf.length}` } });
  }
  // L'outil sert lui-même les morceaux (ou le fichier est trop gros pour la mémoire) : on relaie sa réponse telle quelle.
  r = r as unknown as Response;
  const h = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
  h.set("cache-control", "private, max-age=3600");
  return new Response(r.body, { status: r.status, headers: h });
}
