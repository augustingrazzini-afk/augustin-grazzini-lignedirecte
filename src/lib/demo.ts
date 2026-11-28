import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { sealContact } from "./contact";
import { asJson } from "./ai";
import { bumpUsage } from "./usage";
import { dayKey } from "./format";
import AUDIO from "./demo-audio.json";

/**
 * Démo publique en lecture seule : un espace fictif en Premium (commerciaux, agence et ses SDR, appels, relances,
 * rendez-vous), ouvert sans compte depuis /demo. Toute écriture y est refusée (actions, routes API, Claude).
 * Les données sont régénérées chaque jour pour rester « en direct ».
 */
import { DEMO_ORG_ID, DEMO_USER_ID } from "./demo-ids";
const DEMO_EMAIL = "demo@trustpipe.invalid"; // domaine réservé : aucun email ne peut y partir
export { DEMO_ORG_ID, DEMO_USER_ID, DEMO_MESSAGE, isDemoOrg, isDemoUser } from "./demo-ids";

// Générateur fixe : la démo est la même pour tout le monde un jour donné.
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

const REPS = [
  { id: "demo_rep_lea", name: "Léa Martin", kind: "interne", agency: "", callers: ["Léa Martin"], rate: 0.27, rdv: 0.2 },
  { id: "demo_rep_karim", name: "Karim Benali", kind: "freelance", agency: "Benali Conseil", callers: ["Karim Benali"], rate: 0.22, rdv: 0.14 },
  { id: "demo_rep_sophie", name: "Sophie Durand", kind: "interne", agency: "", callers: ["Sophie Durand"], rate: 0.24, rdv: 0.12 },
  { id: "demo_rep_prospectio", name: "Prospectio", kind: "agence", agency: "Prospectio", callers: ["Hugo", "Inès", "Marc"], rate: 0.17, rdv: 0.07 },
];
const FIRST = ["Paul", "Julie", "Thomas", "Sophie", "Nicolas", "Claire", "Antoine", "Camille", "Julien", "Émilie", "Marc", "Laura", "Pierre", "Sarah", "Hugo", "Céline", "Olivier", "Marion", "Damien", "Aurélie"];
const LAST = ["Morel", "Martin", "Lemaire", "Roux", "Duval", "Garnier", "Faure", "Blanc", "Guérin", "Petit", "Lambert", "Boyer", "Girard", "Bonnet", "Mercier", "Fontaine", "Chevalier", "Robin", "Masson", "Picard"];
const COMPANY = ["Atelier Morel", "Solaris Énergie", "Bati Sud", "Elec Pro 34", "Nova Habitat", "Datalia", "Talentis RH", "Helion Conseil", "Kalypso Digital", "Finéo Gestion", "Vertigo Logistique", "Optima BTP", "Clairvoyance Santé", "Maison Fabre", "Urbanéo", "Lumen Industrie"];
const TITLE = ["Gérant", "Directeur commercial", "Responsable achats", "Directrice générale", "Office manager", "DAF", "Responsable marketing", "Président"];
const LISTS = ["PME Sud-Ouest", "Industriels 50-200", "Relance salon novembre", "Dirigeants BTP"];
const OBJ = ["timing", "budget", "incumbent", "too_busy", "authority", "relevance"];
const OBJ_TXT: Record<string, [string, string]> = {
  timing: ["Le prospect veut en reparler au premier trimestre.", "Le commercial propose un court échange pour préparer la décision."],
  budget: ["Le budget de l'année est déjà engagé.", "Le commercial chiffre le gain et propose de commencer petit."],
  incumbent: ["Le prospect a déjà un prestataire.", "Le commercial propose une comparaison sur un cas concret."],
  too_busy: ["Le prospect est pris et demande de rappeler.", "Le commercial obtient un créneau précis pour rappeler."],
  authority: ["Ce n'est pas lui qui décide.", "Le commercial demande à être mis en relation avec le décideur."],
  relevance: ["Le prospect ne voit pas l'intérêt pour son activité.", "Le commercial reformule avec un exemple du même secteur."],
};
const SUMMARY_RDV = ["Intéressé par l'offre : rendez-vous fixé pour une présentation de 30 minutes.", "Besoin confirmé sur la réduction des coûts : visio calée avec le dirigeant.", "Souhaite une démonstration avec son associé : rendez-vous pris."];
const SUMMARY_CONV = ["Écoute attentive, demande une plaquette par email avant d'aller plus loin.", "Pas de besoin immédiat, à rappeler au prochain trimestre.", "Déjà équipé, mais ouvert à comparer en début d'année.", "En réunion, demande d'être rappelé en fin d'après-midi.", "Intéressé, mais le décideur est son associé : rappel prévu.", "Budget bloqué cette année, à recontacter en janvier."];

