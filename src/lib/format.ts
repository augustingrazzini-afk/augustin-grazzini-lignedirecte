export const OBJ_LABEL: Record<string, string> = {
  relevance: "Pertinence",
  incumbent: "Solution en place",
  timing: "Timing",
  too_busy: "Pas le temps",
  authority: "Pas décideur",
  budget: "Budget",
  other: "Autre",
};

const TZ = "Europe/Paris";
export const fmt = (n: number) => Math.round(n || 0).toLocaleString("fr-FR");
export const pct = (n: number) => (Number.isFinite(n) ? n.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %" : "–");
export function fmtDuration(s: number) {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
export const dateFR = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: TZ });
export const timeFR = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
export const hourParis = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TZ }).format(d));
export const weekdayParis = (d: Date) => ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: TZ }).format(d)];
export function ago(d: Date | null | undefined) {
  if (!d) return "jamais";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

type NameLike = { firstName: string; lastName: string; company: string };
export const displayName = (c: NameLike) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || "Contact";
export const initials = (c: NameLike) => ((c.firstName[0] || "") + (c.lastName[0] || "") || c.company[0] || "?").toUpperCase();
export const isConversation = (c: { durationSec: number; connected: boolean }) => c.connected && c.durationSec >= 30;
