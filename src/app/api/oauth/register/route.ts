import { NextResponse } from "next/server";
import { cors, registerClient } from "@/lib/mcp-server";
import { bumpUsage } from "@/lib/usage";

/** Enregistrement dynamique d'une application (RFC 7591) : Claude s'enregistre seul lors de l'ajout du connecteur. */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  if ((await bumpUsage(`oauth-reg:${ip}`)) > 50) return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: cors });
  const out = await registerClient(await req.json().catch(() => null));
  if (!out) return NextResponse.json({ error: "invalid_redirect_uri", error_description: "Adresses de retour manquantes ou invalides." }, { status: 400, headers: cors });
  return NextResponse.json(out, { status: 201, headers: cors });
}
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
