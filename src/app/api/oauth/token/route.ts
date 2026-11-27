import { NextResponse } from "next/server";
import { cors, exchangeToken } from "@/lib/mcp-server";

/** Échange OAuth : code d'autorisation (PKCE) ou jeton de renouvellement → jeton d'accès. */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") || "";
  const f = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text());
  const r = await exchangeToken(f);
  const headers = { ...cors, "Cache-Control": "no-store", Pragma: "no-cache" };
  if (!r.ok) return NextResponse.json({ error: r.error, error_description: r.description }, { status: 400, headers });
  return NextResponse.json(r.body, { headers });
}
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
