import Anthropic from "@anthropic-ai/sdk";
import { Prisma, type Activity, type Call } from "@prisma/client";
import { db } from "./db";
import { OBJECTION_KEYS, type TranscriptLine } from "./providers/types";
import { OBJ_LABEL, fmtDuration, isConversation, displayName } from "./format";
import { runPool } from "./pool";
import { closeTasksOnMeeting, upsertTask, type TaskDraft } from "./tasks";

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic());
export const AI_MODEL = MODEL;
export { aiEnabled } from "./ai-config";
import { aiEnabled, markAiDown } from "./ai-config";

export class AiError extends Error {}

/** Un appel à Claude qui renvoie un JSON conforme au schéma (sorties structurées). */
async function json<T>(prompt: string, schema: Record<string, unknown>, effort: "low" | "medium" | "high" = "medium"): Promise<T> {
  if (!aiEnabled()) throw new AiError("L'IA n'est pas configurée sur ce serveur (ANTHROPIC_API_KEY).");
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    console.error("anthropic analyse", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("L'IA est très sollicitée. Réessayez dans une minute.");
    if (e instanceof Anthropic.AuthenticationError) { markAiDown(); throw new AiError("Clé API Claude invalide sur ce serveur."); }
    if (e instanceof Anthropic.APIError) throw new AiError(`L'IA a renvoyé une erreur (${e.status}).`);
    throw new AiError("L'IA ne répond pas. Réessayez.");
  }
  if (res.stop_reason === "refusal") throw new AiError("L'IA a refusé de traiter ce contenu.");
  if (res.stop_reason === "max_tokens") throw new AiError("La réponse de l'IA a été coupée. Réessayez avec moins d'appels.");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("Réponse de l'IA illisible. Réessayez.");
  }
}

const strArr = { type: "array", items: { type: "string" } };
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

/* ---------- 1. Analyse d'un appel (résumé + objections) ---------- */
const FOLLOW_UP = obj({
  needed: { type: "boolean" },
  date: { type: "string", description: "Date de relance AAAA-MM-JJ, ou chaîne vide" },
  channel: { type: "string", enum: ["call", "email", "linkedin"] },
  reason: { type: "string", description: "Pourquoi relancer, en une phrase courte" },
  suggestion: { type: "string", description: "Message ou phrase d'accroche prêt à utiliser pour la relance" },
});
const ANALYSIS_SCHEMA = obj({
  summary: { type: "string", description: "3 à 5 puces commençant par '- '" },
  objections: { type: "array", items: { type: "string", enum: [...OBJECTION_KEYS] } },
  meeting_booked: { type: "boolean" },
  follow_up: FOLLOW_UP,
});
type FollowUp = { needed: boolean; date: string; channel: "call" | "email" | "linkedin"; reason: string; suggestion: string };
const today = () => new Date().toISOString().slice(0, 10);
const followRules = () => `Relance (follow_up) : needed = true seulement si une suite est attendue (rappel demandé, email ou document à envoyer, « revenez vers moi plus tard », absent, intérêt à concrétiser). needed = false si refus net, demande de ne plus être contacté ou RDV déjà fixé. date = la date de relance (AAAA-MM-JJ) déduite des propos (« en mars » = 1er mars prochain, « dans 6 mois », « la semaine prochaine »), sinon dans 2 à 7 jours ouvrés selon l'urgence. Nous sommes le ${today()}.`;
function draft(f: FollowUp, from: Date): TaskDraft | null {
  if (!f?.needed) return null;
  let d = /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? new Date(f.date + "T08:00:00Z") : new Date(from.getTime() + 3 * 864e5);
  if (Number.isNaN(d.getTime()) || d.getTime() < from.getTime() - 864e5) d = new Date(from.getTime() + 3 * 864e5);
  return { channel: f.channel, dueAt: d, reason: f.reason || "Relance à faire", suggestion: f.suggestion };
}

function transcriptText(t: TranscriptLine[], max = 40000) {
  return t.map((l) => `${l.ts ? `[${l.ts}] ` : ""}${l.s ? l.s + " : " : ""}${l.t}`).join("\n").slice(0, max);
}

