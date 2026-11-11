import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { applySubscription, stripe, stripeEnabled } from "@/lib/stripe";

/**
 * Retour de Stripe Checkout. On vérifie la session directement auprès de Stripe (sans attendre le webhook)
 * pour ouvrir l'accès tout de suite. Le webhook confirmera de son côté, sans effet de bord.
 */
export async function GET(req: Request) {
  const app = process.env.APP_URL || new URL(req.url).origin;
  const id = new URL(req.url).searchParams.get("session_id") || "";
  const u = await currentUser();
  const org = u?.memberships[0]?.org;
  if (!u || !org || !stripeEnabled() || !id.startsWith("cs_")) return NextResponse.redirect(new URL("/essai", app), 303);
  try {
    const s = await stripe().checkout.sessions.retrieve(id, { expand: ["subscription"] });
    if (s.client_reference_id !== org.id || s.status !== "complete" || !s.subscription || typeof s.subscription === "string") {
      return NextResponse.redirect(new URL("/essai?erreur=1", app), 303);
    }
    await applySubscription(s.subscription);
  } catch (e) {
    console.error("retour checkout", e);
    return NextResponse.redirect(new URL("/essai?erreur=1", app), 303);
  }
  return NextResponse.redirect(new URL("/app/sources?bienvenue=1", app), 303);
}
