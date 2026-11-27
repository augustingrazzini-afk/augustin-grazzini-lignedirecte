/**
 * Une cellule CSV sûre : guillemets doublés, et une apostrophe devant tout ce qui ressemblerait à une formule
 * (=, +, -, @, tabulation) pour qu'un tableur n'exécute jamais un contenu venu d'un prospect.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

