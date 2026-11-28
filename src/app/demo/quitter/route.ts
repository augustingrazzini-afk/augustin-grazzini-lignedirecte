import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

/** Quitter la démo pour créer son propre compte. */
export async function GET(req: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/inscription", req.url), 303);
}
