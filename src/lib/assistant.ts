// Assistant IA (chatbot) : Claude répond aux questions sur la prospection en interrogeant les données
// via des outils. Chaque outil applique le périmètre de la personne connectée (callScope / activityScope) :
// un client ne voit jamais que ses propres appels, emails et messages LinkedIn.
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { callScope, scopeClientId, type Scope } from "./access";
import { db } from "./db";
import { AI_MODEL, AiError, anthropic } from "./ai";
import { activityScope, channelOverview } from "./channels";
import { OBJ_LABEL, displayName, fmtDuration, isConversation } from "./format";
import { periodStart } from "./period";
import { bestSlot, computeStats, windowCalls } from "./stats";
import type { TranscriptLine } from "./providers/types";

const DAYS = { type: "integer", description: "Période en jours (1 = aujourd'hui, 7, 30, 90, 365). Par défaut 30.", enum: [1, 7, 30, 90, 365] } as const;
const day = (d: Date) => d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "stats",
    description: "Statistiques de prospection sur une période : appels (volume, décroché, conversations, RDV, taux, objections, meilleur créneau, par commercial), emails et LinkedIn (envois, réponses, positives, RDV, par campagne). À utiliser pour toute question chiffrée ou de diagnostic.",
    input_schema: { type: "object", properties: { days: DAYS }, additionalProperties: false },
  },
  {
    name: "search_calls",
    description: "Cherche des appels. Renvoie pour chacun : id, date, prospect, entreprise, poste, durée, résultat, commercial, objections et début du résumé. Utilisez query pour un nom, une entreprise ou un mot du résumé.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nom, entreprise ou mot-clé (facultatif)" },
        days: DAYS,
        filter: { type: "string", enum: ["conversations", "meetings", "all"], description: "conversations (par défaut), meetings = RDV pris, all = tous les appels" },
        objection: { type: "string", enum: Object.keys(OBJ_LABEL), description: "Ne garder que les appels avec cette objection" },
        limit: { type: "integer", description: "1 à 40, 15 par défaut" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_call",
    description: "Détail complet d'un appel par son id : résumé, objections (passées ou non), notes et transcription.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "search_messages",
    description: "Cherche dans les emails et LinkedIn : réponses des prospects (avec leur texte et leur tonalité), envois, invitations, RDV.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nom, entreprise, campagne ou mot du message (facultatif)" },
        channel: { type: "string", enum: ["email", "linkedin"] },
        days: DAYS,
        only_replies: { type: "boolean", description: "Uniquement les réponses (par défaut true)" },
        limit: { type: "integer", description: "1 à 40, 15 par défaut" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "prospect_history",
    description: "Tout l'historique d'un prospect ou d'une entreprise, tous canaux confondus (appels avec résumés, emails, LinkedIn, relances), du plus récent au plus ancien. Idéal pour préparer un rendez-vous.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Nom du prospect ou de son entreprise" } }, required: ["name"], additionalProperties: false },
  },
  {
    name: "list_followups",
    description: "Relances à faire (en retard, aujourd'hui, à venir), avec le prospect, le canal, la raison et la date.",
    input_schema: { type: "object", properties: { limit: { type: "integer", description: "1 à 40, 20 par défaut" } }, additionalProperties: false },
  },
];

const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);
const pickDays = (n: unknown) => ([1, 7, 30, 90, 365].includes(n as number) ? (n as number) : 30);
const like = (q: string) => ({ contains: q, mode: "insensitive" as const });
const taskScope = (s: Scope): Prisma.TaskWhereInput => (s.kind === "client" ? { orgId: s.orgId, clientId: s.clientId } : { orgId: s.orgId, ...(scopeClientId(s) ? { clientId: scopeClientId(s) } : {}) });

