"use server";

import { redirect } from "next/navigation";
import { PRO_EMAIL_MESSAGE, isPersonalEmail } from "@/lib/pro-email";
import { domainReceivesMail } from "@/lib/pro-email-server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isEmail, loginWithPassword, normEmail, resetPasswordWithToken, safeRedirect, sendMagicLink } from "@/lib/auth";
import { headers } from "next/headers";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { createSession, destroySession, revokeSessions } from "@/lib/session";
import { requireOrgScope, requireUser } from "@/lib/access";
import { TRIAL_DAYS, isActive, maxClients, PLAN_CAP } from "@/lib/billing";
import { randomToken, seal } from "@/lib/crypto";
import { getProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/types";
import { analyzeOrg, syncAndAnalyze, syncIntegration } from "@/lib/sync";
import { reapplyRules } from "@/lib/ingest";

export type FormState = { ok?: string; error?: string } | null;
const s = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

/* ---------- Connexion ---------- */
/** Limite par adresse IP sur les formulaires qui envoient un email (en plus de la limite par adresse email). */
async function tooManyFromIp(what: string, max: number) {
  const ip = ((await headers()).get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
  const { bumpUsage } = await import("@/lib/usage");
  return (await bumpUsage(`ip:${what}:${ip}`)) > max;
}
const TOO_MANY = { error: "Trop de demandes depuis votre connexion aujourd'hui. Réessayez demain ou écrivez-nous." };

export async function requestLogin(_: FormState, f: FormData): Promise<FormState> {
  if (await tooManyFromIp("login-link", 30)) return TOO_MANY;
  const email = s(f, "email", 254);
  if (!isEmail(normEmail(email))) return { error: "Adresse email invalide." };
  try {
    await sendMagicLink(email, { redirect: s(f, "next") || undefined });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Envoi impossible." };
  }
  return { ok: "Lien envoyé. Ouvrez votre boîte mail et cliquez sur le lien (valable 30 minutes)." };
}

const nextPath = (v: string) => safeRedirect(v) || "/app";

/** Fautes de frappe fréquentes sur les domaines d'email (gmai.com, hotmial.fr…). */
const DOMAIN_FIX: Record<string, string> = {
  "gmai.com": "gmail.com", "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmail.co": "gmail.com", "gmail.fr": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.cm": "gmail.com",
  "hotmial.fr": "hotmail.fr", "hotmal.fr": "hotmail.fr", "hotmai.fr": "hotmail.fr", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "outlok.fr": "outlook.fr", "outlook.fe": "outlook.fr", "outlok.com": "outlook.com", "yahoo.fe": "yahoo.fr", "yaho.fr": "yahoo.fr", "wanadoo.fe": "wanadoo.fr", "orange.fe": "orange.fr",
};
function emailTypo(email: string): string | null {
  const [local, domain] = email.split("@");
  const fix = DOMAIN_FIX[domain || ""];
  return fix ? `${local}@${fix}` : null;
}

/** Inscription : le mot de passe n'est enregistré qu'au clic sur le lien de confirmation envoyé par email. */
export async function signup(_: FormState, f: FormData): Promise<FormState> {
  const email = normEmail(s(f, "email", 254));
  const pw = String(f.get("password") ?? "");
  if (!isEmail(email)) return { error: "Adresse email invalide." };
  const typo = emailTypo(email);
  if (typo) return { error: `Vérifiez votre adresse : vouliez-vous dire ${typo} ?` };
  // Trustpipe est réservé aux entreprises : adresse professionnelle obligatoire (sauf adresses autorisées à la main, pour les tests).
  const allowed = (process.env.SIGNUP_ALLOW_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.includes(email) && isPersonalEmail(email)) return { error: PRO_EMAIL_MESSAGE };
  if (f.get("accept") !== "on") return { error: "Acceptez les conditions générales pour continuer." };
  if (await tooManyFromIp("signup", 20)) return TOO_MANY;
  if (!(await domainReceivesMail(email))) return { error: "Ce nom de domaine ne reçoit pas d'emails. Vérifiez l'orthographe de votre adresse." };
  const problem = passwordProblem(pw, email);
  if (problem) return { error: problem };
  try {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
    if (existing?.passwordHash) {
      // Pas d'information sur l'existence du compte dans la réponse : on prévient par email.
      await sendMagicLink(email, { intro: "Vous avez déjà un compte Trustpipe avec cette adresse. Utilisez ce lien pour vous connecter, ou « Mot de passe oublié » si besoin." });
    } else {
      const hash = await hashPassword(pw);
      // L'adresse doit être confirmée avant toute ouverture de compte : si l'email ne part pas, on demande de réessayer.
      await sendMagicLink(email, { purpose: "verify", payload: hash, redirect: "/onboarding" });
    }
  } catch (e) { if (isRedirectError(e)) throw e; return fail(e); }
  return { ok: email }; // l'écran de confirmation affiche l'adresse
}

export async function loginPassword(_: FormState, f: FormData): Promise<FormState> {
  const r = await loginWithPassword(s(f, "email", 254), String(f.get("password") ?? ""));
  if ("error" in r) return { error: r.error };
  await createSession(r.userId);
  redirect(nextPath(s(f, "next")));
}

export async function forgotPassword(_: FormState, f: FormData): Promise<FormState> {
  const email = normEmail(s(f, "email", 254));
  if (!isEmail(email)) return { error: "Adresse email invalide." };
  if (await tooManyFromIp("reset", 20)) return TOO_MANY;
  try {
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) await sendMagicLink(email, { purpose: "reset" });
  } catch (e) { return fail(e); }
  return { ok: "Si un compte existe avec cette adresse, vous allez recevoir un email pour choisir un nouveau mot de passe." };
}

export async function resetPassword(_: FormState, f: FormData): Promise<FormState> {
  const pw = String(f.get("password") ?? "");
  if (pw !== String(f.get("confirm") ?? "")) return { error: "Les deux mots de passe ne correspondent pas." };
  const r = await resetPasswordWithToken(s(f, "token", 200), pw);
  if ("error" in r) return { error: r.error };
  await createSession(r.userId);
  redirect("/app");
}

/** Réglages : définir ou changer son mot de passe (l'actuel est demandé s'il existe). */
export async function changePassword(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const pw = String(f.get("password") ?? "");
  const me = await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { email: true, passwordHash: true } });
  if (me.passwordHash && !(await verifyPassword(String(f.get("current") ?? ""), me.passwordHash))) return { error: "Mot de passe actuel incorrect." };
  const problem = passwordProblem(pw, me.email);
  if (problem) return { error: problem };
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw), failedLogins: 0, lockedUntil: null } });
  // Nouveau mot de passe : toutes les sessions ouvertes ailleurs sont coupées, celle-ci est recréée.
  await revokeSessions(u.id);
  await createSession(u.id);
  return { ok: me.passwordHash ? "Mot de passe modifié." : "Mot de passe enregistré : vous pouvez maintenant vous connecter avec." };
}

