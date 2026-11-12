import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { applySubscription, stripe, stripeEnabled, webhookSecrets } from "@/lib/stripe";

/**
 * Notifications Stripe. Deux modes :
 * - clé secrète configurée : webhook créé automatiquement, l'abonnement est relu chez Stripe ;
 * - liens de paiement (sans clé secrète) : secret STRIPE_LINK_WEBHOOK_SECRET, tout est lu dans la notification
 *   (client_reference_id = espace Trustpipe, metadata.plan = formule).
 */
export async function POST(req: Request) {
  const linkSecret = process.env.STRIPE_LINK_WEBHOOK_SECRET || "";
  if (!stripeEnabled() && !linkSecret) return NextResponse.json({ error: "stripe off" }, { status: 503 });
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();
  // La vérification de signature n'utilise que le secret du webhook, pas la clé API.
  const verifier = stripeEnabled() ? stripe() : new Stripe("sk_verification_seulement");
  const secrets = [...(stripeEnabled() ? await webhookSecrets() : []), ...(linkSecret ? [linkSecret] : [])];
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try { event = verifier.webhooks.constructEvent(body, sig, secret); break; } catch { /* secret suivant */ }
  }
  if (!event) return NextResponse.json({ error: "signature invalide" }, { status: 400 });

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
    const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
    if (stripeEnabled()) {
      if (s.client_reference_id && customer) await db.organization.update({ where: { id: s.client_reference_id }, data: { stripeCustomerId: customer } }).catch(() => {});
      if (subId) await applySubscription(await stripe().subscriptions.retrieve(subId));
    } else if (s.client_reference_id) {
      // Lien de paiement : essai de 14 jours avec carte enregistrée, la formule vient des métadonnées du lien.
      const plan = s.metadata?.plan === "agency" ? "agency" : s.metadata?.plan === "solo" ? "solo" : null;
      await db.organization.update({
        where: { id: s.client_reference_id },
        data: { ...(customer ? { stripeCustomerId: customer } : {}), ...(subId ? { stripeSubscriptionId: subId } : {}), ...(plan ? { plan } : {}), subscriptionStatus: "trialing", trialEndsAt: new Date(Date.now() + 14 * 864e5) },
      }).catch((e) => console.error("webhook lien de paiement", e));
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    // L'objet abonnement complet est dans la notification : pas besoin de la clé API.
    await applySubscription(event.data.object as Stripe.Subscription);
  }
  return NextResponse.json({ received: true });
}
