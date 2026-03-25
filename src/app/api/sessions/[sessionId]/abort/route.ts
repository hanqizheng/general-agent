import { NextRequest, NextResponse } from "next/server";

import { liveSessionRegistry } from "@/core/session/live-session-registry";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { getOwnedSessionDetail } from "@/db/repositories/session-repository";
import { requireUserId } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  const aborted = liveSessionRegistry.abort(sessionId);
  return NextResponse.json({
    sessionId,
    aborted,
    activeRunId: session.activeRunId,
  });
}