export async function logout() {
  // Se déconnecter invalide le jeton lui-même (et les autres sessions) : un cookie copié ne sert plus à rien.
  const { currentUser } = await import("@/lib/session");
  const me = await currentUser();
  if (me) await revokeSessions(me.id);
  await destroySession();
  redirect("/login");
}

/* ---------- Création de l'espace ---------- */
export async function createOrganization(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  if (u.memberships.length) redirect("/app");
  const name = s(f, "name", 80);
  if (name.length < 2) return { error: "Indiquez le nom de votre entreprise." };
  await db.organization.create({
    data: { name, offer: s(f, "offer", 2000), trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5), members: { create: { userId: u.id, role: "owner" } } },
  });
  redirect("/paiement");
}

async function writableOrg(clientFilter?: string | null) {
  const scope = await requireOrgScope(clientFilter);
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  if (!isActive(org)) throw new Error("Votre abonnement n'est plus actif : choisissez une formule pour continuer.");
  return { scope, org };
}
const fail = (e: unknown): FormState => ({ error: e instanceof Error ? e.message : "Action impossible." });

/* ---------- Offre ---------- */
export async function saveOffer(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope } = await writableOrg();
    const clientId = s(f, "clientId", 40);
    if (clientId) await db.client.updateMany({ where: { id: clientId, orgId: scope.orgId }, data: { offer: s(f, "offer", 3000) } });
    else await db.organization.update({ where: { id: scope.orgId }, data: { offer: s(f, "offer", 3000), name: s(f, "name", 80) || undefined } });
    revalidatePath("/app", "layout");
    return { ok: "Enregistré." };
  } catch (e) { return fail(e); }
}

