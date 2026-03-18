import { NextRequest, NextResponse } from "next/server";

import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import {
  getSessionDetail,
  softDeleteSession,
} from "@/db/repositories/session-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  await repairSessionIfStale(sessionId);

  const session = await getSessionDetail(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  await repairSessionIfStale(sessionId);

  const session = await getSessionDetail(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.activeRunId || session.status === "busy") {
    return NextResponse.json(
      { error: "SESSION_BUSY", message: "Cannot delete a busy session" },
      { status: 409 },
    );
  }

  const deleted = await softDeleteSession(sessionId);
  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: deleted });
}