export async function analyzeCall(call: Pick<Call, "id" | "kind" | "transcript" | "summary" | "orgId" | "clientId" | "contactKey" | "firstName" | "lastName" | "company" | "startedAt">) {
  const tr = (call.transcript as unknown as TranscriptLine[]) || [];
  if (!tr.length) return;
  const r = await json<{ summary: string; objections: string[]; meeting_booked: boolean; follow_up: FollowUp }>(
    `Analyse cette transcription ${call.kind === "meeting" ? "de rendez-vous commercial mené par un AE" : "d'appel de prospection téléphonique B2B"}.
Rédige en français un résumé de 3 à 5 puces (contexte, besoin, objections, issue, prochaine étape) sans rien inventer.
Classe les objections du prospect parmi : relevance (pas pertinent / pas de besoin), incumbent (solution déjà en place), timing (pas le moment), too_busy (pas le temps), authority (pas décideur), budget, other.
meeting_booked = true seulement si un rendez-vous est explicitement fixé.
${followRules()}
${call.summary ? `\nNotes existantes :\n${call.summary.slice(0, 2000)}\n` : ""}
TRANSCRIPTION :
${transcriptText(tr)}`,
    ANALYSIS_SCHEMA,
    "low",
  );
  await db.call.update({
    where: { id: call.id },
    data: {
      summary: call.summary?.trim() ? call.summary : r.summary,
      objections: r.objections.filter((k) => (OBJECTION_KEYS as readonly string[]).includes(k)),
      ...(r.meeting_booked ? { meetingBooked: true } : {}),
      aiStatus: "done",
    },
  });
  if (r.meeting_booked) return closeTasksOnMeeting(call.orgId, call.contactKey);
  const d = draft(r.follow_up, call.startedAt);
  if (d) await upsertTask(call, "call", call.id, d, "ai");
}

/* ---------- 1 ter. Débrief d'un rendez-vous (avec l'appel de prospection qui l'a obtenu) ---------- */
export type Debrief = {
  verdict: string; score: number; worked: string[]; missed: string[];
  objections: { objection: string; handled: boolean; comment: string }[];
  coherence: string; advice: string[]; next_step: string;
};
const DEBRIEF_SCHEMA = obj({
  verdict: { type: "string", description: "Une phrase : comment s'est passé le rendez-vous" },
  score: { type: "integer", description: "Note du rendez-vous de 1 à 10" },
  worked: { ...strArr, description: "Ce qui a bien marché (2 à 4 points concrets)" },
  missed: { ...strArr, description: "Ce qui n'a pas marché ou a manqué (2 à 4 points concrets)" },
  objections: { type: "array", items: obj({ objection: { type: "string" }, handled: { type: "boolean" }, comment: { type: "string" } }) },
  coherence: { type: "string", description: "Cohérence avec l'appel de prospection : besoins et promesses repris ou oubliés. Chaîne vide si aucun appel." },
  advice: { ...strArr, description: "3 à 5 conseils concrets et actionnables pour le prochain rendez-vous ou la relance" },
  next_step: { type: "string", description: "La prochaine étape recommandée, en une phrase" },
});

/** Débrief IA d'un rendez-vous : ce qui a marché, ce qui a manqué, cohérence avec l'appel de prospection, conseils. */
export async function debriefMeeting(id: string) {
  const m = await db.call.findUnique({ where: { id } });
  if (!m || m.kind !== "meeting") return null;
  const tr = (m.transcript as unknown as TranscriptLine[]) || [];
  if (!tr.length) return null; // le débrief part toujours de la transcription
  const before = m.contactKey
    ? await db.call.findMany({ where: { orgId: m.orgId, contactKey: m.contactKey, kind: "call", startedAt: { lte: m.startedAt }, connected: true }, orderBy: { startedAt: "desc" }, take: 3 })
    : [];
  const prior = before.map((c, i) => {
    const t = (c.transcript as unknown as TranscriptLine[]) || [];
    return `### Appel de prospection ${i + 1} (${c.startedAt.toISOString().slice(0, 10)}${c.meetingBooked ? ", RDV pris" : ""})
Résumé : ${c.summary || "—"}
Objections : ${c.objections.join(", ") || "—"}${i === 0 && t.length ? `\nExtrait de la transcription :\n${transcriptText(t, 8000)}` : ""}`;
  }).join("\n\n");
  const r = await json<Debrief>(
    `Tu es un coach commercial B2B. Fais le débrief de ce rendez-vous commercial, en français, sans rien inventer.
Sois concret et utile pour le commercial qui a mené le rendez-vous : ce qui a marché, ce qui a manqué, les objections et leur traitement, puis des conseils actionnables.
${prior ? "Compare avec ce qui avait été dit lors de l'appel de prospection : besoins exprimés, promesses faites, objections annoncées. Signale ce qui a été repris et ce qui a été oublié." : "Aucun appel de prospection n'est rattaché à ce prospect : laisse coherence vide."}
Prospect : ${[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}${m.company ? `, ${m.company}` : ""}${m.jobTitle ? ` (${m.jobTitle})` : ""}

${prior ? prior + "\n\n" : ""}### Le rendez-vous (${m.startedAt.toISOString().slice(0, 10)})
${m.summary ? `Notes : ${m.summary.slice(0, 3000)}\n` : ""}${tr.length ? `Transcription :\n${transcriptText(tr, 40000)}` : ""}`,
    DEBRIEF_SCHEMA,
    "medium",
  );
  r.score = Math.max(1, Math.min(10, Math.round(r.score || 5)));
  await db.call.update({ where: { id }, data: { debrief: r as any } });
  return r;
}

