import { NextResponse } from "next/server";
import { apiScope } from "@/lib/access";
import { db } from "@/lib/db";
import { jsonError, sameOrigin } from "@/lib/api";
import { PRICE_FOR, stripe, stripeEnabled } from "@/lib/stripe";

/** POST form : action=checkout (plan=solo|agency) ou action=portal. Réservé au propriétaire de l'espace. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Origine refusée", 403);
  const scope = await apiScope(req);
  if (!scope || scope.kind !== "org" || scope.role !== "owner") return jsonError("Réservé au propriétaire de l'espace", 403);
  if (!stripeEnabled()) return jsonError("Le paiement n'est pas encore configuré.", 503);
  const form = await req.formData();
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  const app = process.env.APP_URL || new URL(req.url).origin;
  const user = await db.user.findUniqueOrThrow({ where: { id: scope.userId } });

  if (form.get("action") === "portal") {
    if (!org.stripeCustomerId) return NextResponse.redirect(new URL("/app/billing", app), 303);
    const p = await stripe().billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${app}/app/billing` });
    return NextResponse.redirect(p.url, 303);
  }
  const plan = form.get("plan") === "agency" ? "agency" : "solo";
  const price = PRICE_FOR[plan]();
  if (!price) return jsonError("Prix Stripe non configuré pour ce plan.", 503);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: org.id,
    ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : { customer_email: user.email }),
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: `${app}/app/billing?ok=1`,
    cancel_url: `${app}/app/billing`,
  });
  return NextResponse.redirect(session.url!, 303);
}
