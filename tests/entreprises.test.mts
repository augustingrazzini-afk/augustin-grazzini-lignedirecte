import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "crypto";

// Virage « entreprises » : la boîte suit ses commerciaux (modèle Client), 3 formules par commercial.
process.env.APP_URL = "https://trustpipe.test";
const { db } = await import("../src/lib/db");
const { upsertCalls, reapplyRules, routeClient } = await import("../src/lib/ingest");
const billing = await import("../src/lib/billing");
const { planForPrice } = await import("../src/lib/stripe");
const { assertPremium, assertAi } = await import("../src/lib/api");
const { rankReps } = await import("../src/components/views/Leaderboard");
const { callScope } = await import("../src/lib/access");
const { registerClient, checkAuthorize, issueCode, exchangeToken } = await import("../src/lib/mcp-server");
const mcp = await import("../src/app/api/mcp/route");

const tag = Date.now().toString(36);
const org = await db.organization.create({ data: { name: `Boîte ${tag}`, plan: "agency", seats: 2, subscriptionStatus: "active", trialEndsAt: new Date() } });
const lea = await db.client.create({ data: { orgId: org.id, name: "Léa Martin", kind: "interne" } });
const agence = await db.client.create({ data: { orgId: org.id, name: "Prospectio", kind: "agence", agency: "Prospectio" } });
const boss = await db.user.create({ data: { email: `boss_${tag}@exemple.fr` } });
await db.membership.create({ data: { orgId: org.id, userId: boss.id } });

after(async () => {
  await db.mcpToken.deleteMany({ where: { userId: boss.id } });
  await db.mcpCode.deleteMany({ where: { userId: boss.id } });
  await db.call.deleteMany({ where: { orgId: org.id } });
  await db.organization.deleteMany({ where: { id: org.id } });
  await db.user.deleteMany({ where: { id: boss.id } });
  await db.$disconnect();
});

const call = (id: string, extra: Record<string, unknown> = {}) => ({ externalId: `${tag}-${id}`, startedAt: new Date(), durationSec: 95, status: "connected", connected: true, meetingBooked: false, firstName: "Paul", lastName: id, company: "Atelier", ...extra });

test("attribution : un appel est rangé chez le commercial selon son nom dans l'outil partagé", async () => {
  await db.clientRule.create({ data: { orgId: org.id, clientId: lea.id, field: "rep", value: "Léa Martin" } });
  const rules = await db.clientRule.findMany({ where: { orgId: org.id } });
  assert.equal(routeClient({ ...call("x"), repName: "  léa martin " } as never, "minari", rules), lea.id, "insensible à la casse et aux espaces");
  assert.equal(routeClient({ ...call("y"), repName: "Karim" } as never, "minari", rules), null);
  await upsertCalls({ orgId: org.id, provider: "minari" }, [call("a", { repName: "Léa Martin", meetingBooked: true }), call("b", { repName: "Karim" })] as never);
  const a = await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: `${tag}-a` } });
  const b = await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: `${tag}-b` } });
  assert.equal(a.clientId, lea.id);
  assert.equal(b.clientId, null, "commercial inconnu : non attribué");
  // Règle ajoutée après coup : les appels déjà là sont rattrapés.
  await db.clientRule.create({ data: { orgId: org.id, clientId: agence.id, field: "rep", value: "Karim" } });
  assert.equal(await reapplyRules(org.id), 1);
  assert.equal((await db.call.findUniqueOrThrow({ where: { id: b.id } })).clientId, agence.id);
});

test("outil branché par le commercial : ses appels lui reviennent d'office", async () => {
  await upsertCalls({ orgId: org.id, provider: "aircall", clientId: agence.id }, [call("c", { repName: "Léa Martin" })] as never);
  assert.equal((await db.call.findFirstOrThrow({ where: { orgId: org.id, externalId: `${tag}-c` } })).clientId, agence.id, "l'outil branché prime sur les règles");
});

