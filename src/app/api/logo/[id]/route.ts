/**
 * Logo officiel d'un outil connecté (icône du site de l'éditeur), servi depuis notre domaine et mis en cache
 * par le CDN. Seul le nom de domaine de l'éditeur est demandé : aucune donnée d'utilisateur ne sort.
 */
export const runtime = "nodejs";

const DOMAINS: Record<string, string> = {
  minari: "minari.ai", skipcall: "skipcall.com", lemlist: "lemlist.com", aircall: "aircall.io", ringover: "ringover.com",
  justcall: "justcall.io", allo: "withallo.com", dialpad: "dialpad.com", close: "close.com", salesloft: "salesloft.com",
  apollo: "apollo.io", gong: "gong.io", hubspot: "hubspot.com", instantly: "instantly.ai", smartlead: "smartlead.ai",
  zapier: "zapier.com", make: "make.com", n8n: "n8n.io", claude: "claude.ai",
};
const UA = "Mozilla/5.0 (compatible; TrustpipeLogoBot/1.0; +https://trustpipe.fr)";
const IMG = /^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|webp|gif)/;

async function get(url: string) {
  return fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,image/*,*/*" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
}

/** Icônes déclarées par la page d'accueil, de la plus grande à la plus petite (apple-touch-icon en premier). */
async function declaredIcons(domain: string): Promise<string[]> {
  const res = await get(`https://${domain}/`).catch(() => null);
  if (!res?.ok) return [];
  const html = (await res.text()).slice(0, 300_000);
  const out: { href: string; score: number }[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1].toLowerCase() || "";
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/(icon|apple-touch-icon)/.test(rel) || /mask-icon/.test(rel)) continue;
    const size = Number(/sizes=["'](\d+)x\d+/i.exec(tag)?.[1] || 0);
    const score = (rel.includes("apple-touch-icon") ? 1000 : 0) + size + (href.endsWith(".svg") ? 500 : 0);
    try { out.push({ href: new URL(href, res.url).toString(), score }); } catch { /* adresse invalide */ }
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.href);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const domain = DOMAINS[id];
  if (!domain) return new Response("Inconnu", { status: 404 });
  const candidates = [...(await declaredIcons(domain)), `https://${domain}/apple-touch-icon.png`, `https://${domain}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`];
  for (const url of candidates.slice(0, 8)) {
    const r = await get(url).catch(() => null);
    const type = r?.headers.get("content-type") || "";
    if (!r?.ok || !IMG.test(type)) continue;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 100 || buf.byteLength > 500_000) continue;
    return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800" } });
  }
  return new Response("Introuvable", { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
}