/* ---------- Commerciaux (modèle technique : Client) ---------- */
export async function updateRep(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope } = await writableOrg();
    const name = s(f, "name", 80);
    if (name.length < 2) return { error: "Indiquez le nom du commercial." };
    const kind = ["interne", "freelance", "agence"].includes(s(f, "kind", 20)) ? s(f, "kind", 20) : "interne";
    await db.client.updateMany({ where: { id: s(f, "clientId", 40), orgId: scope.orgId }, data: { name, kind, agency: kind === "interne" ? "" : s(f, "agency", 80) } });
    revalidatePath("/app", "layout");
    return { ok: "Enregistré." };
  } catch (e) { return fail(e); }
}

export async function createClient(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope, org } = await writableOrg();
    const name = s(f, "name", 80);
    if (name.length < 2) return { error: "Indiquez le nom du commercial." };
    const email = normEmail(s(f, "email", 254));
    if (email && !isEmail(email)) return { error: "Adresse email invalide." };
    const count = await db.client.count({ where: { orgId: scope.orgId } });
    const max = maxClients(org);
    if (count >= max) return { error: `Votre formule est limitée à ${max} commerciaux. Pour en suivre plus : page Abonnement, « Gérer mon abonnement », passez à la formule supérieure.` };
    const kind = ["interne", "freelance", "agence"].includes(s(f, "kind", 20)) ? s(f, "kind", 20) : "interne";
    const c = await db.client.create({ data: { orgId: scope.orgId, name, kind, agency: kind === "interne" ? "" : s(f, "agency", 80) } });
    // Attribution automatique : son nom dans l'outil d'appel partagé, et/ou ses listes (sans doublon, 20 au plus).
    const lists = [...new Map(f.getAll("list").map((v) => String(v).trim().slice(0, 200)).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()].slice(0, 20);
    const rep = s(f, "rep", 120);
    const ruleRows = [...(rep ? [{ field: "rep", value: rep }] : []), ...lists.map((value) => ({ field: "list", value }))];
    if (ruleRows.length) {
      await db.clientRule.createMany({ data: ruleRows.map((r) => ({ orgId: scope.orgId, clientId: c.id, ...r })) });
      await reapplyRules(scope.orgId);
    }
    if (email) {
      const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
      await db.clientMember.upsert({ where: { clientId_userId: { clientId: c.id, userId: user.id } }, update: {}, create: { clientId: c.id, userId: user.id } });
      await sendMagicLink(email, { redirect: `/portal/${c.id}/sources`, intro: `${org.name} suit sa prospection avec Trustpipe. Branchez votre outil d'appel en 2 minutes : vos appels apparaîtront dans votre espace, avec leurs résumés et un assistant IA.` }).catch(() => {});
    }
    revalidatePath("/app/clients");
    redirect(`/app/clients/${c.id}`);
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    return fail(e);
  }
}

export async function deleteClient(f: FormData) {
  const { scope } = await writableOrg();
  if (scope.role !== "owner") throw new Error("Réservé au propriétaire");
  await db.client.deleteMany({ where: { id: s(f, "clientId", 40), orgId: scope.orgId } });
  redirect("/app/clients");
}

export async function inviteClientUser(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope, org } = await writableOrg();
    const clientId = s(f, "clientId", 40);
    const client = await db.client.findFirst({ where: { id: clientId, orgId: scope.orgId } });
    if (!client) return { error: "Commercial introuvable." };
    const email = normEmail(s(f, "email", 254));
    if (!isEmail(email)) return { error: "Adresse email invalide." };
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
    await db.clientMember.upsert({ where: { clientId_userId: { clientId, userId: user.id } }, update: {}, create: { clientId, userId: user.id } });
    await sendMagicLink(email, { redirect: `/portal/${clientId}/sources`, intro: `${org.name} suit sa prospection avec Trustpipe. Branchez votre outil d'appel en 2 minutes : vos appels apparaîtront dans votre espace « ${client.name} », avec leurs résumés et un assistant IA.` });
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: `Invitation envoyée à ${email}.` };
  } catch (e) { return fail(e); }
}

