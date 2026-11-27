import { PAID_PLANS, PLANS, PLAN_FEATURES, euros } from "@/lib/billing";
import { paymentLink, stripeEnabled } from "@/lib/stripe";

/**
 * Les 3 formules par commercial suivi. Essentiel est mise en avant ; Découverte est volontairement limitée (sans IA).
 * Paiement par lien Stripe (nombre de commerciaux choisi chez Stripe) ou par Checkout quand la clé live est configurée.
 */
export function PlanPicker({ email, orgId, canBuy = true }: { email: string; orgId: string; canBuy?: boolean }) {
  const viaLink = !stripeEnabled();
  return (
    <div className="grid g-3e plans">
      {PAID_PLANS.map((id) => {
        const p = PLANS[id], f = PLAN_FEATURES[id], best = id === "agency", link = viaLink ? paymentLink(id, email, orgId) : null;
        return (
          <form key={id} action={link || "/api/billing"} method={link ? "get" : "post"} className={`card price${best ? " lp-best" : ""}${id === "starter" ? " plan-low" : ""}`}>
            {link ? Array.from(new URL(link).searchParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
              : <><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={id} /></>}
            <div className="plan-top"><h2>{p.name}</h2><span className={`pill${best ? " win" : " mute"}`}>{f.tag}</span></div>
            <div className="amt" style={{ whiteSpace: "nowrap" }}>{euros(p.price)} €</div>
            <div className="muted small" style={{ margin: "-4px 0 10px" }}>HT / mois, par commercial suivi</div>
            <ul>
              {f.yes.map((t) => <li key={t}>{t}</li>)}
              {f.no.map((t) => <li key={t} className="plan-no">{t}</li>)}
            </ul>
            {canBuy && <button className={`btn${best ? " primary" : ""}`} disabled={!link && !stripeEnabled()}>{best ? "Choisir Essentiel" : `Choisir ${p.name}`}</button>}
          </form>
        );
      })}
    </div>
  );
}