/** Débriefs manquants (rendez-vous ajoutés avec seulement des notes, ou analysés avant cette fonctionnalité). */
export async function debriefPending(opts: { orgId?: string; limit?: number } = {}) {
  if (!aiEnabled()) return 0;
  const todo = await db.call.findMany({
    where: { ...(opts.orgId ? { orgId: opts.orgId } : {}), kind: "meeting", debrief: { equals: Prisma.DbNull }, aiStatus: { notIn: ["pending", "processing"] }, NOT: { transcript: { equals: [] } } },
    orderBy: { startedAt: "desc" }, take: opts.limit ?? 10, select: { id: true },
  });
  let n = 0;
  for (const t of todo) { try { if (await debriefMeeting(t.id)) n++; } catch (e) { console.error("débrief", t.id, e); if (e instanceof AiError && /sollicitée/.test(e.message)) break; } }
  return n;
}

/* ---------- 1 bis. Classement d'une réponse email / LinkedIn ---------- */
const REPLY_SCHEMA = obj({
  sentiment: { type: "string", enum: ["positive", "neutral", "negative", "ooo", "objection"] },
  objections: { type: "array", items: { type: "string", enum: [...OBJECTION_KEYS] } },
  meeting_booked: { type: "boolean" },
  follow_up: FOLLOW_UP,
});

export async function classifyActivity(a: Activity) {
  const r = await json<{ sentiment: string; objections: string[]; meeting_booked: boolean; follow_up: FollowUp }>(
    `Voici la réponse d'un prospect à une prospection ${a.channel === "linkedin" ? "LinkedIn" : "par email"} B2B.
Classe-la : positive (intérêt, demande d'infos ou de RDV), neutral, negative (refus, ne plus contacter), ooo (absence / message automatique), objection (objection argumentée).
Objections parmi : relevance, incumbent, timing, too_busy, authority, budget, other. meeting_booked = true seulement si un créneau est accepté.
${followRules()}
${a.subject ? `Objet : ${a.subject}
` : ""}RÉPONSE :
${a.body.slice(0, 12000)}`,
    REPLY_SCHEMA,
    "low",
  );
  await db.activity.update({ where: { id: a.id }, data: { sentiment: r.sentiment, objections: r.objections.filter((k) => (OBJECTION_KEYS as readonly string[]).includes(k)), aiStatus: "done" } });
  if (r.meeting_booked) {
    await db.activity.create({ data: { orgId: a.orgId, clientId: a.clientId, provider: a.provider, externalId: `${a.externalId}:meeting`, channel: a.channel, type: "meeting_booked", occurredAt: a.occurredAt, firstName: a.firstName, lastName: a.lastName, company: a.company, jobTitle: a.jobTitle, contactKey: a.contactKey, repName: a.repName, campaign: a.campaign } }).catch(() => {});
    return closeTasksOnMeeting(a.orgId, a.contactKey);
  }
  const d = draft(r.follow_up, a.occurredAt);
  if (d) await upsertTask(a, "activity", a.id, d, "ai");
}

/** Un appel réservé (« processing ») depuis plus longtemps que ça est considéré comme abandonné. */
const STALE_PROCESSING_MS = 15 * 60e3;

