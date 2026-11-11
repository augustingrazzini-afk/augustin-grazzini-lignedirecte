// Périodes d'affichage des statistiques : jour, semaine, mois, trimestre, année.
import { TZ } from "./format";

export const PERIODS = [
  { days: 1, label: "Jour" },
  { days: 7, label: "Semaine" },
  { days: 30, label: "Mois" },
  { days: 90, label: "Trimestre" },
  { days: 365, label: "Année" },
] as const;

/** Lit la période demandée dans l'URL ; 30 jours par défaut. `allowed` restreint les choix (ex. le coach IA). */
export function pickDays(v?: string, allowed: readonly number[] = PERIODS.map((p) => p.days)): number {
  const n = Number(v);
  return allowed.includes(n) ? n : 30;
}

/** Minuit, heure de Paris, du jour de `now`. */
export function startOfDayParis(now = new Date()): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  const parisAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = parisAsUtc - Math.floor(now.getTime() / 1000) * 1000; // avance de Paris sur UTC
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset);
}

/** Début de la période : « Jour » = depuis minuit (Paris), sinon les N derniers jours glissants. */
export function periodStart(days: number, now = new Date()): Date {
  return days === 1 ? startOfDayParis(now) : new Date(now.getTime() - days * 864e5);
}
