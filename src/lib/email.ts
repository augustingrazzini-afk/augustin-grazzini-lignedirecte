const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type LinkPurpose = "login" | "verify" | "reset";
const COPY: Record<LinkPurpose, { subject: (app: string) => string; lead: string; cta: string; validity: string }> = {
  login: { subject: (a) => `${a} : votre lien de connexion`, lead: "Cliquez pour vous connecter.", cta: "Se connecter", validity: "30 minutes" },
  verify: { subject: (a) => `${a} : confirmez votre adresse email`, lead: "Bienvenue ! Confirmez votre adresse email pour activer votre compte et démarrer votre essai.", cta: "Confirmer mon email", validity: "24 heures" },
  reset: { subject: (a) => `${a} : réinitialisez votre mot de passe`, lead: "Vous avez demandé à changer votre mot de passe. Cliquez pour en choisir un nouveau.", cta: "Choisir un nouveau mot de passe", validity: "30 minutes" },
};

export async function sendLoginEmail(to: string, link: string, intro?: string, purpose: LinkPurpose = "login") {
  const app = process.env.APP_NAME || "Trustpipe";
  const c = COPY[purpose];
  const subject = intro && purpose === "login" ? `${app} : votre accès` : c.subject(app);
  const text = `${intro ? intro + "\n\n" : ""}${c.lead} (lien valable ${c.validity}) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0B122F">
<p style="font-size:20px;font-weight:700;margin:0 0 16px"><span style="color:#0C3D2F">Trust</span><span style="color:#31D287">pipe</span></p>${intro ? `<p>${esc(intro)}</p>` : ""}
<p>${esc(c.lead)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0C3D2F;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(c.cta)}</a></p>
<p style="color:#59628A;font-size:13px">Lien valable ${c.validity}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p></div>`;
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY manquant : impossible d'envoyer l'email de connexion");
    console.log(`\n[email de connexion pour ${to}] ${link}\n`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text, html }),
  });
  if (!r.ok) throw new Error(`Envoi de l'email impossible (${r.status})`);
}

/** Email générique (récap des relances…). En développement sans clé Resend : affiché dans les logs. */
export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") return;
    console.log(`\n[email pour ${to}] ${subject}\n${text}\n`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text, html }),
  });
  if (!r.ok) throw new Error(`Envoi de l'email impossible (${r.status})`);
}
