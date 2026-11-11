import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
delete process.env.ANTHROPIC_API_KEY; // règles seules : tests déterministes

const { db } = await import("../src/lib/db");
const { parseDue, draftFromCall, draftFromReply } = await import("../src/lib/tasks");
const { upsertActivities, upsertCalls, contactKey } = await import("../src/lib/ingest");
const { activityScope, emailStats, linkedinStats } = await import("../src/lib/channels");
const { taskScope } = await import("../src/lib/tasks");
const { mapEventType } = await import("../src/lib/providers/types");

const tag = "mc_" + Date.now().toString(36);
let orgA: string, orgB: string, smoteo: string, acme: string;
before(async () => {
  const mk = (n: string) => db.organization.create({ data: { name: `${tag} ${n}`, trialEndsAt: new Date(Date.now() + 864e5) } });
  orgA = (await mk("A")).id; orgB = (await mk("B")).id;
  smoteo = (await db.client.create({ data: { orgId: orgA, name: "Smoteo" } })).id;
  acme = (await db.client.create({ data: { orgId: orgA, name: "Acme" } })).id;
  await db.clientRule.create({ data: { orgId: orgA, clientId: smoteo, field: "campaign", value: "Smoteo Q4" } });
});
after(async () => { await db.organization.deleteMany({ where: { name: { startsWith: tag } } }); await db.$disconnect(); });

const from = new Date("2026-11-11T10:00:00Z"); // un mercredi
const day = (d: Date | null) => d && d.toISOString().slice(0, 10);

test("dates de relance déduites du texte", () => {
  assert.equal(day(parseDue("Rappeler en mars", from)), "2027-03-01");
  assert.equal(day(parseDue("recontacter fin janvier", from)), "2027-01-25");
  assert.equal(day(parseDue("pas avant dans 6 mois", from)), "2027-05-11");
  assert.equal(day(parseDue("revenez vers moi la semaine prochaine", from)), "2026-11-18");
  assert.equal(day(parseDue("dans 3 jours", from)), "2026-11-16", "le samedi est reporté au lundi");
  assert.equal(day(parseDue("pas prévu avant 2027", from)), "2027-01-15");
  assert.equal(parseDue("Pas intéressé.", from), null);
});

test("relance d'appel : rappel, email demandé, refus", () => {
  assert.equal(draftFromCall({ summary: "- Rappeler en janvier.\n- Budget gelé", startedAt: from, meetingBooked: false })?.channel, "call");
  const mail = draftFromCall({ summary: "- Demande d'envoi d'email avec des références", startedAt: from, meetingBooked: false });
  assert.equal(mail?.channel, "email"); assert.equal(day(mail!.dueAt), "2026-11-12");
  assert.equal(draftFromCall({ summary: "- Demande explicite de ne pas le recontacter", startedAt: from, meetingBooked: false }), null);
  assert.equal(draftFromCall({ summary: "- Rappeler en mars", startedAt: from, meetingBooked: true }), null);
});

test("relance de réponse : absent, plus tard, positive", () => {
  assert.equal(day(draftFromReply({ body: "Je suis absent jusqu'au 20/11", occurredAt: from, channel: "email", sentiment: "ooo" })!.dueAt), "2026-11-23", "lendemain du retour (samedi) reporté au lundi");
  assert.equal(draftFromReply({ body: "Recontactez-moi en mars", occurredAt: from, channel: "linkedin", sentiment: null })?.channel, "linkedin");
  assert.equal(draftFromReply({ body: "Merci, pas intéressé", occurredAt: from, channel: "email", sentiment: "negative" }), null);
});

test("libellés d'événements des outils", () => {
  assert.deepEqual(mapEventType("emailsReplied"), { channel: "email", type: "replied" });
  assert.deepEqual(mapEventType("linkedinInviteAccepted"), { channel: "linkedin", type: "invite_accepted" });
  assert.deepEqual(mapEventType("linkedinInviteDone"), { channel: "linkedin", type: "invite_sent" });
  assert.deepEqual(mapEventType("emailsClicked"), { channel: "email", type: "clicked" });
  assert.deepEqual(mapEventType("linkedinReplied"), { channel: "linkedin", type: "replied" });
});

