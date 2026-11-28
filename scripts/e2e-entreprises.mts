// Parcours complet dans un navigateur (dirigeant, commercial invité, formules). Voir le haut du fichier pour le lancement :
// serveur local sur le port 3123 (next start) avec AUTH_SECRET de 40 « x » et les STRIPE_LINK_*, puis
// DATABASE_URL=… npx tsx scripts/e2e-entreprises.mts
import { SignJWT } from "jose"; import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)("playwright");
const { db } = await import("../src/lib/db");
const SP = process.env.SHOTS || "/tmp/trustpipe-e2e", BASE = "http://localhost:3123";
const tag = Date.now().toString(36);
const jwtFor = (id: string) => new SignJWT({ sub: id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("x".repeat(40)));
const issues: string[] = [];
const b = await chromium.launch();
async function page(userId: string) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies([{ name: "cockpit_session", value: await jwtFor(userId), url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => issues.push("JS " + p.url() + " " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/_vercel\/insights|favicon|Failed to load resource.*(404|401)/.test(m.text())) issues.push("console " + p.url() + " " + m.text().slice(0, 200)); });
  p.on("response", (r) => { if (r.status() >= 500) issues.push("HTTP " + r.status() + " " + r.url()); });
  return p;
}
const check = async (p: any, path: string, expect: RegExp, shot?: string) => {
  const r = await p.goto(BASE + path, { waitUntil: "networkidle" });
  const txt = await p.locator("body").innerText();
  if (!new RegExp(expect.source, "i").test(txt)) issues.push("ATTENDU " + expect + " sur " + path + " (url " + p.url() + ", statut " + r?.status() + ")");
  if (/Application error|Une erreur est survenue|Internal Server Error/i.test(txt)) issues.push("ERREUR AFFICHÉE sur " + path);
  if (shot) await p.screenshot({ path: SP + "/" + shot + ".png", fullPage: true });
};
// 1. Nouveau dirigeant : onboarding → choix de formule
const boss = await db.user.create({ data: { email: "boss_" + tag + "@exemple.fr" } });
const pb = await page(boss.id);
await pb.goto(BASE + "/onboarding");
await pb.fill("input[name=name]", "Nova Logiciels " + tag);
await pb.click("button:has-text('Créer mon espace')");
await pb.waitForURL(/paiement/, { timeout: 20000 }).catch(() => issues.push("onboarding: pas redirigé vers /paiement (" + pb.url() + ")"));
const forms = await pb.locator("form.price").count();
if (forms !== 3) issues.push("essai: " + forms + " formules au lieu de 3");
const actions = await pb.locator("form.price").evaluateAll((fs: any[]) => fs.map((f) => f.action + "|" + [...new FormData(f).entries()].map(([k, v]: any) => k + "=" + v).join("&")));
for (const a of actions) if (!/buy\.stripe\.com/.test(a) || !/client_reference_id=/.test(a) || !/prefilled_email=/.test(a)) issues.push("essai: lien de paiement incomplet " + a);
await pb.screenshot({ path: SP + "/1-essai.png", fullPage: true });
const org = await db.organization.findFirstOrThrow({ where: { members: { some: { userId: boss.id } } } });
// 2. Paiement Essentiel pour 2 commerciaux (comme le webhook)
await db.organization.update({ where: { id: org.id }, data: { plan: "agency", seats: 2, subscriptionStatus: "active", stripeSubscriptionId: "sub_" + tag } });
await check(pb, "/app", /Premiers pas/, "2-pilotage-vide");
await check(pb, "/app/clients", /Ajouter un commercial/);
// 3. Ajout de 2 commerciaux, le 3e refusé
async function addRep(name: string, kind: string, email: string, rep: string) {
  await pb.goto(BASE + "/app/clients");
  await pb.fill("input[name=name]", name); await pb.selectOption("select[name=kind]", kind);
  if (kind !== "interne") await pb.fill("input[name=agency]", name);
  if (email) await pb.fill("input[name=email]", email);
  if (rep) await pb.fill("input[name=rep]", rep);
  await pb.click("button:has-text('Ajouter le commercial')");
  await pb.waitForTimeout(2500);
  return pb.url();
}
const u1 = await addRep("Léa Martin", "interne", "lea_" + tag + "@exemple.fr", "Léa Martin");
if (!/\/app\/clients\/c/.test(u1)) issues.push("ajout commercial 1 : pas de redirection fiche (" + u1 + ")");
await pb.screenshot({ path: SP + "/3-fiche.png", fullPage: true });
const u2 = await addRep("Prospectio", "agence", "", "Karim");
if (!/\/app\/clients\/c/.test(u2)) issues.push("ajout commercial 2 : pas de redirection (" + u2 + ")");
await addRep("Troisième", "freelance", "", "");
const body3 = await pb.locator("body").innerText();
if (!/couvre 2 commercial/i.test(body3)) issues.push("3e commercial : limite non affichée");
const reps = await db.client.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
if (reps.length !== 2) issues.push("commerciaux en base : " + reps.length);
const leaUser = await db.user.findUnique({ where: { email: "lea_" + tag + "@exemple.fr" }, include: { clientAccess: true } });
if (!leaUser?.clientAccess.length) issues.push("invitation : accès commercial non créé");
// 4. Appels : outil partagé (règle par nom) + appel non attribué
const { upsertCalls } = await import("../src/lib/ingest");
const mk = (i: number, rep: string, rdv = false) => ({ externalId: tag + "-" + i, startedAt: new Date(Date.now() - i * 60e3), durationSec: 80 + i, status: "connected", connected: true, meetingBooked: rdv, firstName: "Prospect", lastName: "N" + i, company: "Boîte " + i, repName: rep, summary: "Résumé de test " + i });
await upsertCalls({ orgId: org.id, provider: "minari" }, [mk(1, "Léa Martin", true), mk(2, "Léa Martin"), mk(3, "Karim"), mk(4, "Inconnu")] as any);
await check(pb, "/app", /Vos commerciaux[\s\S]*Léa Martin[\s\S]*Prospectio[\s\S]*Non attribués/, "4-pilotage");
await check(pb, "/app/calls?f=all", /Tous les commerciaux[\s\S]*Léa Martin/, "5-appels");
await check(pb, "/app/calls?f=all&client=" + reps[0].id, /N1|N2/);
const callId = (await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: tag + "-1" } })).id;
await check(pb, "/app/calls/" + callId, /Commercial[\s\S]*Attribuer/, "6-fiche-appel");
for (const [path, re] of [["/app/clients/" + reps[0].id, /Inviter Léa Martin|Inviter une autre/], ["/app/sources", /Sources|outil/i], ["/app/relances", /Relances/], ["/app/rendez-vous", /rendez-vous/i], ["/app/settings", /Réglages/], ["/app/billing", /Essentiel/], ["/app/coach", /inclus dans la formule Premium/], ["/app/brief", /inclus dans la formule Premium/]] as [string, RegExp][]) await check(pb, path, re, path.replace(/\//g, "_"));
// 5. Espace du commercial invité
const pl = await page(leaUser!.id);
await check(pl, "/portal/" + reps[0].id, /Bienvenue[\s\S]*Branchez votre outil/, "7-portail");
await check(pl, "/portal/" + reps[0].id + "/calls?f=all", /N1/);
const leak = await pl.locator("body").innerText();
if (/N3|N4/.test(leak)) issues.push("FUITE : le commercial voit des appels d'un autre");
await check(pl, "/portal/" + reps[0].id + "/sources", /outil|Minari/i, "8-portail-sources");
const other = await pl.goto(BASE + "/portal/" + reps[1].id); const t = await pl.locator("body").innerText();
if (/Karim|N3/.test(t) && !/introuvable|404|accès/i.test(t)) issues.push("FUITE : le commercial ouvre l'espace d'un autre (" + pl.url() + ")");
const bossAsRep = await pl.goto(BASE + "/app"); if (/\/app$/.test(pl.url()) && /Vos commerciaux/.test(await pl.locator("body").innerText())) issues.push("FUITE : le commercial accède à l'espace dirigeant");
// 6. Premium débloque l'assistant ; Découverte affiche la formule
await db.organization.update({ where: { id: org.id }, data: { plan: "premium" } });
await check(pb, "/app/coach", /Qui a pris le plus de rendez-vous/, "9-assistant-premium");
await db.organization.update({ where: { id: org.id }, data: { plan: "starter" } });
await check(pb, "/app/billing", /Découverte/);
await check(pb, "/app", /Vos commerciaux/);
// 7. Pages publiques
const pp = await page(boss.id); await pp.context().clearCookies();
for (const [path, re] of [["/", /Tous vos commerciaux/], ["/assistant", /assistant IA/i], ["/claude", /Claude/], ["/cgv", /19,99/], ["/inscription", /Créer votre compte/], ["/login", /Connexion/]] as [string, RegExp][]) await check(pp, path, re);
await pp.setViewportSize({ width: 390, height: 844 }); await check(pp, "/", /Tous vos commerciaux/, "10-mobile");
const sw = await pp.evaluate(() => document.documentElement.scrollWidth); if (sw > 392) issues.push("mobile : défilement horizontal (" + sw + "px)");
await b.close();
// Nettoyage
await db.call.deleteMany({ where: { orgId: org.id } }); await db.organization.delete({ where: { id: org.id } });
await db.user.deleteMany({ where: { email: { in: [boss.email, "lea_" + tag + "@exemple.fr"] } } });
await db.$disconnect();
console.log(issues.length ? "PROBLÈMES:\n" + issues.join("\n") : "AUCUN PROBLÈME");