/** Crée (ou renouvelle) le lien de suivi en direct d'un client. Renouveler coupe l'ancien lien. */
export async function enableShareLink(f: FormData) {
  const { scope } = await writableOrg();
  const clientId = s(f, "clientId", 40);
  await db.client.updateMany({ where: { id: clientId, orgId: scope.orgId }, data: { shareToken: randomToken(24) } });
  revalidatePath(`/app/clients/${clientId}`);
}

/** Désactive le lien de suivi : il ne fonctionne plus du tout. */
export async function disableShareLink(f: FormData) {
  const { scope } = await writableOrg();
  const clientId = s(f, "clientId", 40);
  await db.client.updateMany({ where: { id: clientId, orgId: scope.orgId }, data: { shareToken: null } });
  revalidatePath(`/app/clients/${clientId}`);
}

export async function removeClientUser(f: FormData) {
  const { scope } = await writableOrg();
  const clientId = s(f, "clientId", 40);
  const ok = await db.client.count({ where: { id: clientId, orgId: scope.orgId } });
  if (ok) await db.clientMember.deleteMany({ where: { clientId, userId: s(f, "userId", 40) } });
  revalidatePath(`/app/clients/${clientId}`);
}

export async function addRule(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope } = await writableOrg();
    const clientId = s(f, "clientId", 40);
    if (!(await db.client.count({ where: { id: clientId, orgId: scope.orgId } }))) return { error: "Commercial introuvable." };
    const field = s(f, "field", 20);
    if (!["rep", "list", "campaign", "tag", "number", "company"].includes(field)) return { error: "Critère invalide." };
    const value = s(f, "value", 200);
    if (!value) return { error: "Indiquez une valeur." };
    const provider = s(f, "provider", 20) || null;
    await db.clientRule.create({ data: { orgId: scope.orgId, clientId, field, value, provider } });
    const n = await reapplyRules(scope.orgId);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: n ? `Règle ajoutée : ${n} appel(s) déjà existants attribués à ce commercial.` : "Règle ajoutée." };
  } catch (e) { return fail(e); }
}

export async function deleteRule(f: FormData) {
  const { scope } = await writableOrg();
  await db.clientRule.deleteMany({ where: { id: s(f, "ruleId", 40), orgId: scope.orgId } });
  revalidatePath(`/app/clients/${s(f, "clientId", 40)}`);
}

export async function assignCall(f: FormData) {
  const { scope } = await writableOrg();
  const clientId = s(f, "clientId", 40) || null;
  if (clientId && !(await db.client.count({ where: { id: clientId, orgId: scope.orgId } }))) return;
  await db.call.updateMany({ where: { id: s(f, "callId", 40), orgId: scope.orgId }, data: { clientId } });
  revalidatePath(`/app/calls/${s(f, "callId", 40)}`);
}

/**
 * Envoie un appel à un autre commercial (« écoute celui-ci ») : il apparaît dans son espace, avec un mot d'accompagnement.
 * L'attribution de l'appel ne change pas : il reste compté dans les chiffres de celui qui l'a passé.
 */
