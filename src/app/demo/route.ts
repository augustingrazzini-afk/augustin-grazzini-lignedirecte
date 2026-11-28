import { NextResponse } from "next/server";
import { createSession, currentUser, parkSession } from "@/lib/session";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Démo publique : ouvre l'espace fictif en lecture seule, sans compte (session de 2 heures). */
export async function GET(req: Request) {
  await ensureDemo();
  // Déjà connecté à son vrai compte : on garde sa session de côté, il la retrouve en quittant la démo.
  const me = await currentUser();
  if (me && me.id !== DEMO_USER_ID) await parkSession();
  await createSession(DEMO_USER_ID, 2 * 60 * 60);
  return NextResponse.redirect(new URL("/app", req.url), 303);
}
