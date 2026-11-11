import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runDigest } from "@/lib/digest";

export const maxDuration = 300;

/** Chaque matin de semaine : règles de relance automatiques + récap par email et Slack. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || !safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runDigest());
}