test("un même prospect est reconnu d'un canal à l'autre", () => {
  const a = contactKey("minari", { externalId: "1", firstName: "Jean", lastName: "Dupont", company: "Acme", contactRef: "123" });
  const b = contactKey("lemlist", { externalId: "2", firstName: "jean", lastName: "DUPONT", company: "acme", email: "j@acme.fr" });
  assert.equal(a, b);
  assert.notEqual(a, contactKey("lemlist", { externalId: "3", firstName: "Jean", lastName: "Dupont", company: "Autre" }));
});

const act = (id: string, o: Record<string, unknown>) => ({ externalId: id, channel: "email" as const, type: "sent" as const, occurredAt: new Date(), firstName: "Léa", lastName: id, company: "Exemple", ...o });

test("emails et LinkedIn : rangement par client et cloisonnement", async () => {
  await upsertActivities({ orgId: orgA, provider: "lemlist" }, [act("e1", { campaign: "Smoteo Q4" }), act("e2", { campaign: "Autre" }), act("e3", { campaign: "smoteo q4", type: "replied", body: "Recontactez-moi en mars" })]);
  await upsertActivities({ orgId: orgA, provider: "webhook", clientId: acme }, [act("a1", { channel: "linkedin", type: "invite_accepted" })]);
  await upsertActivities({ orgId: orgB, provider: "lemlist" }, [act("b1", { campaign: "Smoteo Q4" })]);
  const seen = await db.activity.findMany({ where: activityScope({ kind: "client", orgId: orgA, clientId: smoteo, userId: "u" }) });
  assert.deepEqual(seen.map((a) => a.externalId).sort(), ["e1", "e3"]);
  assert.equal((await db.activity.findFirst({ where: { orgId: orgB } }))!.clientId, null);
  const t = await db.task.findMany({ where: taskScope({ kind: "client", orgId: orgA, clientId: smoteo }) });
  assert.equal(t.length, 1, "la réponse « en mars » crée une relance chez Smoteo");
  assert.equal(t[0].channel, "email");
  assert.equal(await db.task.count({ where: taskScope({ kind: "client", orgId: orgA, clientId: acme }) }), 0, "Acme ne voit pas la relance de Smoteo");
});

test("un RDV ferme les relances ouvertes du prospect", async () => {
  await upsertCalls({ orgId: orgA, provider: "minari" }, [{ externalId: "c1", startedAt: new Date(), durationSec: 90, status: "connected", connected: true, meetingBooked: false, firstName: "Paul", lastName: "Martin", company: "Exemple", summary: "- Rappeler la semaine prochaine" }]);
  const key = contactKey("x", { externalId: "", firstName: "Paul", lastName: "Martin", company: "Exemple" });
  assert.equal(await db.task.count({ where: { orgId: orgA, contactKey: key, status: "open" } }), 1);
  await upsertActivities({ orgId: orgA, provider: "lemlist" }, [act("m1", { firstName: "Paul", lastName: "Martin", type: "meeting_booked" })]);
  assert.equal(await db.task.count({ where: { orgId: orgA, contactKey: key, status: "open" } }), 0);
});

test("statistiques email et LinkedIn", () => {
  const base = { channel: "email", sentiment: null, campaign: "C" } as const;
  const rows = [
    { ...base, type: "sent", contactKey: "a" }, { ...base, type: "sent", contactKey: "b" }, { ...base, type: "sent", contactKey: "c" }, { ...base, type: "sent", contactKey: "d" },
    { ...base, type: "replied", contactKey: "a", sentiment: "positive" }, { ...base, type: "replied", contactKey: "b", sentiment: "negative" }, { ...base, type: "meeting_booked", contactKey: "a" },
    { ...base, channel: "linkedin", type: "invite_sent", contactKey: "x" }, { ...base, channel: "linkedin", type: "invite_sent", contactKey: "y" }, { ...base, channel: "linkedin", type: "invite_accepted", contactKey: "x" },
  ];
  const e = emailStats(rows as never), l = linkedinStats(rows as never);
  assert.equal(e.contacts, 4); assert.equal(e.replyRate, 50); assert.equal(e.positive, 1); assert.equal(e.meetings, 1);
  assert.equal(l.invites, 2); assert.equal(l.acceptRate, 50);
});
