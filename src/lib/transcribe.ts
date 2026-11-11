import { db } from "./db";
import { presignRead } from "./storage";
import { needsRelay, signedAudioPath } from "./audio";
import { trimTranscript, type TranscriptLine } from "./providers/types";

/**
 * Transcription garantie : quand un outil fournit l'enregistrement mais pas la transcription
 * (Ringover, HubSpot, Aircall sans option IA, Zapier, ajout manuel…), Trustpipe transcrit l'audio
 * avec Gladia (société française, données traitées dans l'UE), séparation des interlocuteurs comprise.
 */
const API = "https://api.gladia.io/v2/pre-recorded";
export const transcribeEnabled = () => !!process.env.GLADIA_API_KEY;
const headers = () => ({ "x-gladia-key": process.env.GLADIA_API_KEY!, "Content-Type": "application/json", Accept: "application/json" });

const MIN_SEC = 8; // en dessous, il n'y a rien à transcrire
const MAX_SUBMIT = 25; // nouvelles transcriptions lancées par passage
const STALE_MS = 6 * 3600e3; // une transcription jamais revenue est relancée

const ts = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${String(m).padStart(2, "0")}`) + `:${String(r).padStart(2, "0")}`;
};

/** Convertit le résultat Gladia en répliques. */
export function toTranscript(result: any): TranscriptLine[] {
  const utt: any[] = result?.transcription?.utterances || [];
  const lines: TranscriptLine[] = [];
  for (const u of utt) {
    const text = String(u?.text || "").trim();
    if (!text) continue;
    const s = `Intervenant ${Number(u?.speaker ?? 0) + 1}`;
    const last = lines[lines.length - 1];
    if (last && last.s === s) last.t += " " + text;
    else lines.push({ s, t: text, ts: ts(Number(u?.start) || 0) });
  }
  return trimTranscript(lines);
}

async function submit(audioUrl: string): Promise<string | null> {
  const r = await fetch(API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ audio_url: audioUrl, diarization: true, detect_language: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    console.error("transcription envoi", r.status, (await r.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const j = await r.json().catch(() => ({}));
  return j.id || null;
}

async function fetchResult(job: string): Promise<{ status: string; lines?: TranscriptLine[] }> {
  const r = await fetch(`${API}/${encodeURIComponent(job)}`, { headers: headers(), signal: AbortSignal.timeout(30_000) });
  if (r.status === 404) return { status: "error" };
  if (!r.ok) return { status: "processing" };
  const j = await r.json().catch(() => ({}));
  if (j.status === "done") return { status: "done", lines: toTranscript(j.result) };
  if (j.status === "error") return { status: "error" };
  return { status: "processing" };
}

/**
 * Lance les transcriptions manquantes et récupère celles qui sont prêtes.
 * Appelé après chaque synchro, après un ajout manuel et par la tâche planifiée. Ne lève jamais d'erreur.
 */
export async function processTranscriptions(opts: { orgId?: string; waitMs?: number } = {}): Promise<number> {
  if (!transcribeEnabled()) return 0;
  const scope = opts.orgId ? { orgId: opts.orgId } : {};
  let done = 0;
  try {
    // 1. Nouvelles transcriptions : conversations avec un enregistrement mais sans texte.
    const todo = await db.call.findMany({
      where: { ...scope, transcriptStatus: "none", durationSec: { gte: MIN_SEC }, transcript: { equals: [] }, OR: [{ recordingUrl: { not: null } }, { recordingKey: { not: null } }] },
      orderBy: { startedAt: "desc" },
      take: MAX_SUBMIT,
      select: { id: true, provider: true, recordingUrl: true, recordingKey: true },
    });
    for (const c of todo) {
      const url = c.recordingKey ? await presignRead(c.recordingKey, 6 * 3600)
        : c.recordingUrl && needsRelay(c.provider) ? (process.env.APP_URL || "").replace(/\/$/, "") + signedAudioPath(c.id, 6 * 3600)
        : c.recordingUrl;
      if (!url) continue;
      const job = await submit(url).catch(() => null);
      await db.call.update({ where: { id: c.id }, data: job ? { transcriptStatus: "pending", transcriptJob: job } : { transcriptStatus: "failed" } });
    }
    // 2. Résultats prêts (on attend un peu si demandé, pour les ajouts manuels).
    const until = Date.now() + (opts.waitMs || 0);
    do {
      const pending = await db.call.findMany({ where: { ...scope, transcriptStatus: "pending", transcriptJob: { not: null } }, take: 60, select: { id: true, transcriptJob: true, updatedAt: true } });
      if (!pending.length) break;
      for (const p of pending) {
        const r = await fetchResult(p.transcriptJob!).catch(() => ({ status: "processing" }) as { status: string; lines?: TranscriptLine[] });
        if (r.status === "done") {
          const lines = r.lines || [];
          await db.call.update({ where: { id: p.id }, data: { transcriptStatus: lines.length ? "done" : "failed", transcriptJob: null, ...(lines.length ? { transcript: lines as any, aiStatus: "pending" } : {}) } });
          if (lines.length) done++;
        } else if (r.status === "error" || Date.now() - p.updatedAt.getTime() > STALE_MS) {
          await db.call.update({ where: { id: p.id }, data: { transcriptStatus: "failed", transcriptJob: null } });
        }
      }
      if (Date.now() < until) await new Promise((res) => setTimeout(res, 5000));
    } while (Date.now() < until);
  } catch (e) {
    console.error("transcriptions", e);
  }
  return done;
}
