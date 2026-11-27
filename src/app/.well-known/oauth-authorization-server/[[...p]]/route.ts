import { NextResponse } from "next/server";
import { authServerMetadata, baseUrl, cors } from "@/lib/mcp-server";

/** Métadonnées du serveur d'autorisation (RFC 8414). */
export function GET(req: Request) {
  return NextResponse.json(authServerMetadata(baseUrl(req)), { headers: cors });
}
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