export async function shareCall(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope, org } = await writableOrg();
    const callId = s(f, "callId", 40), clientId = s(f, "clientId", 40), note = s(f, "note", 500);
    const [call, rep, me] = await Promise.all([
      db.call.findFirst({ where: { id: callId, orgId: scope.orgId }, select: { id: true, clientId: true, firstName: true, lastName: true, company: true, repName: true } }),
      db.client.findFirst({ where: { id: clientId, orgId: scope.orgId }, include: { members: { include: { user: { select: { email: true } } } } } }),
      db.user.findUnique({ where: { id: scope.userId }, select: { name: true, email: true } }),
    ]);
    if (!call) return { error: "Appel introuvable." };
    if (!rep) return { error: "Choisissez le commercial à qui envoyer l'appel." };
    if (call.clientId === rep.id) return { error: `${rep.name} voit déjà cet appel : c'est le sien.` };
    const fromName = me?.name || org.name;
    await db.callShare.upsert({ where: { callId_clientId: { callId, clientId } }, create: { callId, clientId, note, fromName }, update: { note, fromName, createdAt: new Date() } });
    // Prévenir le commercial par email, s'il a un accès. Un échec d'envoi ne bloque pas le partage.
    const who = [call.firstName, call.lastName].filter(Boolean).join(" ") || call.company || "un prospect";
    const link = `${(process.env.APP_URL || "https://trustpipe.fr").replace(/\/$/, "")}/portal/${rep.id}/calls/${call.id}`;
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
    const text = `${fromName} vous envoie un appel à écouter : ${who}${call.company && who !== call.company ? ` (${call.company})` : ""}${call.repName ? `, passé par ${call.repName}` : ""}.\n${note ? `\n« ${note} »\n` : ""}\nL'ouvrir : ${link}`;
    const html = `<p><b>${esc(fromName)}</b> vous envoie un appel à écouter : <b>${esc(who)}</b>${call.repName ? `, passé par ${esc(call.repName)}` : ""}.</p>${note ? `<blockquote>${esc(note)}</blockquote>` : ""}<p><a href="${link}">Ouvrir l'appel dans Trustpipe</a></p>`;
    const { sendEmail } = await import("@/lib/email");
    await Promise.all(rep.members.map((m) => sendEmail(m.user.email, `${fromName} vous envoie un appel à écouter`, html, text).catch(() => null)));
    revalidatePath(`/app/calls/${callId}`);
    return { ok: rep.members.length ? `Appel envoyé à ${rep.name} : il le voit dans son espace et reçoit un email.` : `Appel envoyé à ${rep.name}. Il n'a pas encore d'accès : invitez-le depuis sa fiche pour qu'il puisse l'ouvrir.` };
  } catch (e) { return fail(e); }
}

export async function unshareCall(f: FormData) {
  const { scope } = await writableOrg();
  const callId = s(f, "callId", 40);
  await db.callShare.deleteMany({ where: { callId, clientId: s(f, "clientId", 40), call: { orgId: scope.orgId } } });
  revalidatePath(`/app/calls/${callId}`);
}

/** Confirme (ou retire) à la main un rendez-vous pris sur un appel : réservé à l'entreprise, pas au commercial invité. */
export async function confirmMeeting(f: FormData) {
  const { scope } = await writableOrg();
  const callId = s(f, "callId", 40);
  await db.call.updateMany({ where: { id: callId, orgId: scope.orgId, kind: "call" }, data: { meetingBooked: f.get("value") === "1", aiMeeting: false } });
  revalidatePath(`/app/calls/${callId}`);
}

/** Suppression définitive de l'espace par son propriétaire : toutes les données, les accès et les comptes qui n'ont que cet espace. */
export async function deleteOrganization(_: FormState, f: FormData): Promise<FormState> {
  let gone = false;
  try {
    const scope = await requireOrgScope();
    if (scope.role !== "owner") return { error: "Réservé au propriétaire de l'espace." };
    const { isAdminOrg } = await import("@/lib/admin");
    if (isAdminOrg(scope.orgId)) return { error: "Cet espace ne peut pas être supprimé." };
    const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId }, include: { members: { select: { userId: true } } } });
    if (s(f, "confirm", 80).trim().toLowerCase() !== org.name.trim().toLowerCase()) return { error: `Pour confirmer, tapez exactement le nom de l'espace : ${org.name}` };
    // Un abonnement Stripe en cours continuerait d'être prélevé : il faut le résilier d'abord.
    if (org.stripeSubscriptionId?.startsWith("sub_") && ["active", "past_due", "trialing"].includes(org.subscriptionStatus) && !org.cancelRequestedAt)
      return { error: "Résiliez d'abord votre abonnement depuis la page Abonnement, puis revenez supprimer l'espace." };
    await db.organization.delete({ where: { id: org.id } }); // appels, commerciaux, outils, relances… supprimés en cascade
    for (const m of org.members) {
      const u = await db.user.findUnique({ where: { id: m.userId }, include: { memberships: true, clientAccess: true } });
      if (u && !u.memberships.length && !u.clientAccess.length) {
        await db.loginToken.deleteMany({ where: { email: u.email } });
        await db.user.delete({ where: { id: u.id } });
      }
    }
    gone = true;
  } catch (e) { return fail(e); }
  if (gone) { await destroySession(); redirect("/?espace=supprime"); }
  return {};
}

