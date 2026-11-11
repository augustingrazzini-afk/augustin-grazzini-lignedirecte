import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";
import { getProvider } from "./providers";

/**
 * Enregistrements protégés par la clé de l'outil (Skipcall…) : on les relaie via /api/calls/[id]/audio
 * avec un lien signé et limité dans le temps (lecteur audio du client, service de transcription).
 */
const sign = (id: string, exp: number) => createHmac("sha256", process.env.AUTH_SECRET || "").update(`audio:${id}:${exp}`).digest("base64url");

export const needsRelay = (provider: string) => { try { return !!getProvider(provider).fetchAudio; } catch { return false; } };

export function signedAudioPath(id: string, ttlSec = 3 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `/api/calls/${encodeURIComponent(id)}/audio?exp=${exp}&sig=${sign(id, exp)}`;
}

export function checkAudioSig(id: string, exp: string | null, sig: string | null) {
  const e = Number(exp);
  if (!sig || !Number.isFinite(e) || e < Date.now() / 1000) return false;
  return safeEqual(sig, sign(id, e));
}