/** Remet en file les analyses abandonnées (fonction coupée en cours de route). */
export async function requeueStaleAi() {
  const r = await db.call.updateMany({
    where: { aiStatus: "processing", updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    data: { aiStatus: "pending" },
  });
  return r.count;
}

/**
 * Analyse les appels en attente. Appelé juste après chaque arrivée d'appels (synchro, webhook, import)
 * pour l'organisation concernée, et par la tâche planifiée en filet de sécurité pour tout le monde.
 * Chaque appel est réservé avant analyse : deux traitements simultanés ne l'analysent jamais deux fois.
 */
export async function processPendingAi(opts: { orgId?: string; limit?: number; concurrency?: number; deadline?: number } = {}) {
  if (!aiEnabled()) return 0;
  const { orgId, limit = 15, concurrency = 4, deadline } = opts;
  const scope = orgId ? { orgId } : {};

  // Réponses email / LinkedIn à classer. Pas de réservation ici : la relance créée est idempotente
  // (une par source), donc une double analyse éventuelle ne crée pas de doublon.
  const replies = await db.activity.findMany({ where: { aiStatus: "pending", ...scope }, orderBy: { occurredAt: "desc" }, take: limit });
  let busy = false;
  await runPool(replies, concurrency, async (a) => {
    try { await classifyActivity(a); } catch (e) {
      await db.activity.update({ where: { id: a.id }, data: { aiStatus: "failed" } });
      if (e instanceof AiError && /sollicitée/.test(e.message)) { busy = true; return false; }
    }
  }, deadline);
  if (busy) return 0;

  // Appels transcrits : chaque appel est réservé avant analyse.
  const todo = await db.call.findMany({
    where: { aiStatus: "pending", ...scope },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true },
  });
  let analyzed = 0;
  await runPool(todo, concurrency, async ({ id }) => {
    const claim = await db.call.updateMany({ where: { id, aiStatus: "pending" }, data: { aiStatus: "processing" } });
    if (claim.count !== 1) return; // déjà pris par un autre traitement
    const c = await db.call.findUnique({ where: { id } });
    if (!c) return;
    try {
      await analyzeCall(c);
      analyzed++;
      if (c.kind === "meeting") await debriefMeeting(c.id).catch((e) => console.error("débrief", c.id, e));
    } catch (e) {
      const busy = e instanceof AiError && /sollicitée|invalide|configurée/.test(e.message);
      // Limite de débit ou clé refusée : on remet l'appel en file au lieu de le marquer en échec, et on s'arrête là.
      await db.call.update({ where: { id }, data: { aiStatus: busy ? "pending" : "failed" } });
      if (busy) return false;
    }
  }, deadline);
  return analyzed;
}

/* ---------- 2. Brief pré-meeting ---------- */
export type Brief = {
  prospect: string; entreprise: string; poste: string; chaleur: number; resume: string;
  contexte: string[]; besoins: string[]; objections: { objection: string; reponse: string }[];
  angle: string; questions: string[]; eviter: string[]; prochaine_etape: string;
};
const BRIEF_SCHEMA = obj({
  prospect: { type: "string" }, entreprise: { type: "string" }, poste: { type: "string" },
  chaleur: { type: "integer", description: "Intérêt réel estimé, de 0 à 100" },
  resume: { type: "string" }, contexte: strArr, besoins: strArr,
  objections: { type: "array", items: obj({ objection: { type: "string" }, reponse: { type: "string" } }) },
  angle: { type: "string" }, questions: strArr, eviter: strArr, prochaine_etape: { type: "string" },
});

