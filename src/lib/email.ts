const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendLoginEmail(to: string, link: string, intro?: string) {
  const app = process.env.APP_NAME || "Cockpit";
  const subject = intro ? `${app} : votre accès` : `${app} : votre lien de connexion`;
  const text = `${intro ? intro + "\n\n" : ""}Cliquez pour vous connecter (valable 30 minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0B122F">
<p style="font-size:18px;font-weight:700;margin:0 0 16px">${esc(app)}</p>${intro ? `<p>${esc(intro)}</p>` : ""}
<p><a href="${esc(link)}" style="display:inline-block;background:#2E5BFF;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Se connecter</a></p>
<p style="color:#59628A;font-size:13px">Lien valable 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p></div>`;
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
