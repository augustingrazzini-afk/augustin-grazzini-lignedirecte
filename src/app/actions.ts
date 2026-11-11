"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isEmail, loginWithPassword, normEmail, resetPasswordWithToken, sendMagicLink } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";
import { requireOrgScope, requireUser } from "@/lib/access";
import { TRIAL_DAYS, isActive, maxClients } from "@/lib/billing";
import { randomToken, seal } from "@/lib/crypto";
import { getProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/types";
import { analyzeOrg, syncAndAnalyze, syncIntegration } from "@/lib/sync";
import { reapplyRules } from "@/lib/ingest";

export type FormState = { ok?: string; error?: string } | null;
const s = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

/* ---------- Connexion ---------- */
export async function requestLogin(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, "email", 254);
  if (!isEmail(normEmail(email))) return { error: "Adresse email invalide." };
  try {
    await sendMagicLink(email, { redirect: s(f, "next") || undefined });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Envoi impossible." };
  }
  return { ok: "Lien envoyé. Ouvrez votre boîte mail et cliquez sur le lien (valable 30 minutes)." };
}

const nextPath = (v: string) => (v.startsWith("/") && !v.startsWith("//") ? v : "/app");

/** Inscription : le mot de passe n'est enregistré qu'au clic sur le lien de confirmation envoyé par email. */
export async function signup(_: FormState, f: FormData): Promise<FormState> {
  const email = normEmail(s(f, "email", 254));
  const pw = String(f.get("password") ?? "");
  if (!isEmail(email)) return { error: "Adresse email invalide." };
  if (f.get("accept") !== "on") return { error: "Acceptez les conditions générales pour continuer." };
  const problem = passwordProblem(pw, email);
  if (problem) return { error: problem };
  try {
    const existing = await db.user.findUnique({ where: { email }, select: { passwordHash: true } });
    if (existing?.passwordHash) {
      // Pas d'information sur l'existence du compte dans la réponse : on prévient par email.
      await sendMagicLink(email, { intro: "Vous avez déjà un compte Trustpipe avec cette adresse. Utilisez ce lien pour vous connecter, ou « Mot de passe oublié » si besoin." });
    } else {
      await sendMagicLink(email, { purpose: "verify", payload: await hashPassword(pw), redirect: "/onboarding" });
    }
  } catch (e) { return fail(e); }
  return { ok: `Presque fini : nous avons envoyé un email de confirmation à ${email}. Cliquez sur le lien pour activer votre compte (pensez aux spams).` };
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
  return { ok: me.passwordHash ? "Mot de passe modifié." : "Mot de passe enregistré : vous pouvez maintenant vous connecter avec." };
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* ---------- Création de l'espace ---------- */
export async function createOrganization(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  if (u.memberships.length) redirect("/app");
  const name = s(f, "name", 80);
  if (name.length < 2) return { error: "Indiquez le nom de votre activité." };
  await db.organization.create({
    data: { name, offer: s(f, "offer", 2000), trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5), members: { create: { userId: u.id, role: "owner" } } },
  });
  redirect("/app/sources");
}

async function writableOrg(clientFilter?: string | null) {
  const scope = await requireOrgScope(clientFilter);
  const org = await db.organization.findUniqueOrThrow({ where: { id: scope.orgId } });
  if (!isActive(org)) throw new Error("Votre essai est terminé : choisissez un abonnement pour continuer.");
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

/* ---------- Clients ---------- */
export async function createClient(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope, org } = await writableOrg();
    const name = s(f, "name", 80);
    if (name.length < 2) return { error: "Indiquez le nom du client." };
    const count = await db.client.count({ where: { orgId: scope.orgId } });
    if (count >= maxClients(org)) return { error: `Votre formule est limitée à ${maxClients(org)} clients. Passez à la formule Équipe pour en ajouter.` };
    const c = await db.client.create({ data: { orgId: scope.orgId, name } });
    const list = s(f, "list", 200);
    if (list) {
      await db.clientRule.create({ data: { orgId: scope.orgId, clientId: c.id, field: "list", value: list } });
      await reapplyRules(scope.orgId);
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
    if (!client) return { error: "Client introuvable." };
    const email = normEmail(s(f, "email", 254));
    if (!isEmail(email)) return { error: "Adresse email invalide." };
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
    await db.clientMember.upsert({ where: { clientId_userId: { clientId, userId: user.id } }, update: {}, create: { clientId, userId: user.id } });
    await sendMagicLink(email, { redirect: `/portal/${clientId}`, intro: `${org.name} vous ouvre votre espace de suivi des appels « ${client.name} ».` });
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
    if (!(await db.client.count({ where: { id: clientId, orgId: scope.orgId } }))) return { error: "Client introuvable." };
    const field = s(f, "field", 20);
    if (!["list", "campaign", "tag", "number", "company"].includes(field)) return { error: "Critère invalide." };
    const value = s(f, "value", 200);
    if (!value) return { error: "Indiquez une valeur." };
    const provider = s(f, "provider", 20) || null;
    await db.clientRule.create({ data: { orgId: scope.orgId, clientId, field, value, provider } });
    const n = await reapplyRules(scope.orgId);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: n ? `Règle ajoutée : ${n} appel(s) déjà existants rangés chez ce client.` : "Règle ajoutée." };
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

/* ---------- Équipe ---------- */
export async function inviteTeammate(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { scope, org } = await writableOrg();
    if (scope.role !== "owner") return { error: "Réservé au propriétaire de l'espace." };
    const email = normEmail(s(f, "email", 254));
    if (!isEmail(email)) return { error: "Adresse email invalide." };
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
