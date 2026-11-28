import { NextResponse } from "next/server";
import { createSession, currentUser, parkSession } from "@/lib/session";
import { DEMO_REP_ID as REP, DEMO_USER_ID, ensureDemo, ensureDemoRep } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Démo publique vue par un commercial invité (ici un freelance) : on arrive sur son guide de démarrage,
 * comme après avoir cliqué sur l'email d'invitation. Lecture seule, données fictives, session de 2 heures.
 */
export async function GET(req: Request) {
  await ensureDemo();
  await ensureDemoRep();
  const me = await currentUser();
  if (me && me.id !== DEMO_USER_ID) await parkSession();
  await createSession(DEMO_USER_ID, 2 * 60 * 60);
  return NextResponse.redirect(new URL(`/portal/${REP}/bienvenue`, req.url), 303);
}