test("cloisonnement : le commercial ne voit que ses appels, le dirigeant voit tout", async () => {
  const mine = await db.call.findMany({ where: callScope({ kind: "client", orgId: org.id, clientId: lea.id, userId: "u" } as never) });
  assert.ok(mine.length > 0 && mine.every((c) => c.clientId === lea.id));
  const all = await db.call.count({ where: callScope({ kind: "org", orgId: org.id, userId: boss.id, role: "owner" } as never) });
  assert.equal(all, 3);
});

test("classement : par rendez-vous, « Non attribués » toujours en dernier, taux en pourcentage", () => {
  const reps = [lea, agence];
  const mk = (clientId: string | null, rdv = false, connected = true) => ({ kind: "call", clientId, connected, durationSec: 60, meetingBooked: rdv, startedAt: new Date("2026-11-19T15:10:00Z") });
  const rows = rankReps([mk(null, true), mk(null, true), mk(agence.id, true), mk(lea.id), mk(lea.id, false, false)], reps);
  assert.deepEqual(rows.map((r) => r.name), ["Prospectio", "Léa Martin", "Non attribués"]);
  assert.equal(rows[1].rate, 50);
  assert.equal(rankReps([], reps).some((r) => !r.id), false, "pas de ligne « Non attribués » vide");
});

test("formules : limites de commerciaux et fonctions IA", () => {
  const { maxClients, hasPremium, hasAi, PAID_PLANS, PLANS } = billing;
  assert.deepEqual([...PAID_PLANS], ["starter", "agency", "premium"]);
  assert.deepEqual(PAID_PLANS.map((p) => PLANS[p].price), [29.99, 99.99, 199.99]);
  // Prix fixe par formule : le nombre de commerciaux dépend de la formule, pas d'une quantité payée.
  assert.equal(maxClients({ plan: "starter", seats: 1 }), 2, "Découverte : 2 commerciaux");
  assert.equal(maxClients({ plan: "agency", seats: 1 }), 4, "Essentiel : 4 commerciaux");
  assert.equal(maxClients({ plan: "agency", seats: 9 }), 4);
  assert.equal(maxClients({ plan: "premium", seats: 1 }), 10, "Premium : 10 commerciaux, au-delà sur devis");
  assert.equal(maxClients({ plan: "solo", seats: 1 }), 3, "anciennes formules conservées");
  assert.deepEqual(["starter", "agency", "premium", "trial", "solo"].map((p) => [hasAi({ plan: p }), hasPremium({ plan: p })]),
    [[false, false], [true, false], [true, true], [true, true], [true, true]]);
});

test("Stripe : chaque prix retrouve sa formule", () => {
  const price = (lookup_key: string | null, plan?: string) => ({ id: "price_x", lookup_key, metadata: plan ? { plan } : {} }) as never;
  assert.equal(planForPrice(price("trustpipe_decouverte_mensuel_eur")), "starter");
  assert.equal(planForPrice(price("trustpipe_equipe_mensuel_eur")), "agency");
  assert.equal(planForPrice(price("trustpipe_premium_mensuel_eur")), "premium");
  assert.equal(planForPrice(price(null, "premium")), "premium");
  assert.equal(planForPrice(price(null)), null);
});

