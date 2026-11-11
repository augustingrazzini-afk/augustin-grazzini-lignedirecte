import Stripe from "stripe";
import { createHash } from "node:crypto";
import { db } from "./db";
import { open, seal } from "./crypto";
import { PLANS } from "./billing";

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
let s: Stripe | null = null;
export const stripe = () => (s ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

type Plan = "solo" | "agency";
/** Clé de recherche stable des prix : les prix sont retrouvés (ou créés) sur le compte Stripe de la clé, quel qu'il soit. */
const LOOKUP: Record<Plan, string> = { solo: "trustpipe_solo_mensuel_eur", agency: "trustpipe_equipe_mensuel_eur" };
const ENV: Record<Plan, () => string | undefined> = { solo: () => process.env.STRIPE_PRICE_SOLO, agency: () => process.env.STRIPE_PRICE_AGENCY };
const cache = new Map<Plan, string>();
/** Code fiscal Stripe : logiciel SaaS à usage professionnel (exigé par Stripe Tax / Managed Payments). */
const TAX_CODE = "txcd_10103001";

/** Ajoute le code fiscal au produit du prix s'il manque (produits créés avant cette règle). */
async function ensureTaxCode(st: Stripe, price: Stripe.Price) {
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  const product = typeof price.product === "string" ? await st.products.retrieve(productId) : (price.product as Stripe.Product);
  if (!product.tax_code) await st.products.update(productId, { tax_code: TAX_CODE });
}

/** Identifiant du prix Stripe d'une formule. Crée le produit et le prix s'ils n'existent pas encore sur ce compte. */
export async function priceFor(plan: Plan): Promise<string> {
  const hit = cache.get(plan);
  if (hit) return hit;
  const st = stripe();
  const envId = ENV[plan]();
  if (envId) {
    try {
      const p = await st.prices.retrieve(envId);
      if (p.active) { await ensureTaxCode(st, p); cache.set(plan, p.id); return p.id; }
    } catch { /* prix d'un autre compte ou d'un autre mode : on passe à la recherche */ }
  }
  const found = await st.prices.list({ lookup_keys: [LOOKUP[plan]], active: true, limit: 1 });
  if (found.data[0]) { await ensureTaxCode(st, found.data[0]); cache.set(plan, found.data[0].id); return found.data[0].id; }
  const info = PLANS[plan];
  const product = await st.products.create({
    name: `Trustpipe ${info.name}`,
    description: plan === "solo" ? "Reporting de prospection par client, 3 clients suivis" : "Reporting de prospection par client, clients illimités, toute l'équipe",
    tax_code: TAX_CODE,
    metadata: { app: "trustpipe", plan },
  });
  const price = await st.prices.create({
    product: product.id, currency: "eur", unit_amount: info.price * 100, recurring: { interval: "month" },
    tax_behavior: "exclusive", lookup_key: LOOKUP[plan], transfer_lookup_key: true, metadata: { app: "trustpipe", plan },
  });
  cache.set(plan, price.id);
  return price.id;
}

export function planForPrice(price: Stripe.Price | undefined | null): Plan | null {
  if (!price) return null;
  if (price.lookup_key === LOOKUP.agency || price.id === process.env.STRIPE_PRICE_AGENCY || price.metadata?.plan === "agency") return "agency";
  if (price.lookup_key === LOOKUP.solo || price.id === process.env.STRIPE_PRICE_SOLO || price.metadata?.plan === "solo") return "solo";
  return null;
}

/** Mode de la clé (test ou réel) : le secret du webhook est propre au compte et au mode. */
const keyMode = () => ((process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") || (process.env.STRIPE_SECRET_KEY || "").startsWith("rk_live") ? "live" : "test");
const appUrl = () => (process.env.APP_URL || "").replace(/\/$/, "");
/** Un secret par compte, par mode et par adresse du site : changer de domaine recrée le webhook automatiquement. */
const webhookSecretKey = (app = appUrl()) => `stripe_webhook_${keyMode()}_${(process.env.STRIPE_SECRET_KEY || "").slice(8, 24)}_${createHash("sha256").update(app).digest("hex").slice(0, 12)}`;
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];

/** Crée le webhook Trustpipe sur le compte Stripe s'il n'existe pas, et garde son secret (chiffré). */
export async function ensureWebhook(app: string) {
  const key = webhookSecretKey(app.replace(/\/$/, ""));
  if (await db.appSecret.findUnique({ where: { key } })) return;
  const url = `${app}/api/stripe/webhook`;
  const st = stripe();
  const list = await st.webhookEndpoints.list({ limit: 100 });
  // Les anciens webhooks Trustpipe (autre adresse ou secret perdu) sont remplacés.
  for (const w of list.data) if (w.metadata?.app === "trustpipe") await st.webhookEndpoints.del(w.id);
  const w = await st.webhookEndpoints.create({ url, enabled_events: EVENTS, description: "Trustpipe (abonnements)", metadata: { app: "trustpipe" } });
  if (w.secret) await db.appSecret.upsert({ where: { key }, create: { key, value: seal(w.secret) }, update: { value: seal(w.secret) } });
}

/** Secrets acceptés pour vérifier la signature des webhooks Stripe. */
export async function webhookSecrets(): Promise<string[]> {
  const out: string[] = [];
  if (process.env.STRIPE_WEBHOOK_SECRET) out.push(process.env.STRIPE_WEBHOOK_SECRET);
  const rows = await db.appSecret.findMany({ where: { key: { startsWith: `stripe_webhook_${keyMode()}_${(process.env.STRIPE_SECRET_KEY || "").slice(8, 24)}` } }, orderBy: { updatedAt: "desc" }, take: 3 });
  for (const r of rows) out.push(open<string>(r.value));
  return out;
}

/** Portail client Stripe (changer de carte, de formule, résilier) : créé automatiquement s'il n'est pas configuré. */
export async function portalSession(customer: string, returnUrl: string) {
  const st = stripe();
  try {
    return await st.billingPortal.sessions.create({ customer, return_url: returnUrl });
  } catch (e) {
    if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
    const [solo, agency] = await Promise.all([priceFor("solo"), priceFor("agency")]);
    const [ps, pa] = await Promise.all([st.prices.retrieve(solo), st.prices.retrieve(agency)]);
    const conf = await st.billingPortal.configurations.create({
      business_profile: { headline: "Trustpipe : gérez votre abonnement" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations",
          products: [{ product: ps.product as string, prices: [solo] }, { product: pa.product as string, prices: [agency] }] },
      },
    });
    return st.billingPortal.sessions.create({ customer, return_url: returnUrl, configuration: conf.id });
  }
}

/** Recopie l'état d'un abonnement Stripe sur l'organisation. */
export async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await db.organization.findFirst({ where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: customerId }] } });
  if (!org) return;
  const plan = planForPrice(sub.items.data[0]?.price);
  // Essai avec carte enregistrée : on garde « trialing » et la date de fin donnée par Stripe.
  const status = sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : sub.status === "past_due" || sub.status === "unpaid" ? "past_due" : "canceled";
  await db.organization.update({
    where: { id: org.id },
    data: { stripeSubscriptionId: sub.id, stripeCustomerId: customerId, subscriptionStatus: status, ...(plan ? { plan } : {}),
      ...(sub.status === "trialing" && sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}) },
  });
}
