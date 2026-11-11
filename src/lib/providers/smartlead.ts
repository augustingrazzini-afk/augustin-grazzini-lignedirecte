import { http, Provider, NormalizedActivity, str, toDate } from "./types";

// Smartlead (cold email). La clé passe en paramètre d'URL (côté serveur uniquement). Intégration bêta.
const API = "https://server.smartlead.ai/api/v1";

export const smartlead: Provider = {
  id: "smartlead",
  label: "Smartlead",
  beta: true,
  channels: ["email"],
  credentialFields: [{ key: "apiKey", label: "Clé API", type: "password", help: "Smartlead > Settings > API Key" }],
  help: "Envois, ouvertures, réponses et bounces de chaque campagne.",
  async test(c) {
    await http(`${API}/campaigns?api_key=${encodeURIComponent(c.apiKey)}`, { label: "Smartlead" });
  },
  async *listActivities(c, since) {
    const campaigns = (await http(`${API}/campaigns?api_key=${encodeURIComponent(c.apiKey)}`, { label: "Smartlead" })) as any[];
    for (const camp of Array.isArray(campaigns) ? campaigns.slice(0, 100) : []) {
      for (let offset = 0, i = 0; i < 50; i++) {
        const r = (await http(`${API}/campaigns/${camp.id}/statistics?api_key=${encodeURIComponent(c.apiKey)}&offset=${offset}&limit=100`, { label: "Smartlead" })) as any;
        const rows: any[] = r.data || [];
        const out: NormalizedActivity[] = [];
        for (const s of rows) {
          const [firstName, ...rest] = str(s.lead_name).split(/\s+/);
          const base = { email: str(s.lead_email) || undefined, firstName, lastName: rest.join(" "), campaign: str(camp.name), step: s.sequence_number != null ? Number(s.sequence_number) : null, subject: str(s.email_subject) };
          const id = str(s.stats_id || `${camp.id}-${s.lead_email}-${s.sequence_number}`);
          const push = (type: NormalizedActivity["type"], at: unknown) => { const d = toDate(at); if (d && d >= since) out.push({ ...base, externalId: `${id}:${type}`, channel: "email", type, occurredAt: d }); };
          push("sent", s.sent_time);
          push("opened", s.open_time);
          push("clicked", s.click_time);
          push("replied", s.reply_time);
          if (s.is_bounced) push("bounced", s.sent_time);
          if (s.is_unsubscribed) push("unsubscribed", s.sent_time);
        }
        yield out;
        if (rows.length < 100) break;
        offset += 100;
      }
    }
  },
};
