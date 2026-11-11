import Stripe from "stripe";
import { db } from "./db";

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
let s: Stripe | null = null;
export const stripe = () => (s ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

export const PRICE_FOR: Record<"solo" | "agency", () => string | undefined> = {
  solo: () => process.env.STRIPE_PRICE_SOLO,
  agency: () => process.env.STRIPE_PRICE_AGENCY,
};

export function planForPrice(priceId: string | undefined): "solo" | "agency" | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_AGENCY) return "agency";
  if (priceId && priceId === process.env.STRIPE_PRICE_SOLO) return "solo";
  return null;
}

/** Recopie l'état d'un abonnement Stripe sur l'organisation. */
export async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await db.organization.findFirst({ where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: customerId }] } });
  if (!org) return;
  const plan = planForPrice(sub.items.data[0]?.price.id);
  // Essai avec carte enregistrée : on garde « trialing » et la date de fin donnée par Stripe.
  const status = sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : sub.status === "past_due" || sub.status === "unpaid" ? "past_due" : "canceled";
  await db.organization.update({
    where: { id: org.id },
    data: { stripeSubscriptionId: sub.id, stripeCustomerId: customerId, subscriptionStatus: status, ...(plan ? { plan } : {}),
      ...(sub.status === "trialing" && sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}) },
  });
}
