import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { bumpUsage } from "@/lib/usage";
import { dayKey, timeFR } from "@/lib/format";
import { OBJ_LABEL } from "@/lib/format";
import { csvCell } from "@/lib/csv";

export const maxDuration = 120;

const HEAD = ["Date", "Heure (Paris)", "Commercial", "Prospect", "Entreprise", "Poste", "Durée (s)", "Décroché", "RDV pris", "Statut", "Liste", "Source", "Objections", "Résumé", "Analyse IA", "Transcription"];

/** Export de tous les appels de l'entreprise (réversibilité). Réservé aux membres de l'entreprise, pas aux commerciaux invités. */
export async function GET() {
  const u = await currentUser();
  const m = u?.memberships[0];
  if (!u || !m) return new Response("Accès refusé", { status: 403 });
  if ((await bumpUsage(`export:${m.orgId}`)) > 10) return new Response("Limite de 10 exports par jour atteinte.", { status: 429 });
  const orgId = m.orgId;
  const reps = new Map((await db.client.findMany({ where: { orgId }, select: { id: true, name: true } })).map((r) => [r.id, r.name]));
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      // BOM + point-virgule : s'ouvre directement dans Excel en français.
      ctrl.enqueue(enc.encode("﻿" + HEAD.map(csvCell).join(";") + "\r\n"));
      let cursor: string | undefined;
      for (let page = 0; page < 200; page++) {
        const rows = await db.call.findMany({ where: { orgId }, orderBy: { id: "asc" }, take: 1000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
        if (!rows.length) break;
        cursor = rows[rows.length - 1].id;
        let out = "";
        for (const c of rows) {
          const tr = Array.isArray(c.transcript) ? (c.transcript as { s?: string; t?: string }[]).map((l) => `${l.s ? l.s + " : " : ""}${l.t || ""}`).join("\n") : "";
          out += [dayKey(c.startedAt), timeFR(c.startedAt), (c.clientId && reps.get(c.clientId)) || c.repName, `${c.firstName} ${c.lastName}`.trim(), c.company, c.jobTitle, c.durationSec,
            c.connected ? "oui" : "non", c.meetingBooked ? "oui" : "non", c.kind === "meeting" ? "rendez-vous" : c.status, c.listName, c.provider,
            c.objections.map((o) => OBJ_LABEL[o] || o).join(", "), c.summary, c.aiSummary, tr].map(csvCell).join(";") + "\r\n";
        }
        ctrl.enqueue(enc.encode(out));
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="trustpipe-appels-${dayKey(new Date())}.csv"`, "Cache-Control": "private, no-store" } });
}