export async function runTool(scope: Scope, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "stats": {
      const days = pickDays(input.days);
      const [calls, ch] = await Promise.all([windowCalls(scope, days), channelOverview(scope, days)]);
      const s = computeStats(calls, days);
      const best = bestSlot(s.slots);
      return {
        periode: days === 1 ? "aujourd'hui" : `${days} derniers jours`,
        appels: { total: s.total, decroches: s.connected, conversations: s.conversations, rdv: s.meetings, taux_decroche: `${s.connectRate.toFixed(1)} %`, conversation_vers_rdv: `${s.convToMeeting.toFixed(1)} %`, duree_moyenne_conversation: fmtDuration(s.avgConvSec),
          objections: s.objections.map((o) => ({ objection: OBJ_LABEL[o.key] || o.key, nombre: o.count, part_passee: o.passedRate == null ? "inconnue" : `${o.passedRate.toFixed(0)} %` })),
          meilleur_creneau: best ? { jour_heure: best.key, taux: `${best.rate.toFixed(0)} %`, appels: best.calls } : null,
          par_commercial: s.reps.map((r) => ({ commercial: r.name, appels: r.total, conversations: r.conversations, rdv: r.meetings })) },
        emails: ch.hasEmail ? { prospects: ch.email.contacts, reponses: ch.email.replied, taux_reponse: `${ch.email.replyRate.toFixed(1)} %`, positives: ch.email.positive, rdv: ch.email.meetings, campagnes: ch.email.campaigns.slice(0, 10) } : "aucune activité email",
        linkedin: ch.hasLinkedin ? { invitations: ch.linkedin.invites, acceptees: ch.linkedin.accepted, taux_acceptation: `${ch.linkedin.acceptRate.toFixed(1)} %`, reponses: ch.linkedin.replied, taux_reponse: `${ch.linkedin.replyRate.toFixed(1)} %`, positives: ch.linkedin.positive, rdv: ch.linkedin.meetings } : "aucune activité LinkedIn",
      };
    }
    case "search_calls": {
      const days = pickDays(input.days), q = typeof input.query === "string" ? input.query.trim().slice(0, 80) : "";
      const filter = input.filter === "meetings" ? { meetingBooked: true } : input.filter === "all" ? {} : { connected: true };
      const where: Prisma.CallWhereInput = { ...callScope(scope), startedAt: { gte: periodStart(days) }, ...filter,
        ...(typeof input.objection === "string" && input.objection in OBJ_LABEL ? { objections: { has: input.objection } } : {}),
        ...(q ? { OR: [{ firstName: like(q) }, { lastName: like(q) }, { company: like(q) }, { summary: like(q) }, { jobTitle: like(q) }] } : {}) };
      const calls = await db.call.findMany({ where, orderBy: { startedAt: "desc" }, take: clamp(input.limit, 1, 40, 15) });
      return calls.map((c) => ({ id: c.id, date: day(c.startedAt), prospect: displayName(c), entreprise: c.company, poste: c.jobTitle, duree: fmtDuration(c.durationSec),
        resultat: c.meetingBooked ? "RDV pris" : isConversation(c) ? "conversation" : c.connected ? "décroché" : c.status, commercial: c.repName,
        objections: c.objections.map((o) => OBJ_LABEL[o] || o), resume: c.summary.slice(0, 400) }));
    }
    case "get_call": {
      const c = await db.call.findFirst({ where: { id: String(input.id || ""), ...callScope(scope) } });
      if (!c) return { erreur: "Appel introuvable dans votre espace." };
      const tr = ((c.transcript as unknown as TranscriptLine[]) || []).map((l) => `${l.ts ? `[${l.ts}] ` : ""}${l.s ? l.s + " : " : ""}${l.t}`).join("\n");
      return { id: c.id, date: day(c.startedAt), prospect: displayName(c), entreprise: c.company, poste: c.jobTitle, duree: fmtDuration(c.durationSec), rdv: c.meetingBooked,
        commercial: c.repName, liste: c.listName, resume: c.summary, objections: c.objDetails ?? c.objections, transcription: tr.slice(0, 30000) || "pas de transcription" };
    }
    case "search_messages": {
      const days = pickDays(input.days), q = typeof input.query === "string" ? input.query.trim().slice(0, 80) : "";
      const where: Prisma.ActivityWhereInput = { ...activityScope(scope), occurredAt: { gte: periodStart(days) },
        ...(input.channel === "email" || input.channel === "linkedin" ? { channel: input.channel } : {}),
        ...(input.only_replies === false ? {} : { type: "replied" }),
        ...(q ? { OR: [{ firstName: like(q) }, { lastName: like(q) }, { company: like(q) }, { campaign: like(q) }, { body: like(q) }, { subject: like(q) }] } : {}) };
      const acts = await db.activity.findMany({ where, orderBy: { occurredAt: "desc" }, take: clamp(input.limit, 1, 40, 15) });
      return acts.map((a) => ({ date: day(a.occurredAt), canal: a.channel, evenement: a.type, prospect: displayName(a), entreprise: a.company, campagne: a.campaign, objet: a.subject, tonalite: a.sentiment, objections: a.objections.map((o) => OBJ_LABEL[o] || o), message: a.body.slice(0, 1500) }));
    }
    case "prospect_history": {
      const q = String(input.name || "").trim().slice(0, 80);
      if (!q) return { erreur: "Indiquez un nom." };
      const parts = q.split(/\s+/).filter(Boolean);
      const nameMatch = parts.length > 1
        ? [{ AND: [{ firstName: like(parts[0]) }, { lastName: like(parts.slice(1).join(" ")) }] }, { company: like(q) }]
        : [{ firstName: like(q) }, { lastName: like(q) }, { company: like(q) }];
      const [calls, acts] = await Promise.all([
        db.call.findMany({ where: { ...callScope(scope), OR: nameMatch }, orderBy: { startedAt: "desc" }, take: 15 }),
        db.activity.findMany({ where: { ...activityScope(scope), OR: nameMatch }, orderBy: { occurredAt: "desc" }, take: 30 }),
      ]);
      const keys = [...new Set([...calls.map((c) => c.contactKey), ...acts.map((a) => a.contactKey)])].filter(Boolean);
      const tasks = keys.length ? await db.task.findMany({ where: { ...taskScope(scope), contactKey: { in: keys } }, orderBy: { dueAt: "asc" }, take: 10 }) : [];
      if (!calls.length && !acts.length) return { resultat: `Aucun échange trouvé pour « ${q} ».` };
      return {
        appels: calls.map((c) => ({ id: c.id, date: day(c.startedAt), prospect: displayName(c), entreprise: c.company, poste: c.jobTitle, duree: fmtDuration(c.durationSec), rdv: c.meetingBooked, objections: c.objections.map((o) => OBJ_LABEL[o] || o), resume: c.summary.slice(0, 1200) })),
        emails_linkedin: acts.map((a) => ({ date: day(a.occurredAt), canal: a.channel, evenement: a.type, prospect: displayName(a), campagne: a.campaign, tonalite: a.sentiment, message: a.body.slice(0, 800) })),
        relances: tasks.map((t) => ({ pour: day(t.dueAt), statut: t.status, canal: t.channel, raison: t.reason })),
      };
    }
    case "list_followups": {
      const tasks = await db.task.findMany({ where: { ...taskScope(scope), status: "open" }, orderBy: { dueAt: "asc" }, take: clamp(input.limit, 1, 40, 20) });
      const now = Date.now();
      return tasks.map((t) => ({ prospect: t.contactName, entreprise: t.company, canal: t.channel, pour: day(t.dueAt), en_retard: t.dueAt.getTime() < now, raison: t.reason, suggestion: t.suggestion }));
    }
  }
  return { erreur: `Outil inconnu : ${name}` };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Fait tourner la conversation : Claude appelle les outils autant que nécessaire (8 étapes max), puis répond. */
