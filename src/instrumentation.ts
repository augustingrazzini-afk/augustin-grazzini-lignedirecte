/**
 * Suivi maison des erreurs serveur : chaque erreur non gérée est enregistrée (page, message, code) et l'éditeur
 * est prévenu par email, au plus une fois par erreur et par jour. Aucune donnée de prospect n'est conservée ici.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const e = err as { message?: string; digest?: string };
    const message = String(e?.message || err).slice(0, 500);
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(message + (e?.digest || ""))) return;
    const path = request.path.split("?")[0].replace(/\/suivi\/[^/]+/, "/suivi/…").slice(0, 200); // jamais de jeton ni de paramètres
    const { db } = await import("@/lib/db");
    await db.errorLog.create({ data: { path, method: request.method, message, digest: String(e?.digest || "").slice(0, 60) } });
    const to = process.env.FEEDBACK_EMAIL;
    if (!to) return;
    const { bumpUsage } = await import("@/lib/usage");
    const { sha256 } = await import("@/lib/crypto");
    if ((await bumpUsage(`erralert:${sha256(path + message).slice(0, 16)}`)) !== 1) return;
    if ((await bumpUsage("erralert-total")) > 5) return;
    const { sendEmail } = await import("@/lib/email");
    const text = `Erreur serveur sur Trustpipe\n\nPage : ${request.method} ${path}\nMessage : ${message}\nCode : ${e?.digest || "-"}\n\nDétail dans votre espace, page Inscriptions, bloc « Erreurs récentes ».`;
    await sendEmail(to, "Trustpipe : erreur serveur", text.replace(/\n/g, "<br>"), text);
  } catch (e2) { console.error("suivi des erreurs", e2); }
}
