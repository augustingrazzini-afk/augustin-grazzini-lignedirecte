// Données de démonstration FICTIVES (pour tester l'interface). Usage : npm run seed
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const FIRST = ["Claire", "Marc", "Nadia", "Paul", "Inès", "Hugo", "Léa", "Tom", "Sami", "Julie", "Yanis", "Emma", "Louis", "Sarah"];
const LAST = ["Martin", "Petit", "Roux", "Garnier", "Lambert", "Faure", "Morel", "Girard", "Blanc", "Guerin", "Boyer", "Henry"];
const COMP = ["Exemple Data", "Démo Logistique", "Fictif Software", "Sample Industrie", "Test RH", "Modèle Énergie", "Prototype Finance", "Maquette Santé"];
const JOBS = ["CEO", "Directeur commercial", "Head of Sales", "VP Sales", "Co-fondateur", "Responsable marketing"];
const SUMS = [
  ["- Rendez-vous fixé jeudi 14h en visio.", "- Équipe de 4 commerciaux, aucun SDR dédié.", "- Cherche à ouvrir le marché belge."],
  ["- Rappeler en janvier.", "- Budget prospection gelé jusqu'à la fin de l'année."],
  ["- Demande d'envoi d'email avec des références clients.", "- Déjà 2 SDR en interne, regarde pour un renfort ponctuel."],
  ["- Pas intéressé : la prospection est faite en interne."],
  ["- Mauvais interlocuteur : renvoie vers la directrice marketing."],
  ["- Intéressé, veut un devis pour 3 mois.", "- Décision avec son associé la semaine prochaine."],
];
const OBJS = [["timing"], ["budget", "timing"], ["incumbent"], ["relevance"], ["authority"], []];
const rnd = (n: number) => Math.floor(Math.random() * n);