/** Enregistrements fictifs (voix de synthèse) et leur transcription, une version par issue d'appel. */
type Take = { dur: number; lines: { rep: boolean; t: string; at: number }[] };
const TAKES = AUDIO as Record<string, Take>;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
function transcript(take: string, rep: string) {
  return TAKES[take].lines.map((l) => ({ ts: mmss(l.at), s: l.rep ? rep : "Prospect", t: l.t }));
}

/** Crée (ou recrée) l'espace de démo avec des données jusqu'à aujourd'hui. */
async function seed() {
  const r = rng(Number(dayKey(new Date()).replace(/-/g, "")));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  await db.organization.deleteMany({ where: { id: DEMO_ORG_ID } });
  await db.user.upsert({ where: { id: DEMO_USER_ID }, create: { id: DEMO_USER_ID, email: DEMO_EMAIL, name: "Visiteur de la démo", emailVerifiedAt: new Date() }, update: {} });
  await db.organization.create({
    data: {
      id: DEMO_ORG_ID, name: "Atelier Démo (exemple)", plan: "premium", seats: 50, subscriptionStatus: "active", stripeSubscriptionId: "demo_offert",
      trialEndsAt: new Date(Date.now() + 3650 * 864e5), offer: "Réduction des coûts d'énergie et d'achats pour les PME.",
      members: { create: { userId: DEMO_USER_ID, role: "owner", digest: false } },
      clients: { create: REPS.map((p) => ({ id: p.id, name: p.name, kind: p.kind, agency: p.agency })) },
    },
  });

  const calls: Prisma.CallCreateManyInput[] = [];
  const tasks: Prisma.TaskCreateManyInput[] = [];
  const now = Date.now();
  let n = 0;
  for (let d = 34; d >= 0; d--) {
    const day = new Date(now - d * 864e5);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const rep of REPS) {
      const perDay = rep.kind === "agence" ? 22 : 11;
      for (let k = 0; k < perDay; k++) {
        const hour = 8 + Math.floor(r() * 10), min = Math.floor(r() * 60);
        const at = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 1, min, Math.floor(r() * 60)));
        if (at.getTime() > now) continue;
        // Le créneau de 16-17 h décroche mieux : la démo montre un vrai « meilleur créneau ».
        const connected = r() < rep.rate * (hour >= 16 && hour < 18 ? 1.5 : hour < 10 ? 0.7 : 1);
        const dur = connected ? 20 + Math.floor(r() * 300) : r() < 0.3 ? Math.floor(r() * 25) : 0;
        const conv = connected && dur >= 30;
        const rdv = conv && r() < rep.rdv * 2.2;
        const fn = pick(FIRST), ln = pick(LAST), company = pick(COMPANY);
        const objection = conv && !rdv && r() < 0.7 ? pick(OBJ) : null;
        const caller = pick(rep.callers), id = `demo_call_${n++}`;
        const take = rdv ? "rdv" : objection || "neutre";
        calls.push({
          id, orgId: DEMO_ORG_ID, clientId: rep.id, provider: "minari", externalId: id, kind: "call", startedAt: at, durationSec: conv ? TAKES[take].dur : dur, recordingUrl: conv ? `/demo/audio/${take}.mp3` : null,
          direction: "outbound", status: rdv ? "meeting-booked" : connected ? "connected" : dur ? "voicemail" : "no-answer", connected, meetingBooked: rdv,
          firstName: fn, lastName: ln, company, jobTitle: pick(TITLE), contactKey: `demo:${fn}-${ln}-${company}`, repName: caller, listName: pick(LISTS),
          phoneLast4: String(1000 + Math.floor(r() * 9000)),
          contactSealed: sealContact(`+33 6 39 98 ${String(Math.floor(r() * 100)).padStart(2, "0")} ${String(Math.floor(r() * 100)).padStart(2, "0")}`, `${fn}.${ln}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() + "@exemple.fr"),
          summary: conv ? `- ${rdv ? pick(SUMMARY_RDV) : pick(SUMMARY_CONV)}` : "",
          aiSummary: conv ? `- ${rdv ? "Rendez-vous obtenu : le besoin est confirmé." : "Pas de décision aujourd'hui."}\n- Interlocuteur : ${pick(TITLE).toLowerCase()} de ${company}.` : "",
          objections: objection ? [objection] : [],
          objDetails: asJson(objection ? [{ category: objection, summary: OBJ_TXT[objection][0], rep_response: OBJ_TXT[objection][1], passed: r() < 0.45 }] : []),
          transcript: asJson(conv ? transcript(take, caller) : []),
          aiStatus: "done", transcriptStatus: conv ? "done" : "none",
        });
        if (conv && !rdv && tasks.length < 18 && r() < 0.25) {
          tasks.push({ orgId: DEMO_ORG_ID, clientId: rep.id, contactKey: `demo:${fn}-${ln}-${company}`, contactName: `${fn} ${ln}`, company, channel: r() < 0.7 ? "call" : "email",
            dueAt: new Date(now + (Math.floor(r() * 12) - 5) * 864e5), reason: objection === "too_busy" ? "Rappel demandé" : "Relance après premier échange", suggestion: `Bonjour ${fn}, je reviens vers vous suite à notre échange.`,
            status: "open", source: "ai", sourceKind: "call", sourceId: id });
        }
      }
    }
  }
  // Quelques rendez-vous menés, avec leur débrief (fonction Premium).
  for (let i = 0; i < 4; i++) {
    const rep = REPS[i % 3], fn = FIRST[i * 3], ln = LAST[i * 2], company = COMPANY[i + 2], id = `demo_meet_${i}`;
    calls.push({
      id, orgId: DEMO_ORG_ID, clientId: rep.id, provider: "manual", externalId: id, kind: "meeting", startedAt: new Date(now - (i * 3 + 1) * 864e5), durationSec: 1500 + i * 300,
      direction: "outbound", status: "done", connected: true, meetingBooked: false, firstName: fn, lastName: ln, company, jobTitle: TITLE[i], contactKey: `demo:${fn}-${ln}-${company}`,
      repName: rep.name, summary: "- Rendez-vous de découverte en visio.", transcript: asJson(transcript("rdv", rep.name)), aiStatus: "done", transcriptStatus: "done",
      debrief: asJson({ verdict: "Bon rendez-vous : le besoin est confirmé et le dirigeant est impliqué.", score: 7 + (i % 3), worked: ["Découverte précise des coûts actuels", "Chiffrage concret de l'écart"], missed: ["Le calendrier de décision n'a pas été fixé"], objections: [{ objection: "Budget", handled: true, comment: "Réponse claire avec un démarrage progressif." }], coherence: "Cohérent avec l'appel de prospection.", advice: ["Envoyer la proposition sous 48 h", "Fixer la date de décision"], next_step: "Proposition chiffrée à envoyer cette semaine." }),
    });
  }
  await db.call.createMany({ data: calls });
  await db.task.createMany({ data: tasks, skipDuplicates: true });
  await db.brief.create({ data: { orgId: DEMO_ORG_ID, query: "Atelier Morel", prospect: "Paul Morel", company: "Atelier Morel", createdById: DEMO_USER_ID, status: "done",
    content: asJson({ prospect: "Paul Morel", entreprise: "Atelier Morel", poste: "Gérant", chaleur: 72, resume: "Intéressé par la réduction de ses coûts d'énergie, rendez-vous fixé jeudi.", contexte: ["PME de 35 salariés", "Contrat d'énergie renouvelé il y a 2 ans"], besoins: ["Réduire la facture sans changer de fournisseur en urgence"], objections: [{ objection: "Budget déjà engagé", reponse: "Montrer un démarrage sans investissement." }], angle: "Partir de sa facture actuelle et chiffrer l'écart.", questions: ["Quel est votre montant annuel ?", "Qui valide ce type de dépense ?", "Quel calendrier visez-vous ?"], eviter: ["Parler technique trop tôt"], prochaine_etape: "Obtenir la dernière facture et caler une seconde réunion." }) } });
  const first = calls.find((c) => c.clientId === "demo_rep_prospectio" && c.summary);
  if (first) await db.callShare.create({ data: { callId: first.id!, clientId: "demo_rep_karim", fromName: "La direction", note: "Écoute comment Hugo ouvre l'appel." } });
}

/** Prépare la démo : la crée si besoin, la régénère une fois par jour (le premier visiteur du jour). */
export async function ensureDemo() {
  const last = await db.call.findFirst({ where: { orgId: DEMO_ORG_ID }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  const fresh = last && dayKey(last.startedAt) === dayKey(new Date());
  if (fresh) return;
  if ((await bumpUsage(`demo-seed:${dayKey(new Date())}`)) > 1 && last) return; // un autre visiteur la régénère déjà
  await seed();
}
