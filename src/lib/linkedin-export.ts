// Exports natifs de LinkedIn (Préférences et confidentialité › Obtenir une copie de vos données) :
//  - Connections.csv : vos relations (First Name, Last Name, URL, Email Address, Company, Position, Connected On)
//  - messages.csv    : vos conversations (CONVERSATION ID, FROM, SENDER PROFILE URL, TO, RECIPIENT PROFILE URLS, DATE, SUBJECT, CONTENT…)
// Ils n'ont pas de colonne « événement » : on les convertit ici en événements LinkedIn.

export type LinkedinKind = "connections" | "messages";
export type LinkedinActivity = {
  key: string; // identifiant stable (pour l'anti-doublon)
  type: "invite_accepted" | "message_sent" | "replied";
  occurredAt: string;
  firstName: string; lastName: string; company: string; jobTitle: string;
  email?: string; linkedinUrl?: string; subject: string; body: string;
};

const has = (headers: string[], ...names: string[]) => names.every((n) => headers.some((h) => h.trim().toLowerCase() === n.toLowerCase()));

export function detectLinkedin(headers: string[]): LinkedinKind | null {
  if (has(headers, "First Name", "Last Name", "Connected On")) return "connections";
  if (has(headers, "CONVERSATION ID", "FROM", "TO", "DATE", "CONTENT")) return "messages";
  return null;
}

/** Connections.csv commence par quelques lignes de notes avant l'en-tête : on les retire. */
export function stripLinkedinPreamble(text: string): string {
  const i = text.search(/^First Name,Last Name/m);
  return i > 0 ? text.slice(i) : text;
}

const col = (r: Record<string, string>, name: string) => {
  const k = Object.keys(r).find((h) => h.trim().toLowerCase() === name.toLowerCase());
  return k ? String(r[k] ?? "").trim() : "";
};
const splitName = (full: string) => { const p = full.trim().split(/\s+/); return { firstName: p.shift() || "", lastName: p.join(" ") }; };
const iso = (v: string) => { const d = new Date(v); return isNaN(+d) ? null : d.toISOString(); };

export function convertLinkedin(kind: LinkedinKind, rows: Record<string, string>[]): { out: LinkedinActivity[]; skipped: number; owner?: string } {
  const out: LinkedinActivity[] = [];
  let skipped = 0;
  if (kind === "connections") {
    for (const r of rows) {
      const at = iso(col(r, "Connected On")), url = col(r, "URL");
      if (!at || (!url && !col(r, "Last Name"))) { skipped++; continue; }
      out.push({ key: `li-conn|${url || col(r, "First Name") + col(r, "Last Name")}`, type: "invite_accepted", occurredAt: at,
        firstName: col(r, "First Name"), lastName: col(r, "Last Name"), company: col(r, "Company"), jobTitle: col(r, "Position"),
        email: col(r, "Email Address") || undefined, linkedinUrl: url || undefined, subject: "", body: "" });
    }
    return { out, skipped };
  }
  // messages.csv : la personne qui apparaît le plus souvent en expéditeur est le titulaire du compte.
  const count = new Map<string, number>();
  for (const r of rows) { const f = col(r, "FROM"); if (f) count.set(f, (count.get(f) || 0) + 1); }
  const owner = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const r of rows) {
    const at = iso(col(r, "DATE")), from = col(r, "FROM");
    if (!at || !from || col(r, "FOLDER").toUpperCase() === "SPAM") { skipped++; continue; }
    const mine = from === owner;
    const name = mine ? col(r, "TO").split(",")[0] : from;
    const url = (mine ? col(r, "RECIPIENT PROFILE URLS").split(",")[0] : col(r, "SENDER PROFILE URL")).trim();
    if (!name && !url) { skipped++; continue; }
    out.push({ key: `li-msg|${col(r, "CONVERSATION ID")}|${at}|${from}`, type: mine ? "message_sent" : "replied", occurredAt: at,
      ...splitName(name), company: "", jobTitle: "", linkedinUrl: url || undefined,
      subject: col(r, "SUBJECT"), body: mine ? "" : col(r, "CONTENT") });
  }
  return { out, skipped, owner };
}