export async function askAssistant(scope: Scope, history: ChatTurn[], ctx: { who: string; offer: string; isClient: boolean }): Promise<{ text: string; steps: string[] }> {
  const system = `Tu es l'assistant de prospection de Trustpipe, pour ${ctx.who}.${ctx.offer ? ` Ce qu'il vend : ${ctx.offer.slice(0, 1500)}` : ""}
${ctx.isClient ? "Tu parles au client d'un SDR : ses données sont les appels, emails et messages LinkedIn que son prestataire a menés pour lui. Aide-le surtout à préparer ses rendez-vous et à comprendre les résultats." : "Tu parles à un SDR (ou à son équipe) qui prospecte pour ses clients."}
Nous sommes le ${day(new Date())} (heure de Paris).

Règles :
- Appuie-toi uniquement sur les données obtenues avec tes outils. N'invente jamais un chiffre, un nom ou une citation ; si l'information manque, dis-le.
- Cherche avant de répondre : pour un prospect, utilise prospect_history ; pour un chiffre, stats ; pour lire un appel en détail, get_call.
- Réponds en français, de façon concise et actionnable. Utilise des listes courtes et du **gras** pour l'essentiel. Pas de tableau.
- Pour préparer un rendez-vous : contexte, besoins exprimés, objections probables et réponse conseillée, angle d'ouverture, 3 à 5 questions de découverte, objectif de fin de rendez-vous.
- Quand tu cites un appel, indique sa date et le prospect.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const steps: string[] = [];
  for (let i = 0; i < 8; i++) {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await anthropic().beta.messages.create({
        model: AI_MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system,
        tools: ASSISTANT_TOOLS,
        messages,
      });
    } catch (e) {
      console.error("anthropic assistant", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      if (e instanceof Anthropic.RateLimitError) throw new AiError("L'IA est très sollicitée. Réessayez dans une minute.");
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("Clé API Claude invalide sur ce serveur.");
      if (e instanceof Anthropic.APIError) throw new AiError(`L'IA a renvoyé une erreur (${e.status}).`);
      throw new AiError("L'IA ne répond pas. Réessayez.");
    }
    if (res.stop_reason === "refusal") throw new AiError("L'IA a refusé de traiter cette demande.");
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      return { text: text || "Je n'ai pas de réponse à cette question.", steps };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      steps.push(u.name);
      try {
        const out = await runTool(scope, u.name, (u.input ?? {}) as Record<string, unknown>);
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 60000) });
      } catch (e) {
        console.error("assistant tool", u.name, e);
        results.push({ type: "tool_result", tool_use_id: u.id, content: "Erreur pendant la lecture des données.", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new AiError("La recherche a pris trop d'étapes. Reformulez la question plus précisément.");
}
