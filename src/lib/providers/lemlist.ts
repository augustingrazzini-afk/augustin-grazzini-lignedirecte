import { http, mapEventType, num, Provider, NormalizedActivity, NormalizedCall, str, stripHtml, toDate } from "./types";

// lemlist couvre l'email, LinkedIn et les appels. On lit l'historique d'activités de l'équipe.
// Intégration en bêta : les noms de champs sont lus de façon tolérante, à valider avec une vraie clé.
const API = "https://api.lemlist.com/api";
const headers = (c: Record<string, string>) => ({ Authorization: "Basic " + Buffer.from(`:${c.apiKey}`).toString("base64"), Accept: "application/json" });

function mapCall(a: any): NormalizedCall {
  const dur = num(a.duration ?? a.callDuration);
  const answered = /answered|done|connected/i.test(str(a.callAnswer || a.type)) && dur > 0;
  return {
    externalId: str(a._id || a.id || a.activityId),
    startedAt: toDate(a.createdAt || a.date) || new Date(),
    durationSec: dur,
    direction: /in/i.test(str(a.direction)) ? "inbound" : "outbound",
    status: answered ? "connected" : str(a.callStatus) || "no-answer",
    connected: answered,
    meetingBooked: /meeting|rdv|rendez|booked/i.test(str(a.callStatus)),
    firstName: str(a.leadFirstName || a.firstName), lastName: str(a.leadLastName || a.lastName), company: str(a.leadCompanyName || a.companyName),
    email: undefined, contactRef: str(a.leadId || a.contactId), repName: str(a.sendUserName || a.userName),
    campaign: str(a.campaignName), listName: str(a.campaignName),
    summary: stripHtml(a.transcriptSummary || a.callNote || ""),
  } as NormalizedCall;
}

function mapActivity(a: any): NormalizedActivity | null {
  const t = mapEventType(str(a.type));
  if (!t) return null;
  return {
    externalId: str(a._id || a.id),
    ...t,
    occurredAt: toDate(a.createdAt || a.date) || new Date(),
    firstName: str(a.leadFirstName || a.firstName), lastName: str(a.leadLastName || a.lastName), company: str(a.leadCompanyName || a.companyName),
    jobTitle: str(a.leadJobTitle || a.jobTitle), email: str(a.leadEmail || a.email) || undefined, linkedinUrl: str(a.leadLinkedinUrl || a.linkedinUrl) || undefined,
    contactRef: str(a.leadId), repName: str(a.sendUserName || a.userName), campaign: str(a.campaignName), step: a.sequenceStep != null ? num(a.sequenceStep) : null,
    subject: str(a.emailSubject || a.subject), body: stripHtml(a.text || a.message || a.emailText || a.body || ""),
  };
}

async function* pages(c: Record<string, string>, since: Date, type?: string) {
  for (let offset = 0, i = 0; i < 60; i++) {
    const q = new URLSearchParams({ limit: "100", offset: String(offset) });
    if (type) q.set("type", type);
    const rows = (await http(`${API}/activities?${q}`, { headers: headers(c), label: "lemlist" })) as any[];
    const list = Array.isArray(rows) ? rows : [];
    const recent = list.filter((a) => (toDate(a.createdAt) || new Date(0)) >= since);
    yield recent;
    if (list.length < 100 || recent.length < list.length) break;
    offset += 100;
  }
}

export const lemlist: Provider = {
  id: "lemlist",
  label: "lemlist",
  beta: true,
  channels: ["email", "linkedin", "call"],
  credentialFields: [{ key: "apiKey", label: "Clé API", type: "password", help: "lemlist > Paramètres > Intégrations > API" }],
  help: "Emails, LinkedIn et appels du dialer : envois, ouvertures, réponses, invitations, acceptations.",
  async test(c) {
    await http(`${API}/team`, { headers: headers(c), label: "lemlist" });
  },
  async *list(c, since) {
    for await (const rows of pages(c, since, "callDone")) yield rows.map(mapCall);
  },
  async *listActivities(c, since) {
    for await (const rows of pages(c, since)) yield rows.filter((a) => !/call|aircall|dialer/i.test(str(a.type))).map(mapActivity).filter((x): x is NormalizedActivity => !!x);
  },
};