/* ---------- Équipe ---------- */
export async function inviteTeammate(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope, org } = await writableOrg();
    if (scope.role !== "owner") return { error: "Réservé au propriétaire de l'espace." };
    const email = normEmail(s(f, "email", 254));
    if (!isEmail(email)) return { error: "Adresse email invalide." };
    // Nombre de commerciaux limité par la formule : 1 en Solo, le nombre payé en Équipe.
    // Les membres de l'espace sont les dirigeants et managers de la boîte : pas de limite.
    // (L'abonnement compte les commerciaux suivis, voir createClient.)
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
    const other = await db.membership.findFirst({ where: { userId: user.id, NOT: { orgId: scope.orgId } } });
    if (other) return { error: "Cette personne a déjà son propre espace." };
    await db.membership.upsert({ where: { orgId_userId: { orgId: scope.orgId, userId: user.id } }, update: {}, create: { orgId: scope.orgId, userId: user.id, role: "member" } });
    await sendMagicLink(email, { redirect: "/app", intro: `${org.name} vous invite dans son espace.` });
    revalidatePath("/app/settings");
    return { ok: `Invitation envoyée à ${email}.` };
  } catch (e) { return fail(e); }
}

/* ---------- Intégrations ---------- */
export async function addIntegration(_: FormState, f: FormData): Promise<FormState> {
  let id = "";
  try {
    const providerId = s(f, "provider", 20);
    const clientId = s(f, "clientId", 40) || null;
    const u = await requireUser();
    // Un utilisateur de portail peut connecter SES outils : l'intégration appartient alors à son client.
    let orgId: string;
    if (clientId && u.clientAccess.some((a) => a.clientId === clientId)) {
      orgId = u.clientAccess.find((a) => a.clientId === clientId)!.client.orgId;
      // Un commercial invité branche un vrai outil d'appel : pas de source libre où l'on pourrait pousser de faux appels.
      if (["webhook", "custom"].includes(providerId) && !u.memberships.some((m) => m.orgId === orgId)) return { error: "Cette source est réservée à l'entreprise. Branchez votre outil d'appel (Minari, Aircall, Ringover…)." };
    } else {
      const { scope } = await writableOrg();
      orgId = scope.orgId;
      if (clientId && !(await db.client.count({ where: { id: clientId, orgId } }))) return { error: "Client introuvable." };
    }
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (!isActive(org)) return { error: "L'abonnement de cet espace n'est plus actif." };
    const p = getProvider(providerId);
    const creds: Record<string, string> = {};
    for (const fld of p.credentialFields) {
      const v = s(f, `cred_${fld.key}`, 2000);
      if (!v && !fld.optional) return { error: `Champ requis : ${fld.label}` };
      if (v) creds[fld.key] = v;
    }
    try {
      await p.test(creds);
    } catch (e) {
      return { error: e instanceof ProviderError ? e.message : "Impossible de joindre l'outil avec ces identifiants." };
    }
    const integ = await db.integration.create({ data: { orgId, clientId, provider: p.id, label: s(f, "label", 60) || p.label, credentials: seal(creds), webhookToken: randomToken(24) } });
    id = integ.id;
  } catch (e) { return fail(e); }
  // première synchro après la réponse : l'utilisateur n'attend pas la fin
  after(() => syncAndAnalyze(id, { full: true }).catch(() => {}));
  revalidatePath("/app/sources");
  return { ok: "Connecté. La première synchronisation (90 derniers jours) est en cours." };
}

async function ownedIntegration(f: FormData) {
  const u = await requireUser();
  const integ = await db.integration.findUnique({ where: { id: s(f, "integrationId", 40) } });
  if (!integ) throw new Error("Intégration introuvable");
  const isOrg = u.memberships.some((m) => m.orgId === integ.orgId);
  const isClientOwner = !!integ.clientId && u.clientAccess.some((a) => a.clientId === integ.clientId);
  if (!isOrg && !isClientOwner) throw new Error("Accès refusé");
  return integ;
}

export async function syncNow(f: FormData) {
  const integ = await ownedIntegration(f);
  try { await syncIntegration(integ.id); } catch { /* l'erreur est enregistrée sur l'intégration */ }
  // L'analyse IA des nouveaux appels continue après la réponse : l'utilisateur n'attend pas.
  after(() => analyzeOrg(integ.id));
  revalidatePath("/", "layout");
}

export async function deleteIntegration(f: FormData) {
  const integ = await ownedIntegration(f);
  await db.integration.delete({ where: { id: integ.id } });
  revalidatePath("/", "layout");
}

