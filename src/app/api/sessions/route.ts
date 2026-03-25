import { NextResponse } from "next/server";

import {
  createSession,
  listSessionSummaries,
} from "@/db/repositories/session-repository";
import { requireUserId } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  const sessions = await listSessionSummaries(userId);
  return NextResponse.json({ sessions });
}

export async function POST() {
  const userId = await requireUserId();
  const session = await createSession(process.cwd(), userId);
  return NextResponse.json({ session }, { status: 201 });
}
