import { NextResponse } from "next/server";
import { restoreSession } from "@/lib/session";

/** Quitter la démo : retour à son propre espace si on était connecté, sinon création de compte. */
export async function GET(req: Request) {
  const back = await restoreSession();
  return NextResponse.redirect(new URL(back ? "/app" : "/inscription", req.url), 303);
}
