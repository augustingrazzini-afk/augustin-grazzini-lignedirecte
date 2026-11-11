import { NextResponse } from "next/server";
import { consumeToken } from "@/lib/auth";
import { createSession } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL || url.origin;
  const token = url.searchParams.get("token") || "";
  const res = token ? await consumeToken(token) : null;
  if (!res) return NextResponse.redirect(new URL("/login?error=expired", base));
  await createSession(res.user.id);
  return NextResponse.redirect(new URL(res.redirect || "/app", base));
}
