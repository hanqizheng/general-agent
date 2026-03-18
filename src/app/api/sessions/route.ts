import { NextResponse } from "next/server";

import {
  createSession,
  listSessionSummaries,
} from "@/db/repositories/session-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await listSessionSummaries();
  return NextResponse.json({ sessions });
}

export async function POST() {
  const session = await createSession(process.cwd());
  return NextResponse.json({ session }, { status: 201 });
}
