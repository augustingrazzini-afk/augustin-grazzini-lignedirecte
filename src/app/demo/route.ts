import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Démo publique : ouvre l'espace fictif en lecture seule, sans compte (session de 2 heures). */
export async function GET(req: Request) {
  await ensureDemo();
  await createSession(DEMO_USER_ID, 2 * 60 * 60);
  return NextResponse.redirect(new URL("/app", req.url), 303);
}
