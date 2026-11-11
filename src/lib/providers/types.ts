export type TranscriptLine = { s: string; t: string; ts: string };
export type ObjDetail = { category: string; summary: string; rep_response: string; passed: boolean };

/** Format commun : chaque outil d'appel est converti vers ce type. */
export type NormalizedCall = {
  externalId: string;
  startedAt: Date;
  durationSec: number;
  direction?: "inbound" | "outbound";
  status: string;
  connected: boolean;
  meetingBooked: boolean;
  kind?: "call" | "meeting";
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  contactRef?: string; // identifiant du contact chez le fournisseur
  phone?: string; // jamais stocké : sert uniquement à la clé contact et aux 4 derniers chiffres
  repName?: string;
  listName?: string;
  campaign?: string;
  tags?: string[];
  summary?: string;
  objections?: string[];
  objDetails?: ObjDetail[];
  transcript?: TranscriptLine[];
  recordingUrl?: string | null;
  hasDetail?: boolean; // transcription déjà récupérée
};

export type CredentialField = { key: string; label: string; type?: "text" | "password"; help?: string; optional?: boolean };

export type Provider = {
  id: string;
  label: string;
  beta?: boolean;
  credentialFields: CredentialField[];
  help: string;
  /** Vérifie les identifiants ; lève une erreur lisible sinon. */
  test(creds: Record<string, string>): Promise<void>;
  /** Appels depuis `since`, page par page. */
  list(creds: Record<string, string>, since: Date): AsyncGenerator<NormalizedCall[]>;
  /** Complète un appel (transcription, objections). Optionnel. */
  details?(creds: Record<string, string>, externalId: string): Promise<Partial<NormalizedCall> | null>;
  /** Extrait l'id d'appel d'un webhook, s'il y en a un. */
  webhookCallId?(payload: unknown): string | null;
};

export class ProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export async function http(url: string, init: RequestInit & { label: string }): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ProviderError(`${init.label} ne répond pas. Réessayez plus tard.`);
  }
  if (r.status === 401 || r.status === 403) throw new ProviderError(`${init.label} refuse la clé API (vérifiez-la ou ses droits).`, r.status);
  if (r.status === 429) throw new ProviderError(`${init.label} limite le nombre de requêtes : nouvelle tentative au prochain passage.`, 429);
  if (!r.ok) throw new ProviderError(`${init.label} a répondu ${r.status}.`, r.status);
  const text = await r.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderError(`${init.label} a renvoyé une réponse illisible.`);
  }
}

// Petits utilitaires de lecture tolérante
export const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function stripHtml(h: unknown): string {
  return str(h)
    .replace(/<li>\s*/gi, "- ")
    .replace(/<\/(li|p|ul|div|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
export function msToTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function trimTranscript(lines: TranscriptLine[], max = 60000): TranscriptLine[] {
  let n = 0;
  const out: TranscriptLine[] = [];
  for (const l of lines) {
    n += l.t.length;
    if (n > max) break;
    out.push(l);
  }
  return out;
}
export const OBJECTION_KEYS = ["relevance", "incumbent", "timing", "too_busy", "authority", "budget", "other"] as const;
