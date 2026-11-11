import type { Task } from "@prisma/client";
import { db } from "./db";
import { sendEmail } from "./email";
import { generateRuleTasks } from "./tasks";
import { CHANNEL_LABEL } from "./providers";

const APP = () => process.env.APP_URL || "http://localhost:3000";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const endOfToday = () => { const d = new Date(); d.setUTCHours(22, 59, 59, 999); return d; };
const startOfToday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

export function isSlackWebhook(url: string) {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url);
}

function lines(tasks: Task[]) {
  return tasks.slice(0, 25).map((t) => `${CHANNEL_LABEL[t.channel]} · ${t.contactName || t.company || "Prospect"}${t.company && t.contactName ? ` (${t.company})` : ""} : ${t.reason}`);
}

async function postSlack(url: string, title: string, overdue: Task[], today: Task[], link: string) {
  if (!isSlackWebhook(url)) return;
  const text = [`*${title}*`, overdue.length ? `:red_circle: *${overdue.length} en retard*\n${lines(overdue).map((l) => "• " + l).join("\n")}` : "", today.length ? `:large_orange_circle: *${today.length} aujourd'hui*\n${lines(today).map((l) => "• " + l).join("\n")}` : "", `<${link}|Ouvrir les relances>`].filter(Boolean).join("\n\n");
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10_000) }).catch(() => {});
}

function emailHtml(title: string, overdue: Task[], today: Task[], link: string) {
  const block = (label: string, color: string, list: Task[]) => list.length ? `<p style="margin:20px 0 8px;font-weight:700;color:${color}">${label} · ${list.length}</p><ul style="margin:0;padding-left:18px;color:#0B122F">${lines(list).map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join("")}</ul>` : "";
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0B122F"><p style="font-size:18px;font-weight:700;margin:0">${esc(title)}</p>${block("En retard", "#DD3F55", overdue)}${block("Aujourd'hui", "#C27F05", today)}<p style="margin-top:24px"><a href="${esc(link)}" style="display:inline-block;background:#2E5BFF;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Ouvrir mes relances</a></p><p style="color:#59628A;font-size:12px">Vous recevez ce récap chaque matin. Vous pouvez le désactiver dans les réglages.</p></div>`;
}

/** Tâche du matin : règles automatiques, puis récap des relances par email et Slack. */
export async function runDigest() {
  const orgs = await db.organization.findMany({
    where: { OR: [{ subscriptionStatus: { in: ["active", "past_due"] } }, { subscriptionStatus: "trialing", trialEndsAt: { gt: new Date() } }] },
    include: { members: { where: { digest: true }, include: { user: true } }, clients: { include: { members: { where: { digest: true }, include: { user: true } } } } },
  });
  let emails = 0, slacks = 0;
  for (const org of orgs) {
    await generateRuleTasks(org.id).catch(() => 0);
    const due = await db.task.findMany({ where: { orgId: org.id, status: "open", dueAt: { lte: endOfToday() } }, orderBy: { dueAt: "asc" } });
    const split = (l: Task[]) => [l.filter((t) => t.dueAt < startOfToday()), l.filter((t) => t.dueAt >= startOfToday())] as const;
    if (due.length) {
      const [overdue, today] = split(due);
      const title = `${org.name} : ${due.length} relance(s) à faire`;
      for (const m of org.members) { await sendEmail(m.user.email, title, emailHtml(title, overdue, today, `${APP()}/app/relances`), lines(due).join("\n")).catch(() => {}); emails++; }
      if (org.slackWebhook) { await postSlack(org.slackWebhook, title, overdue, today, `${APP()}/app/relances`); slacks++; }
    }
    for (const c of org.clients) {
      const mine = due.filter((t) => t.clientId === c.id);
      if (!mine.length) continue;
      const [overdue, today] = split(mine);
      const title = `${c.name} : ${mine.length} relance(s) à faire`;
      const link = `${APP()}/portal/${c.id}/relances`;
      for (const m of c.members) { await sendEmail(m.user.email, title, emailHtml(title, overdue, today, link), lines(mine).join("\n")).catch(() => {}); emails++; }
      if (c.slackWebhook) { await postSlack(c.slackWebhook, title, overdue, today, link); slacks++; }
    }
  }
  return { orgs: orgs.length, emails, slacks };
}
