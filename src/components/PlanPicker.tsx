import { PAID_PLANS, PERIOD_IDS, PLANS, PLAN_FEATURES, type Period } from "@/lib/billing";
import { paymentLink, stripeEnabled } from "@/lib/stripe";
import { PlanCards } from "./client/PlanCards";

/**
 * Les 3 formules, au mois, au trimestre ou à l'année. Essentiel est mise en avant ; Découverte est volontairement limitée (sans IA).
 * Paiement par lien Stripe ou par Checkout quand la clé live est configurée.
 */
export function PlanPicker({ email, orgId, canBuy = true }: { email: string; orgId: string; canBuy?: boolean }) {
  const viaLink = !stripeEnabled();
  const cards = PAID_PLANS.map((id) => ({
    id, name: PLANS[id].name, ...PLAN_FEATURES[id],
    links: Object.fromEntries(PERIOD_IDS.map((p) => [p, viaLink ? paymentLink(id, email, orgId, p) : null])) as Record<Period, string | null>,
  }));
  return <PlanCards cards={cards} canBuy={canBuy} checkout={stripeEnabled()} />;
}
