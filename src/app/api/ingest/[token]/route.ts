import { NextResponse, after } from "next/server";
import { processPendingAi } from "@/lib/ai";
import { db } from "@/lib/db";
import { isActive } from "@/lib/billing";
import { sha256 } from "@/lib/crypto";
import { upsertActivities, upsertCalls } from "@/lib/ingest";
import { ACTIVITY_TYPES, mapEventType, num, str, stripHtml, toDate, trimTranscript, type ActivityType, type NormalizedActivity, type NormalizedCall } from "@/lib/providers/types";

/**
 * Webhook universel : n'importe quel outil branché via Zapier, Make ou n8n envoie ici ses événements.
 * Le jeton dans l'URL identifie l'intégration (et donc l'espace et, le cas échéant, le client).
 *
 * Corps accepté : un événement, un tableau d'événements, ou { "events": [...] }. Champs (tous facultatifs sauf l'événement) :
 *   channel : "email" | "linkedin" | "call"        event : "sent", "replied", "invite_accepted", "call"… (ou le libellé de l'outil)
 *   occurred_at, first_name, last_name, full_name, company, job_title, email, linkedin_url, campaign, step,
 *   subject, body, rep, id ; pour un appel : duration (s ou mm:ss), outcome, meeting (bool), summary, transcript, recording_url
 */
// L'analyse IA des événements reçus continue après la réponse (after).
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const integ = token && token.length >= 20 ? await db.integration.findUnique({ where: { webhookToken: token }, include: { org: true } }) : null;
  if (!integ || integ.provider !== "webhook" || integ.status === "paused") return NextResponse.json({ error: "URL inconnue" }, { status: 404 });
  if (!isActive(integ.org)) return NextResponse.json({ error: "Abonnement inactif" }, { status: 402 });

  const raw = await req.text();
  if (raw.length > 2_000_000) return NextResponse.json({ error: "Trop volumineux (2 Mo max)" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const list = (Array.isArray(body) ? body : Array.isArray((body as any)?.events) ? (body as any).events : [body]).slice(0, 500) as Record<string, unknown>[];

  const calls: NormalizedCall[] = [], acts: NormalizedActivity[] = [], rejected: number[] = [];
  list.forEach((e, i) => {
    if (!e || typeof e !== "object") return rejected.push(i);
    const g = (...keys: string[]) => { for (const k of keys) if (e[k] != null && e[k] !== "") return e[k]; return undefined; };
    let first = str(g("first_name", "firstName", "prenom")), last = str(g("last_name", "lastName", "nom"));
    const full = str(g("full_name", "name", "fullName"));
    if (!first && !last && full) { const p = full.split(/\s+/); first = p.shift() || ""; last = p.join(" "); }
    const when = toDate(g("occurred_at", "date", "timestamp", "created_at")) || new Date();
    const channelRaw = str(g("channel", "canal")).toLowerCase();
    const eventRaw = str(g("event", "type", "event_type"));
    const common = { firstName: first, lastName: last, company: str(g("company", "entreprise", "company_name")), jobTitle: str(g("job_title", "title", "poste")), repName: str(g("rep", "sender", "user", "commercial")), campaign: str(g("campaign", "campagne", "sequence")) };
    const id = str(g("id", "event_id")) || sha256(JSON.stringify([when.toISOString(), channelRaw, eventRaw, first, last, common.company, g("email"), g("subject")])).slice(0, 32);

    if (channelRaw === "call" || channelRaw === "appel" || /^call|appel/.test(eventRaw.toLowerCase())) {
      const d = g("duration", "duree", "durée");
      const dur = typeof d === "string" && /^\d+:\d{1,2}$/.test(d) ? +d.split(":")[0] * 60 + +d.split(":")[1] : num(d);
      const outcome = str(g("outcome", "status", "resultat"));
      const meeting = g("meeting", "meeting_booked", "rdv") === true || /rdv|meeting|booked|rendez/i.test(outcome);
      const tr = str(g("transcript", "transcription"));
      calls.push({ ...common, externalId: id, startedAt: when, durationSec: dur, status: meeting ? "meeting-booked" : dur > 0 ? "connected" : outcome || "no-answer", connected: meeting || dur > 0, meetingBooked: meeting,
        phone: str(g("phone", "telephone")) || undefined, summary: str(g("summary", "notes", "resume")),
        transcript: tr ? trimTranscript(tr.split(/\n+/).filter(Boolean).map((t) => ({ s: "", t, ts: "" }))) : undefined,
        recordingUrl: /^https:\/\//.test(str(g("recording_url"))) ? str(g("recording_url")) : null });
      return;
    }
    const exact = (ACTIVITY_TYPES as readonly string[]).includes(eventRaw) ? { type: eventRaw as ActivityType, channel: channelRaw === "linkedin" ? "linkedin" as const : "email" as const } : mapEventType(`${channelRaw} ${eventRaw}`);
    if (!exact) return rejected.push(i);
    acts.push({ ...common, ...exact, externalId: id, occurredAt: when, email: str(g("email", "lead_email")) || undefined, linkedinUrl: str(g("linkedin_url", "linkedin")) || undefined,
      step: g("step") != null ? num(g("step")) : null, subject: str(g("subject", "objet")), body: stripHtml(g("body", "message", "text", "reply")) });
  });

  const t = { orgId: integ.orgId, provider: "webhook", integrationId: integ.id, clientId: integ.clientId };
  const [c, a] = await Promise.all([upsertCalls(t, calls), upsertActivities(t, acts)]);
  await db.integration.update({ where: { id: integ.id }, data: { lastSyncAt: new Date(), status: "active", lastError: rejected.length ? `${rejected.length} événement(s) non reconnu(s) au dernier envoi` : null } });
  const orgId = integ.orgId;
  after(() => processPendingAi({ orgId, limit: 100 }).catch((e) => console.error("analyse IA webhook", e)));
  return NextResponse.json({ ok: true, calls: c, activities: a, rejected });
}
