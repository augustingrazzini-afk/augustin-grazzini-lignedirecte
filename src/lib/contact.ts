import { open, seal } from "./crypto";

/** Coordonnées d'un prospect (téléphone, email) : chiffrées dans la base, déchiffrées seulement à l'affichage. */
export type Contact = { phone: string; email: string };

const cleanPhone = (p?: string | null) => (p || "").trim().replace(/[^\d+ ().-]/g, "").slice(0, 32);
const cleanEmail = (e?: string | null) => { const v = (e || "").trim().toLowerCase().slice(0, 254); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ""; };

export function sealContact(phone?: string | null, email?: string | null): string | null {
  const c = { phone: cleanPhone(phone), email: cleanEmail(email) };
  if (!c.phone && !c.email) return null;
  try { return seal(c); } catch { return null; } // clé de chiffrement absente : on ne stocke rien plutôt qu'en clair
}

export function openContact(sealed?: string | null): Contact | null {
  if (!sealed) return null;
  try { const c = open<Partial<Contact>>(sealed); return { phone: cleanPhone(c.phone), email: cleanEmail(c.email) }; } catch { return null; }
}

/** Numéro lisible : +33612345678 devient +33 6 12 34 56 78 ; les autres formats sont laissés tels quels. */
export function prettyPhone(p: string) {
  const d = p.replace(/[^\d+]/g, "");
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(d);
  return fr ? `+33 ${fr[1]} ${fr[2]} ${fr[3]} ${fr[4]} ${fr[5]}` : p;
}
