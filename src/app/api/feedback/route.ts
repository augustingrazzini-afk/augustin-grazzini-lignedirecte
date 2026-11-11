import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { jsonError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const Body = z.object({
  message: z.string().trim().min(3).max(4000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  page: z.string().max(300).optional(),
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Case « Votre avis » : réservée aux personnes connectées, 10 avis par heure au plus. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const u = await currentUser();
  if (!u) return jsonError("Connectez-vous pour donner votre avis.", 401);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return jsonError("Écrivez au moins quelques mots.");
  const recent = await db.feedback.count({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - 3600e3) } } });
  if (recent >= 10) return jsonError("Merci ! Vous avez déjà envoyé beaucoup d'avis, réessayez dans une heure.", 429);
  const orgId = u.memberships[0]?.orgId ?? null;
  const clientId = !orgId ? u.clientAccess[0]?.clientId ?? null : null;
  const f = await db.feedback.create({ data: { userId: u.id, email: u.email, orgId, clientId, rating: b.data.rating ?? null, message: b.data.message, page: b.data.page } });
  const to = process.env.FEEDBACK_EMAIL;
  if (to) {
    const stars = f.rating ? "★".repeat(f.rating) + "☆".repeat(5 - f.rating) : "sans note";
    const text = `Nouvel avis de ${u.email} (${stars})\nPage : ${f.page || "?"}\n\n${f.message}`;
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0B122F"><p><b>Nouvel avis</b> de ${esc(u.email)} · ${stars}</p><p style="color:#59628A;font-size:13px">Page : ${esc(f.page || "?")}</p><blockquote style="border-left:3px solid #31D287;margin:0;padding:8px 14px;white-space:pre-wrap">${esc(f.message)}</blockquote></div>`;
    await sendEmail(to, `Trustpipe : nouvel avis (${stars})`, html, text).catch((e) => console.error("email avis", e));
  }
  return NextResponse.json({ ok: true });
}
