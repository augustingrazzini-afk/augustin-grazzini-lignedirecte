import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { applySubscription, stripe, stripeEnabled, webhookSecrets } from "@/lib/stripe";

export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "stripe off" }, { status: 503 });
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();
  let event: Stripe.Event | null = null;
  for (const secret of await webhookSecrets()) {
    try { event = stripe().webhooks.constructEvent(body, sig, secret); break; } catch { /* secret suivant */ }
  }
  if (!event) return NextResponse.json({ error: "signature invalide" }, { status: 400 });
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.client_reference_id && s.customer) {
      await db.organization.update({ where: { id: s.client_reference_id }, data: { stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id } }).catch(() => {});
    }
    if (s.subscription) await applySubscription(await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id));
  } else if (event.type.startsWith("customer.subscription.")) {
    await applySubscription(event.data.object as Stripe.Subscription);
  }
  return NextResponse.json({ received: true });
}