async function main() {
  await db.organization.deleteMany({ where: { name: "LigneDirecte (démo)" } });
  const owner = await db.user.upsert({ where: { email: "demo@exemple.fr" }, update: {}, create: { email: "demo@exemple.fr" } });
  const clientUser = await db.user.upsert({ where: { email: "client@exemple.fr" }, update: {}, create: { email: "client@exemple.fr" } });
  const org = await db.organization.create({ data: { name: "LigneDirecte (démo)", offer: "Prospection téléphonique externalisée pour les SaaS B2B.", trialEndsAt: new Date(Date.now() + 14 * 864e5), members: { create: { userId: owner.id, role: "owner" } } } });
  const smoteo = await db.client.create({ data: { orgId: org.id, name: "Smoteo (démo)", offer: "Logiciel de gestion pour PME." } });
  const acme = await db.client.create({ data: { orgId: org.id, name: "Acme (démo)" } });
  await db.clientMember.create({ data: { clientId: smoteo.id, userId: clientUser.id } });
  await db.clientRule.createMany({ data: [{ orgId: org.id, clientId: smoteo.id, field: "list", value: "Smoteo - Q4" }, { orgId: org.id, clientId: acme.id, field: "list", value: "Acme - outbound" }] });

  const lists = [["Smoteo - Q4", smoteo.id], ["Acme - outbound", acme.id], ["LEADS CHAUDS", null]] as const;
  for (let i = 0; i < 260; i++) {
    const [listName, clientId] = lists[i % 3];
    const answered = Math.random() < 0.2;
    const k = rnd(SUMS.length);
    const meeting = answered && k === 0;
    const day = rnd(30), hour = 8 + rnd(10);
    const d = new Date(Date.now() - day * 864e5); d.setHours(hour, rnd(60), 0, 0);
    const fn = FIRST[rnd(FIRST.length)], ln = LAST[rnd(LAST.length)], company = COMP[rnd(COMP.length)];
    const dur = answered ? 40 + rnd(320) : 0;
    await db.call.create({ data: {
      orgId: org.id, clientId, provider: "minari", externalId: `demo-${i}`, startedAt: d, durationSec: dur, direction: "outbound",
      status: meeting ? "meeting-booked" : answered ? "connected" : "no-answer", connected: answered, meetingBooked: meeting,
      firstName: fn, lastName: ln, company, jobTitle: JOBS[rnd(JOBS.length)], contactKey: `demo:${fn}${ln}${company}`,
      repName: i % 4 === 0 ? "Hugo (démo)" : "Camille (démo)", listName,
      summary: answered ? SUMS[k].join("\n") : "", objections: answered ? OBJS[k] : [],
      objDetails: answered && OBJS[k][0] ? [{ category: OBJS[k][0], summary: "Objection exprimée par le prospect.", rep_response: "Le commercial a reformulé et proposé un court échange.", passed: Math.random() < 0.5 }] : [],
      transcript: answered ? [
        { ts: "00:01", s: i % 4 === 0 ? "Hugo (démo)" : "Camille (démo)", t: `Bonjour ${fn}, ici l'équipe commerciale, vous avez une minute ?` },
        { ts: "00:05", s: `${fn} ${ln}`, t: "Oui, rapidement, je vous écoute." },
        { ts: "00:09", s: i % 4 === 0 ? "Hugo (démo)" : "Camille (démo)", t: "Je vous appelle au sujet de votre prospection commerciale." },
      ] : [],
      aiStatus: answered ? "done" : "none",
    } });
  }
  // Emails et LinkedIn (fictifs) via le même moteur que les vraies sources
  const { upsertActivities, afterCall } = await import("../src/lib/ingest");
  const REPLIES = [["positive", "Bonjour, oui ça m'intéresse, on peut en parler jeudi ?"], ["negative", "Merci mais pas intéressé."], ["ooo", "Je suis absent jusqu'au 25/11, je reviens vers vous à mon retour."], ["neutral", "Pouvez-vous m'envoyer une présentation ?"], ["objection", "Nous avons déjà un prestataire, recontactez-moi en mars."]];
  for (const [camp, clientId] of [["Smoteo - Q4", smoteo.id], ["Acme - outbound", acme.id]] as const) {
    const acts = [];
    for (let i = 0; i < 70; i++) {
      const fn = FIRST[rnd(FIRST.length)], ln = LAST[rnd(LAST.length)], company = COMP[rnd(COMP.length)];
      const d = new Date(Date.now() - rnd(28) * 864e5 - rnd(8) * 36e5);
      const who = { firstName: fn, lastName: ln, company, jobTitle: JOBS[rnd(JOBS.length)], campaign: camp, email: `${fn}.${ln}@exemple.invalid`.toLowerCase() };
      const li = i % 2 === 0;
      if (li) {
        acts.push({ ...who, externalId: `${camp}-li-${i}-inv`, channel: "linkedin" as const, type: "invite_sent" as const, occurredAt: d });
        if (Math.random() < 0.45) acts.push({ ...who, externalId: `${camp}-li-${i}-acc`, channel: "linkedin" as const, type: "invite_accepted" as const, occurredAt: new Date(d.getTime() + 864e5) });
        if (Math.random() < 0.18) { const [sent, body] = REPLIES[rnd(REPLIES.length)]; acts.push({ ...who, externalId: `${camp}-li-${i}-rep`, channel: "linkedin" as const, type: "replied" as const, occurredAt: new Date(d.getTime() + 2 * 864e5), body, sentiment: sent }); }
      } else {
        acts.push({ ...who, externalId: `${camp}-em-${i}-sent`, channel: "email" as const, type: "sent" as const, occurredAt: d, subject: "Votre prospection commerciale", step: 1 });
        if (Math.random() < 0.5) acts.push({ ...who, externalId: `${camp}-em-${i}-open`, channel: "email" as const, type: "opened" as const, occurredAt: new Date(d.getTime() + 36e5) });
        if (Math.random() < 0.15) { const [sent, body] = REPLIES[rnd(REPLIES.length)]; acts.push({ ...who, externalId: `${camp}-em-${i}-rep`, channel: "email" as const, type: "replied" as const, occurredAt: new Date(d.getTime() + 864e5), body, sentiment: sent, subject: "RE: Votre prospection commerciale" }); if (sent === "positive" && Math.random() < 0.6) acts.push({ ...who, externalId: `${camp}-em-${i}-rdv`, channel: "email" as const, type: "meeting_booked" as const, occurredAt: new Date(d.getTime() + 2 * 864e5) }); }
      }
    }
    await upsertActivities({ orgId: org.id, provider: "lemlist", clientId }, acts);
  }
  for (const c of await db.call.findMany({ where: { orgId: org.id } })) await afterCall(c);
  console.log(`Démo prête : organisation ${org.id}, Smoteo ${smoteo.id}, Acme ${acme.id}`);
  console.log("Comptes : demo@exemple.fr (SDR) · client@exemple.fr (portail Smoteo)");
}
main().finally(() => db.$disconnect());