test("Assistant inclus dès Essentiel ; connecteur Claude bloqué en Essentiel, ouvert en Premium", async () => {
  const scope = { kind: "org", orgId: org.id, userId: boss.id, role: "owner" } as never;
  assert.equal(await assertAi(scope), null, "assistant ouvert en Essentiel");
  const r = await assertPremium(scope);
  assert.equal(r?.status, 402);
  assert.match(String((await r!.json()).error), /Premium/);

  const reg = await registerClient({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  const verifier = randomBytes(32).toString("base64url");
  const p = await checkAuthorize({ response_type: "code", client_id: reg!.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const code = new URL(await issueCode(p as never, boss.id, org.id)).searchParams.get("code")!;
  const tok = await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: reg!.client_id }));
  const access = (tok as { body: { access_token: string } }).body.access_token;
  const callTool = async () => (await (await mcp.POST(new Request("https://trustpipe.test/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "lister_clients", arguments: {} } }) }))).json()).result;
  const blocked = await callTool();
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].text, /Premium/);

  await db.organization.update({ where: { id: org.id }, data: { plan: "premium" } });
  assert.equal(await assertPremium(scope), null);
  const okRes = await callTool();
  assert.notEqual(okRes.isError, true);
  assert.match(okRes.content[0].text, /Léa Martin/);
});

test("webhook Stripe (liens de paiement) : la formule payée est activée", async () => {
  process.env.STRIPE_LINK_WEBHOOK_SECRET = "whsec_test_entreprises";
  delete process.env.STRIPE_SECRET_KEY;
  const Stripe = (await import("stripe")).default;
  const hook = await import("../src/app/api/stripe/webhook/route");
  const o2 = await db.organization.create({ data: { name: `Paie ${tag}`, trialEndsAt: new Date() } });
  const send = async (event: object) => {
    const payload = JSON.stringify(event);
    const header = new Stripe("sk_x").webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_LINK_WEBHOOK_SECRET! });
    return hook.POST(new Request("https://trustpipe.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header }, body: payload }));
  };
  try {
    assert.equal((await hook.POST(new Request("https://x", { method: "POST", headers: { "stripe-signature": "t=1,v1=faux" }, body: "{}" }))).status, 400, "signature fausse refusée");
    const r1 = await send({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { object: "checkout.session", client_reference_id: o2.id, customer: `cus_${tag}`, subscription: `sub_${tag}`, metadata: { plan: "starter" }, amount_subtotal: 5997 } } });
    assert.equal(r1.status, 200);
    let o = await db.organization.findUniqueOrThrow({ where: { id: o2.id } });
    assert.deepEqual([o.plan, o.subscriptionStatus, o.stripeSubscriptionId], ["starter", "active", `sub_${tag}`], "formule activée après paiement");
    assert.equal(billing.maxClients(o), 2, "Découverte : 2 commerciaux (prix fixe, la quantité ne compte plus)");
    // Passage en Premium depuis le portail Stripe.
    await send({ id: "evt_2", object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", id: `sub_${tag}`, customer: `cus_${tag}`, status: "active", cancel_at_period_end: false, cancel_at: null, items: { data: [{ quantity: 3, price: { id: "price_p", lookup_key: "trustpipe_premium_mensuel_eur", metadata: {} } }] } } } });
    o = await db.organization.findUniqueOrThrow({ where: { id: o2.id } });
    assert.deepEqual([o.plan, o.subscriptionStatus], ["premium", "active"]);
    assert.equal(billing.maxClients(o), 10, "Premium : 10 commerciaux, quelle que soit la quantité");
  } finally {
    await db.organization.delete({ where: { id: o2.id } });
  }
});

test("créneaux : classement par taux de décroché, heure de Paris, volume minimum", async () => {
  const { slotInsights } = await import("../src/lib/stats");
  const at = (iso: string, n: number, ok: number) => Array.from({ length: n }, (_, i) => ({ kind: "call", startedAt: new Date(iso), connected: i < ok, meetingBooked: false }));
  // Jeudi 19/11/2026 : 15 h 10 UTC = 16 h à Paris (hiver). Mercredi 10 h UTC = 11 h à Paris. Samedi ignoré.
  const ins = slotInsights([...at("2026-11-19T15:10:00Z", 40, 10), ...at("2026-11-18T10:05:00Z", 30, 3), ...at("2026-11-18T12:00:00Z", 5, 5), ...at("2026-11-21T10:00:00Z", 50, 50)]);
  assert.deepEqual(ins.slots.map((x) => [x.label, x.calls, x.rate]), [["jeudi 16h", 40, 25], ["mercredi 11h", 30, 10]], "5 appels à 100 % ne comptent pas, le samedi non plus");
  assert.equal(ins.hours[0].label, "16h");
  assert.equal(ins.days[0].label, "jeudi");
  // Été : 14 h UTC = 16 h à Paris.
  assert.equal(slotInsights(at("2026-07-09T14:00:00Z", 20, 4)).slots[0].label, "jeudi 16h");
});

test("menu : cadenas selon la formule", async () => {
  const { lockedIcons } = await import("../src/lib/plan");
  const of = (plan: string) => lockedIcons({ ai: billing.hasAi({ plan }), premium: billing.hasPremium({ plan }) });
  assert.deepEqual(of("starter"), { relances: "Essentiel", coach: "Essentiel", brief: "Premium" });
  assert.deepEqual(of("agency"), { brief: "Premium" });
  assert.deepEqual(of("premium"), {});
  assert.deepEqual(of("trial"), {});
});

test("essai de 7 jours : carte enregistrée, accès ouvert, rien de débité", async () => {
  process.env.STRIPE_LINK_WEBHOOK_SECRET = "whsec_test_entreprises";
  delete process.env.STRIPE_SECRET_KEY;
  const Stripe = (await import("stripe")).default;
  const hook = await import("../src/app/api/stripe/webhook/route");
  const o3 = await db.organization.create({ data: { name: `Essai ${tag}`, trialEndsAt: new Date(Date.now() - 864e5) } });
  try {
    assert.equal(billing.TRIAL_DAYS, 7);
    const payload = JSON.stringify({ id: "evt_e", object: "event", type: "checkout.session.completed", data: { object: { object: "checkout.session", client_reference_id: o3.id, customer: `cus_e${tag}`, subscription: `sub_e${tag}`, metadata: { plan: "agency" }, amount_subtotal: 0, payment_status: "no_payment_required" } } });
    const header = new Stripe("sk_x").webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_LINK_WEBHOOK_SECRET! });
    assert.equal((await hook.POST(new Request("https://trustpipe.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header }, body: payload }))).status, 200);
    const o = await db.organization.findUniqueOrThrow({ where: { id: o3.id } });
    assert.deepEqual([o.plan, o.subscriptionStatus], ["agency", "trialing"]);
    const left = (o.trialEndsAt.getTime() - Date.now()) / 864e5;
    assert.ok(left > 6.9 && left <= 7, `fin d'essai dans 7 jours (${left.toFixed(2)})`);
    assert.equal(billing.isActive(o), true, "l'espace est utilisable pendant l'essai");
    assert.equal(billing.isActive({ ...o, trialEndsAt: new Date(Date.now() - 1000) }), false, "essai dépassé sans paiement : lecture seule");
  } finally { await db.organization.delete({ where: { id: o3.id } }); }
});

test("connecteur Claude : écran d'autorisation réservé au Premium actif", async () => {
  const { hasPremium, isActive } = billing;
  const can = (o: { plan: string; subscriptionStatus: string; trialEndsAt: Date }) => isActive(o) && hasPremium(o);
  const future = new Date(Date.now() + 864e5), past = new Date(Date.now() - 864e5);
  assert.equal(can({ plan: "premium", subscriptionStatus: "active", trialEndsAt: past }), true);
  assert.equal(can({ plan: "premium", subscriptionStatus: "trialing", trialEndsAt: future }), true, "essai Premium en cours");
  assert.equal(can({ plan: "agency", subscriptionStatus: "active", trialEndsAt: past }), false, "Essentiel : non");
  assert.equal(can({ plan: "starter", subscriptionStatus: "active", trialEndsAt: past }), false, "Découverte : non");
  assert.equal(can({ plan: "premium", subscriptionStatus: "canceled", trialEndsAt: past }), false, "abonnement arrêté : non");
});

test("assistant : les droits viennent du serveur et suivent la formule", async () => {
  const { accessRules } = await import("../src/lib/assistant");
  const ess = accessRules({ plan: "agency", status: "active", trialEnd: null, role: "propriétaire" }, "https://trustpipe.fr/app/billing#changer");
  assert.match(ess, /formule: Essentiel \(agency\)/);
  assert.match(ess, /statut_abonnement: actif/);
  assert.match(ess, /réservés à Premium/);
  assert.match(ess, /app\/billing#changer/, "le propriétaire reçoit le lien pour changer de formule");
  const rep = accessRules({ plan: "agency", status: "active", trialEnd: null, role: "commercial invité" }, "x");
  assert.match(rep, /oriente-le vers l'entreprise/, "le commercial est orienté vers l'entreprise, pas vers l'abonnement");
  const old = accessRules({ plan: "premium", status: "trialing", trialEnd: new Date(Date.now() - 864e5), role: "propriétaire" }, "x");
  assert.match(old, /statut_abonnement: expiré/, "essai dépassé = expiré");
});
