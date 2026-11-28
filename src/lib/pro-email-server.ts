import { emailDomain } from "./pro-email";

/**
 * Le domaine reçoit-il des emails ? Une adresse inventée sur un domaine sans messagerie est refusée.
 * En cas de doute (panne DNS, délai dépassé), on laisse passer : l'email de confirmation tranchera.
 */
export async function domainReceivesMail(email: string): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain) return false;
  try {
    const { resolveMx } = await import("node:dns/promises");
    const mx = await Promise.race([resolveMx(domain), new Promise<never>((_, no) => setTimeout(() => no(new Error("délai")), 2500))]);
    return mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (e) {
    const code = (e as { code?: string }).code;
    return !(code === "ENOTFOUND" || code === "ENODATA"); // domaine inexistant ou sans messagerie : refus ; autre erreur : on laisse passer
  }
}