/* ---------- Alertes de relance ---------- */
export async function saveAlerts(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { isSlackWebhook } = await import("@/lib/digest");
    const u = await requireUser();
    const clientId = s(f, "clientId", 40) || null;
    const digest = f.get("digest") === "on";
    const slack = s(f, "slack", 300);
    if (slack && !isSlackWebhook(slack)) return { error: "Le lien Slack doit commencer par https://hooks.slack.com/services/…" };
    if (clientId) {
      const access = u.clientAccess.find((a) => a.clientId === clientId);
      const client = await db.client.findUnique({ where: { id: clientId } });
      const isOrg = !!client && u.memberships.some((m) => m.orgId === client.orgId);
      if (!access && !isOrg) return { error: "Accès refusé." };
      if (access) await db.clientMember.update({ where: { id: access.id }, data: { digest } });
      if (f.has("slack")) await db.client.update({ where: { id: clientId }, data: { slackWebhook: slack || null } });
      revalidatePath("/", "layout");
      return { ok: "Alertes enregistrées." };
    }
    const m = u.memberships[0];
    if (!m) return { error: "Accès refusé." };
    await db.membership.update({ where: { id: m.id }, data: { digest } });
    if (f.has("slack")) {
      if (m.role !== "owner") return { error: "Seul le propriétaire peut changer le lien Slack." };
      await db.organization.update({ where: { id: m.orgId }, data: { slackWebhook: slack || null } });
    }
    revalidatePath("/", "layout");
    return { ok: "Alertes enregistrées." };
  } catch (e) { return fail(e); }
}

/* ---------- Éditeur : activation manuelle d'un abonnement (paiement par lien Stripe) ---------- */
export async function adminSetSubscription(f: FormData) {
  const scope = await requireOrgScope();
  const { isAdminOrg } = await import("@/lib/admin");
  if (!isAdminOrg(scope.orgId)) return;
  const orgId = s(f, "orgId", 40);
  const what = s(f, "what", 20);
  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org || isAdminOrg(org.id)) return;
  if (what === "solo" || what === "agency") {
    await db.organization.update({ where: { id: org.id }, data: { plan: what, subscriptionStatus: "active", ...(org.stripeSubscriptionId ? {} : { stripeSubscriptionId: `manuel_${org.id}` }) } });
  } else if (what === "canceled") {
    await db.organization.update({ where: { id: org.id }, data: { subscriptionStatus: "canceled" } });
  } else if (what === "trial") {
    await db.organization.update({ where: { id: org.id }, data: { subscriptionStatus: "trialing", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5) } });
  }
  revalidatePath("/app/inscriptions");
}

/* ---------- Résiliation en un clic (paiement par liens Stripe, sans clé secrète) ---------- */
export async function requestCancel(f: FormData) {
  const scope = await requireOrgScope();
  if (scope.role !== "owner") return;
  const undo = f.get("undo") === "1";
  const org = await db.organization.update({ where: { id: scope.orgId }, data: { cancelRequestedAt: undo ? null : new Date() } });
  const me = await db.user.findUnique({ where: { id: scope.userId }, select: { email: true } });
  const { sendEmail } = await import("@/lib/email");
  const until = org.trialEndsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const stripeUrl = org.stripeSubscriptionId?.startsWith("sub_") ? `https://dashboard.stripe.com/subscriptions/${org.stripeSubscriptionId}` : "https://dashboard.stripe.com/subscriptions";
  const admin = process.env.FEEDBACK_EMAIL;
  try {
    if (admin) {
      const subject = undo ? `Résiliation annulée : ${org.name}` : `Résiliation demandée : ${org.name}`;
      const text = `${org.name} (${me?.email || "?"}) ${undo ? "a annulé sa demande de résiliation" : "demande à résilier son abonnement"}.\n${undo ? "" : `À faire : résilier dans Stripe avant le prochain prélèvement (${org.subscriptionStatus === "trialing" ? `fin d'essai le ${until}` : "fin du mois en cours"}).\n`}${stripeUrl}`;
      await sendEmail(admin, subject, text.replace(/\n/g, "<br>").replace(stripeUrl, `<a href="${stripeUrl}">${stripeUrl}</a>`), text);
    }
    if (me?.email && !undo) {
      const t = `Bonjour,\n\nVotre demande de résiliation de Trustpipe est bien enregistrée. Aucun autre prélèvement ne sera effectué. ${org.subscriptionStatus === "trialing" ? `Vous gardez l'accès jusqu'au ${until}.` : "Vous gardez l'accès jusqu'à la fin du mois en cours."}\n\nVous avez changé d'avis ? Annulez la résiliation depuis la page Abonnement.\n\nL'équipe Trustpipe`;
      await sendEmail(me.email, "Trustpipe : résiliation enregistrée", t.replace(/\n/g, "<br>"), t);
    }
  } catch (e) { console.error("email résiliation", e); }
  revalidatePath("/app/billing");
  redirect(undo ? "/app/billing?resumed=1" : "/app/billing?cancelled=1");
}

