import { http, Provider, NormalizedActivity, str, stripHtml, toDate } from "./types";

// Instantly (cold email). API v2, jeton Bearer. Intégration bêta, à valider avec une vraie clé.
const API = "https://api.instantly.ai/api/v2";
const headers = (c: Record<string, string>) => ({ Authorization: `Bearer ${c.apiKey}`, Accept: "application/json" });

export const instantly: Provider = {
  id: "instantly",
  label: "Instantly",
  beta: true,
  channels: ["email"],
  credentialFields: [{ key: "apiKey", label: "Clé API (v2)", type: "password", help: "Instantly > Settings > Integrations > API keys (droits lecture)" }],
  help: "Emails envoyés et réponses reçues, par campagne.",
  async test(c) {
    await http(`${API}/campaigns?limit=1`, { headers: headers(c), label: "Instantly" });
  },
  async *listActivities(c, since) {
    const names = new Map<string, string>();
    let after = "";
    for (let i = 0; i < 20; i++) {
      const r = (await http(`${API}/campaigns?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`, { headers: headers(c), label: "Instantly" })) as any;
      for (const x of r.items || []) names.set(str(x.id), str(x.name));
      after = str(r.next_starting_after);
      if (!after) break;
    }
    after = "";
    for (let i = 0; i < 80; i++) {
      const q = new URLSearchParams({ limit: "100", min_timestamp_created: since.toISOString() });
      if (after) q.set("starting_after", after);
      const r = (await http(`${API}/emails?${q}`, { headers: headers(c), label: "Instantly" })) as any;
      const out: NormalizedActivity[] = [];
      for (const e of r.items || []) {
        const received = Number(e.ue_type) === 2 || /received|incoming|reply/i.test(str(e.ue_type ?? e.email_type));
        const lead = str(e.lead || e.lead_email || (received ? e.from_address_email : e.to_address_email_list));
        out.push({
          externalId: str(e.id), channel: "email", type: received ? "replied" : "sent",
          occurredAt: toDate(e.timestamp_email || e.timestamp_created) || new Date(),
          email: lead || undefined, campaign: names.get(str(e.campaign_id)) || "", step: e.step != null ? Number(e.step) : null,
          repName: str(received ? e.to_address_email_list : e.from_address_email).split(",")[0],
          subject: str(e.subject), body: received ? stripHtml(e.body?.text || e.body?.html || "") : "",
        });
      }
      yield out;
      after = str(r.next_starting_after);
      if (!after) break;
    }
  },
};
