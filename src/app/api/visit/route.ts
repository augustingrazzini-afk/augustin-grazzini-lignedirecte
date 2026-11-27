import { NextResponse } from "next/server";
import { bumpUsage } from "@/lib/usage";

/** Pages publiques comptées (affluence du site). Rien d'autre n'est accepté. */
const PAGES = new Set(["/", "/inscription", "/essai", "/login", "/cgv", "/confidentialite", "/assistant", "/claude"]);
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|linkedinbot|headless|lighthouse/i;

/**
 * Compteur de visites sans cookie ni donnée personnelle : on incrémente « page × jour » et « source × jour ».
 * Envoyé par le navigateur (VisitBeacon), une fois par page et par onglet.
 */
export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") || "")) return new NextResponse(null, { status: 204 });
  const b = (await req.json().catch(() => null)) as { p?: string; r?: string; u?: string; first?: boolean } | null;
  const p = String(b?.p || "");
  if (!PAGES.has(p)) return new NextResponse(null, { status: 204 });
  await bumpUsage(`visit:${p}`);
  if (b?.first) {
    let src = String(b.u || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
    if (!src) {
      try { src = new URL(String(b.r || "")).hostname.replace(/^www\./, "").slice(0, 60); } catch { src = ""; }
      if (src === "trustpipe.fr") src = "";
      // Applis mobiles (android-app://…) et domaines connus : nom lisible.
      if (/googlequicksearchbox|^google\.|\.google\./.test(src)) src = "google";
      else if (/linkedin|^lnkd\.in$/.test(src)) src = "linkedin";
      else if (/facebook|^fb\.|instagram/.test(src)) src = "facebook / instagram";
      else if (/whatsapp/.test(src)) src = "whatsapp";
    }
    await bumpUsage(`visitsrc:${src || "direct"}`);
  }
  return new NextResponse(null, { status: 204 });
}