/** Coupe l'accès d'une connexion Claude (jeton du connecteur MCP) pour cet espace. */
export async function revokeMcpToken(f: FormData) {
  const scope = await requireOrgScope();
  await db.mcpToken.updateMany({ where: { id: s(f, "id", 40), orgId: scope.orgId, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/app/settings");
}

/** Relit tout l'historique de l'outil (90 jours) pour récupérer les enregistrements / liens d'écoute, après activation du partage. */
/**
 * « Récupérer les enregistrements » : vérifie d'abord, tout de suite, que l'outil fournit bien des enregistrements
 * (réponse claire à l'écran), puis complète l'historique. Pour Minari, le lien d'écoute se déduit de l'appel : c'est immédiat.
 */
export async function fetchRecordings(_: FormState, f: FormData): Promise<FormState> {
  try {
    const integ = await ownedIntegration(f);
    const { bumpUsage } = await import("@/lib/usage");
    if ((await bumpUsage(`recfetch:${integ.id}`)) > 10) return { error: "Vous avez déjà relancé la récupération plusieurs fois aujourd'hui. Réessayez demain, ou écrivez-nous." };
    const { getProvider } = await import("@/lib/providers");
    const { open } = await import("@/lib/crypto");
    const { listeningHelp } = await import("@/lib/listening");
    const p = getProvider(integ.provider);
    const scopeCalls = { orgId: integ.orgId, provider: integ.provider };
    // 1. Les appels récents de l'outil ont-ils un enregistrement ? (une seule page, quelques secondes)
    let sample: { recordingUrl?: string | null; connected?: boolean }[] = [];
    if (p.list) for await (const page of p.list(open<Record<string, string>>(integ.credentials), new Date(Date.now() - 21 * 864e5))) { sample = page; break; }
    const answered = sample.filter((c) => c.connected);
    if (!sample.length) return { error: `Aucun appel récent trouvé dans ${p.label} : passez un appel, puis réessayez.` };
    if (!sample.some((c) => c.recordingUrl)) {
      const h = listeningHelp(integ.provider, p.label);
      return { error: `${p.label} ne fournit pas encore d'enregistrement pour vos derniers appels${answered.length ? "" : " (aucun n'a été décroché récemment)"}. À faire dans ${p.label} : ${h.steps[0]} ${h.steps[1] || ""} Puis recliquez ici.` };
    }
    // 2. Historique. Minari : le lien d'écoute est l'adresse de partage de l'appel, on le pose d'un coup.
    if (integ.provider === "minari")
      await db.$executeRaw`UPDATE "Call" SET "recordingUrl" = 'https://app.minari.ai/shared/' || "externalId" WHERE "orgId" = ${integ.orgId} AND "provider" = 'minari' AND "durationSec" > 0 AND "recordingUrl" IS NULL`;
    else after(async () => { try { await syncIntegration(integ.id, { full: true }); } catch { /* l'erreur est enregistrée sur l'intégration */ } revalidatePath("/", "layout"); });
    const n = await db.call.count({ where: { ...scopeCalls, durationSec: { gt: 0 }, OR: [{ recordingUrl: { not: null } }, { recordingKey: { not: null } }] } });
    revalidatePath("/", "layout");
    return { ok: integ.provider === "minari" ? `Écoute activée : ${n} appel(s) écoutable(s) dès maintenant. Les prochains appels le seront automatiquement.`
      : `Écoute activée : ${n} appel(s) déjà écoutable(s). Le reste de l'historique (90 jours) se récupère en arrière-plan : comptez quelques minutes.` };
  } catch (e) { return fail(e); }
}
