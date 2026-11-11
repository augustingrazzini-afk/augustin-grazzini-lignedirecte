import type { Scope } from "./access";
import { runTool, type ChatTurn } from "./assistant";

/**
 * Assistant « essentiel », sans IA : comprend les demandes courantes par mots-clés et répond
 * à partir des données (stats, objections, préparation de rendez-vous, relances, derniers appels).
 * Utilisé tant que l'IA complète (Claude) n'est pas activée ; aucune donnée ne sort de Trustpipe.
 */

type Stats = { periode: string; appels: { total: number; decroches: number; conversations: number; rdv: number; taux_decroche: string; conversation_vers_rdv: string; duree_moyenne_conversation: string;
  objections: { objection: string; nombre: number; part_passee: string }[]; meilleur_creneau: { jour_heure: string; taux: string; appels: number } | null; par_commercial: { commercial: string; appels: number; conversations: number; rdv: number }[] } };
type CallRow = { id: string; date: string; prospect: string; entreprise: string; poste?: string; duree: string; rdv?: boolean; resultat?: string; objections: string[]; resume: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Conseils types par objection (sans IA). */
const ADVICE: Record<string, string> = {
  "Timing": "Proposer un démarrage progressif (pilote, premier lot réduit) et fixer une date de reprise précise.",
  "Budget": "Qualifier le budget et qui décide ; chiffrer le coût de l'inaction face au prix.",
  "Pas décideur": "Identifier le décideur et proposer un échange court à trois.",
  "Solution en place": "Faire parler de ce qui manque à la solution actuelle avant de comparer.",
  "Pertinence": "Revenir au besoin exprimé : reformuler le problème avant la solution.",
  "Pas le temps": "Proposer un format court (15 min) à un créneau choisi par le prospect.",
  "Autre": "Reformuler l'objection et demander ce qui ferait changer d'avis.",
};

function periodDays(q: string) {
  if (/aujourd|ce jour|journee/.test(q)) return 1;
  if (/semaine|7 jours|hebdo/.test(q)) return 7;
  if (/trimestre|3 mois|90 jours/.test(q)) return 90;
  if (/annee|an |12 mois|365/.test(q)) return 365;
  return 30;
}

/** Nom de prospect ou d'entreprise après « avec », « de », « pour », « sur », ou entre parenthèses. */
function extractName(raw: string) {
  const paren = raw.match(/\(([^)]{2,60})\)/);
  const m = raw.match(/(?:avec|de|pour|sur|chez|concernant)\s+((?:[A-ZÀ-Ý][\p{L}'’.-]*\s?){1,4})/u);
  const name = (m?.[1] || "").trim().replace(/[?.!,]+$/, "");
  const STOP = /^(Le|La|Les|Un|Une|Mon|Ma|Mes|Ce|Cette|Jeudi|Lundi|Mardi|Mercredi|Vendredi|Samedi|Dimanche|Demain|RDV)$/;
  const words = name.split(/\s+/).filter((w) => w && !STOP.test(w));
  return { name: words.join(" "), company: paren?.[1]?.trim() || "" };
}

const list = (items: string[]) => items.map((x) => `- ${x}`).join("\n");

async function prepare(scope: Scope, name: string, company: string): Promise<string> {
  let h = (await runTool(scope, "prospect_history", { name })) as any;
  if ((!h?.appels || !h.appels.length) && company) h = (await runTool(scope, "prospect_history", { name: company })) as any;
  if (!h?.appels?.length) return `Je ne trouve aucun appel avec **${name || company}**. Vérifiez l'orthographe du nom ou de l'entreprise.`;
  const calls: CallRow[] = h.appels;
  const last = calls[0];
  const objections = [...new Set(calls.flatMap((c) => c.objections))];
  const booked = calls.find((c) => c.rdv);
  const detail = (await runTool(scope, "get_call", { id: (booked || last).id })) as any;
  const excerpt = typeof detail?.transcription === "string" && detail.transcription !== "pas de transcription"
    ? detail.transcription.split("\n").slice(0, 8).join("\n") : "";
  const out: string[] = [];
  out.push(`**Préparation : ${last.prospect}${last.entreprise ? `, ${last.entreprise}` : ""}${last.poste ? ` (${last.poste})` : ""}**`);
  out.push(list([`${calls.length} appel(s), le dernier le ${last.date} (${last.duree})`, booked ? `Rendez-vous obtenu lors de l'appel du ${booked.date}` : "Pas encore de rendez-vous noté"]));
  const resumes = calls.map((c) => c.resume).filter(Boolean);
  if (resumes.length) out.push(`**Ce qu'il a dit**\n${resumes[0].split("\n").map((l) => l.replace(/^-\s*/, "- ")).join("\n")}`);
  if (objections.length) out.push(`**Objections à anticiper**\n${list(objections.map((o) => `**${o}** : ${ADVICE[o] || ADVICE.Autre}`))}`);
  if (h.relances?.length) out.push(`**Relances prévues**\n${list(h.relances.map((r: any) => `${r.pour} : ${r.raison}`))}`);
  if (excerpt) out.push(`**Début de la conversation**\n${excerpt.split("\n").map((l: string) => `- ${l}`).join("\n")}`);
  out.push(`**Pour le rendez-vous**\n${list(["Reprendre le besoin exprimé au téléphone dès l'introduction", objections.length ? "Traiter d'emblée les objections ci-dessus" : "Qualifier budget, décideur et calendrier", "Terminer par une prochaine étape datée"])}`);
  return out.join("\n\n");
}

async function stats(scope: Scope, days: number, focus?: "objections" | "creneau"): Promise<string> {
  const s = (await runTool(scope, "stats", { days })) as Stats;
  const a = s.appels;
  if (focus === "objections") {
    if (!a.objections.length) return `Aucune objection relevée sur ${s.periode}.`;
    return `**Objections sur ${s.periode}**\n${list(a.objections.map((o) => `**${o.objection}** : ${o.nombre} fois, passée ${o.part_passee}`))}\n\n**Comment y répondre**\n${list(a.objections.slice(0, 3).map((o) => `**${o.objection}** : ${ADVICE[o.objection] || ADVICE.Autre}`))}`;
  }
  if (focus === "creneau") {
    return a.meilleur_creneau ? `**Meilleur créneau sur ${s.periode}** : ${a.meilleur_creneau.jour_heure}, ${a.meilleur_creneau.taux} de décroché (${a.meilleur_creneau.appels} appels).\nLa carte complète est sur le tableau de bord, rubrique « Quand ça décroche ».`
      : "Pas encore assez d'appels pour dégager un meilleur créneau (3 appels minimum par créneau).";
  }
  const meetings = (await runTool(scope, "search_calls", { days, filter: "meetings", limit: 5 })) as CallRow[];
  const out = [`**Bilan ${s.periode}**`, list([`${a.total} appels, ${a.decroches} décrochés (${a.taux_decroche})`, `${a.conversations} conversations, durée moyenne ${a.duree_moyenne_conversation}`, `**${a.rdv} rendez-vous** (${a.conversation_vers_rdv} des conversations)`])];
  if (a.meilleur_creneau) out.push(`Meilleur créneau : ${a.meilleur_creneau.jour_heure} (${a.meilleur_creneau.taux} de décroché)`);
  if (a.objections.length) out.push(`**Objections principales** : ${a.objections.slice(0, 3).map((o) => `${o.objection} (${o.nombre})`).join(", ")}`);
  if (meetings.length) out.push(`**Derniers rendez-vous pris**\n${list(meetings.map((m) => `${m.date} : ${m.prospect}${m.entreprise ? `, ${m.entreprise}` : ""}`))}`);
  return out.join("\n\n");
}

export async function askLocal(scope: Scope, history: ChatTurn[]): Promise<{ text: string; steps: string[] }> {
  const raw = [...history].reverse().find((t) => t.role === "user")?.content || "";
  const q = norm(raw);
  const { name, company } = extractName(raw);
  const days = periodDays(q);

  if (/(prepare|preparer|brief|rdv avec|rendez-vous avec|rendez vous avec|qui est|historique|dit sur|a dit|fiche)/.test(q) && (name || company))
    return { text: await prepare(scope, name, company), steps: ["prospect_history", "get_call"] };
  if (/objection|bloque|freine|refus/.test(q)) return { text: await stats(scope, days, "objections"), steps: ["stats"] };
  if (/creneau|quand appeler|meilleure? heure|horaire/.test(q)) return { text: await stats(scope, days, "creneau"), steps: ["stats"] };
  if (/relance|rappeler|a faire|todo/.test(q)) {
    const t = (await runTool(scope, "list_followups", { limit: 15 })) as any[];
    return { text: t.length ? `**Relances à faire**\n${list(t.map((r) => `${r.pour}${r.en_retard ? " (en retard)" : ""} : **${r.prospect || "Prospect"}**${r.entreprise ? `, ${r.entreprise}` : ""}, ${r.raison}`))}` : "Aucune relance en attente.", steps: ["list_followups"] };
  }
  if (/dernier|recent|resume les appels|resumer les appels/.test(q) && !/semaine|mois|annee|trimestre/.test(q)) {
    const c = (await runTool(scope, "search_calls", { days: 30, limit: 6 })) as CallRow[];
    return { text: c.length ? `**Dernières conversations**\n${list(c.map((x) => `${x.date} : **${x.prospect}**${x.entreprise ? `, ${x.entreprise}` : ""} (${x.resultat}). ${x.resume.split("\n")[0]?.replace(/^-\s*/, "") || ""}`))}` : "Aucune conversation sur les 30 derniers jours.", steps: ["search_calls"] };
  }
  if (/stat|bilan|combien|resultat|resume|semaine|mois|aujourd|trimestre|annee|diagnostic|performance/.test(q)) return { text: await stats(scope, days), steps: ["stats", "search_calls"] };
  if (name || company) return { text: await prepare(scope, name, company), steps: ["prospect_history", "get_call"] };
  return {
    text: `Je peux vous aider sur vos appels. Par exemple :\n${list(["« Bilan de la semaine » ou « Mes stats du mois »", "« Prépare mon rendez-vous avec Prénom Nom »", "« Quelles objections reviennent ? »", "« Quel est le meilleur créneau d'appel ? »", "« Mes relances » ou « Derniers appels »"])}`,
    steps: [],
  };
}
