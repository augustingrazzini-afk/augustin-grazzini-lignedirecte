"use client";
import { useState } from "react";
import { PERIODS, PERIOD_IDS, PLAN_PRICES, perMonth, euros, type Period } from "@/lib/billing";

type Card = { id: "starter" | "agency" | "premium"; name: string; tag: string; yes: string[]; no: string[]; links: Record<Period, string | null> };

/** Choix du rythme de paiement : mensuel, trimestriel ou annuel. */
export function PeriodToggle({ value, onChange, className = "seg" }: { value: Period; onChange: (p: Period) => void; className?: string }) {
  return (
    <div className={`${className} period-toggle`} role="group" aria-label="Rythme de paiement">
      {PERIOD_IDS.map((p) => (
        <button key={p} type="button" aria-pressed={p === value} aria-current={p === value ? "true" : undefined} onClick={() => onChange(p)}>
          {PERIODS[p].label}{PERIODS[p].note && <small> · {PERIODS[p].note}</small>}
        </button>
      ))}
    </div>
  );
}

/** Ce qui est prélevé à chaque échéance, en clair. */
export const billedLine = (id: Card["id"], period: Period) =>
  period === "month" ? "HT / mois, pour toute votre équipe" : `HT / mois · soit ${euros(PLAN_PRICES[id][period])} € HT ${PERIODS[period].each}`;

/** Les 3 formules à la souscription, avec le choix du rythme de paiement. Essentiel est mise en avant. */
export function PlanCards({ cards, canBuy, checkout }: { cards: Card[]; canBuy: boolean; checkout: boolean }) {
  const [period, setPeriod] = useState<Period>("month");
  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", margin: "0 0 16px" }}><PeriodToggle value={period} onChange={setPeriod} /></div>
      <div className="grid g-3e plans">
        {cards.map((c) => {
          const best = c.id === "agency", link = c.links[period];
          return (
            <form key={c.id} action={link || "/api/billing"} method={link ? "get" : "post"} className={`card price${best ? " lp-best" : ""}${c.id === "starter" ? " plan-low" : ""}`}>
              {link ? Array.from(new URL(link).searchParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
                : <><input type="hidden" name="action" value="checkout" /><input type="hidden" name="plan" value={c.id} /></>}
              <div className="plan-top"><h2>{c.name}</h2><span className={`pill${best ? " win" : " mute"}`}>{c.tag}</span></div>
              <div className="amt" style={{ whiteSpace: "nowrap" }}>{euros(perMonth(c.id, period))} €</div>
              <div className="muted small" style={{ margin: "-4px 0 10px" }}>{billedLine(c.id, period)}</div>
              <ul>
                {c.yes.map((t) => <li key={t}>{t}</li>)}
                {c.no.map((t) => <li key={t} className="plan-no">{t}</li>)}
              </ul>
              {canBuy && <button className={`btn${best ? " primary" : ""}`} disabled={!link && !checkout}>Essayer {c.name} 7 jours</button>}
            </form>
          );
        })}
      </div>
    </>
  );
}

/** Grille des tarifs du site public, avec le même choix de rythme. */
export function SitePrices({ cards, start }: { cards: Omit<Card, "links">[]; start: string }) {
  const [period, setPeriod] = useState<Period>("month");
  return (
    <>
      <PeriodToggle value={period} onChange={setPeriod} className="st-period" />
      <div className="st-pr">
        {cards.map((c) => (
          <div key={c.id} className={c.id === "agency" ? "best" : c.id === "starter" ? "low" : ""}>
            <h3>{c.name}<small>{c.tag.toUpperCase()}</small></h3>
            <div className="st-amt">{euros(perMonth(c.id, period))}€<span>{period === "month" ? "HT / MOIS, TOUTE L'ÉQUIPE" : `HT / MOIS · ${euros(PLAN_PRICES[c.id][period])} € HT ${PERIODS[period].each.toUpperCase()}`}</span></div>
            <ul>
              {c.yes.map((t) => <li key={t}>{t}</li>)}
              {c.no.map((t) => <li key={t} className="no">{t}</li>)}
            </ul>
            <a className="b" href={start}>ESSAYER 7 JOURS →</a>
          </div>
        ))}
      </div>
    </>
  );
}
