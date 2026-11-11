import { http, num, Provider, NormalizedCall, str, stripHtml, toDate } from "./types";

// lemlist : l'API publique expose l'historique d'activités ; les appels du dialer y apparaissent.
// Intégration en bêta : le format exact est à valider avec une vraie clé.
const API = "https://api.lemlist.com/api";
const headers = (c: Record<string, string>) => ({ Authorization: "Basic " + Buffer.from(`:${c.apiKey}`).toString("base64"), Accept: "application/json" });

function map(a: any): NormalizedCall {
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
    firstName: str(a.leadFirstName || a.firstName),
    lastName: str(a.leadLastName || a.lastName),
    company: str(a.leadCompanyName || a.companyName),
    contactRef: str(a.leadId || a.contactId),
    repName: str(a.sendUserName || a.userName),
    campaign: str(a.campaignName),
    listName: str(a.campaignName),
    summary: stripHtml(a.transcriptSummary || a.callNote || ""),
  };
}

export const lemlist: Provider = {
  id: "lemlist",
  label: "lemlist",
  beta: true,
  credentialFields: [{ key: "apiKey", label: "Clé API", type: "password", help: "lemlist > Paramètres > Intégrations > API" }],
  help: "Appels passés avec le dialer lemlist et leurs résumés.",
  async test(c) {
    await http(`${API}/team`, { headers: headers(c), label: "lemlist" });
  },
  async *list(c, since) {
    for (let offset = 0, i = 0; i < 40; i++) {
      const rows = (await http(`${API}/activities?type=callDone&limit=100&offset=${offset}`, { headers: headers(c), label: "lemlist" })) as any[];
      const list = Array.isArray(rows) ? rows : [];
      const recent = list.filter((a) => (toDate(a.createdAt) || new Date(0)) >= since);
      yield recent.map(map);
      if (list.length < 100 || recent.length < list.length) break;
      offset += 100;
    }
  },
};
