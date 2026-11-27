import { NextResponse } from "next/server";
import { baseUrl, cors, resourceMetadata } from "@/lib/mcp-server";

/** Métadonnées de la ressource protégée (RFC 9728) : où Claude doit demander l'autorisation. */
export function GET(req: Request) {
  return NextResponse.json(resourceMetadata(baseUrl(req)), { headers: cors });
}
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
