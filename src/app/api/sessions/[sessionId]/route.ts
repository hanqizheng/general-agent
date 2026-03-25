import { NextRequest, NextResponse } from "next/server";

import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import {
  getOwnedSessionDetail,
  softDeleteSession,
} from "@/db/repositories/session-repository";
import { requireUserId } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const userId = await requireUserId();

  let session = await getOwnedSessionDetail(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await repairSessionIfStale(sessionId);
  session = await getOwnedSessionDetail(sessionId, userId);
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
  const userId = await requireUserId();

  let session = await getOwnedSessionDetail(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await repairSessionIfStale(sessionId);
  session = await getOwnedSessionDetail(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.activeRunId || session.status === "busy") {
    return NextResponse.json(
      { error: "SESSION_BUSY", message: "Cannot delete a busy session" },
      { status: 409 },
    );
  }

  const deleted = await softDeleteSession(sessionId, userId);
  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: deleted });
}