export async function generateBrief(calls: Call[], query: string, offer: string, sellerName: string, acts: Activity[] = []): Promise<Brief> {
  let budget = 18000;
  const dossier = calls.slice(0, 12).map((c, i) => {
    let t = `### Appel ${i + 1} — ${c.startedAt.toISOString().slice(0, 16).replace("T", " ")} — ${fmtDuration(c.durationSec)}${c.meetingBooked ? ", RDV PRIS" : ""}${c.kind === "meeting" ? " (rendez-vous AE)" : ""}
Prospect : ${displayName(c)}, ${c.jobTitle || "?"} chez ${c.company || "?"}
Résumé :\n${c.summary || "(aucun)"}
Objections : ${c.objections.map((o) => OBJ_LABEL[o] || o).join(", ") || "aucune"}`;
    const tr = (c.transcript as unknown as TranscriptLine[]) || [];
    if (tr.length && budget > 0) {
      const s = transcriptText(tr, Math.min(6000, budget));
      budget -= s.length;
      t += `\nTranscription (extrait) :\n${s}`;
    }
    return t;
  }).join("\n\n");
  const written = acts.filter((a) => ["replied", "sent", "message_sent", "invite_accepted", "meeting_booked"].includes(a.type)).slice(0, 25).map((a) =>
    `- ${a.occurredAt.toISOString().slice(0, 10)} · ${a.channel === "linkedin" ? "LinkedIn" : "Email"} · ${a.type}${a.subject ? ` · « ${a.subject} »` : ""}${a.sentiment ? ` · ${a.sentiment}` : ""}${a.type === "replied" && a.body ? `\n  ${a.body.slice(0, 1200).replace(/\n/g, " ")}` : ""}`).join("\n");
  const b = await json<Brief>(
    `Tu es un directeur commercial B2B senior. Un commercial de ${sellerName} a bientôt un rendez-vous avec ce prospect. À partir de l'historique ci-dessous, rédige un brief pré-meeting en français, concret et actionnable. N'invente aucun fait : si une information manque, laisse le champ vide.

CE QUE VEND ${sellerName.toUpperCase()} :
${offer || "(non renseigné : déduis-le des appels si possible)"}

RECHERCHE : « ${query} »

HISTORIQUE DES APPELS (du plus récent au plus ancien) :
${dossier || "(aucun appel)"}

ÉCHANGES EMAIL ET LINKEDIN :
${written || "(aucun)"}

Consignes : resume en 2-3 phrases ; contexte et besoins en puces courtes ; 2 à 4 objections probables formulées comme le prospect les dirait, avec une réponse recommandée ; angle = comment ouvrir le rendez-vous ; 3 à 5 questions de découverte ; 2 à 4 erreurs à éviter ; prochaine_etape = l'objectif concret à obtenir en fin de rendez-vous.`,
    BRIEF_SCHEMA,
    "medium",
  );
  b.chaleur = Math.max(0, Math.min(100, Math.round(b.chaleur || 0)));
  return b;
}

/* ---------- 3. Coach ---------- */
export type CoachResult = { diagnostic: string; priorites: { titre: string; detail: string; impact: string }[]; accroche: string; objections: { objection: string; reponse: string }[]; ciblage: string };
const COACH_SCHEMA = obj({
  diagnostic: { type: "string" },
  priorites: { type: "array", items: obj({ titre: { type: "string" }, detail: { type: "string" }, impact: { type: "string" } }) },
  accroche: { type: "string" },
  objections: { type: "array", items: obj({ objection: { type: "string" }, reponse: { type: "string" } }) },
  ciblage: { type: "string" },
});

export async function generateCoach(stats: { total: number; connected: number; conversations: number; meetings: number }, objections: { key: string; count: number }[], calls: Call[], offer: string, sellerName: string, days: number): Promise<CoachResult> {
  const sums = calls.filter(isConversation).slice(0, 40).map((c) => `- [${c.meetingBooked ? "RDV" : "conv"}] ${c.jobTitle} @ ${c.company} (${fmtDuration(c.durationSec)}) : ${c.summary.replace(/\n/g, " ").slice(0, 380)}`).join("\n");
  return json<CoachResult>(
    `Tu es un coach de prospection téléphonique B2B. Voici les données d'appels de ${sellerName} sur ${days} jours. Donne un plan d'action concret en français, appuyé uniquement sur ces données.

OFFRE : ${offer || "(non renseignée)"}
STATISTIQUES : ${stats.total} appels, ${stats.connected} décrochés, ${stats.conversations} conversations, ${stats.meetings} rendez-vous.
OBJECTIONS : ${objections.map((o) => `${OBJ_LABEL[o.key] || o.key} ${o.count}`).join(", ") || "aucune"}
CONVERSATIONS :
${sums || "(aucune)"}

Donne : un diagnostic franc de 3-4 phrases ; exactement 3 priorités (action courte, comment faire, effet attendu) ; une accroche d'appel de 2-3 phrases prête à dire ; 3 à 5 objections fréquentes avec la réponse recommandée ; 2-3 phrases sur les profils à privilégier ou éviter.`,
    COACH_SCHEMA,
    "medium",
  );
}

export const asJson = (v: unknown) => v as Prisma.InputJsonValue;
