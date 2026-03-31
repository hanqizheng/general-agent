import { NextRequest, NextResponse } from "next/server";

import { deleteDraftAttachment } from "@/core/attachments/attachment-service";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { getOwnedSessionDetail } from "@/db/repositories/session-repository";
import { requireUserId } from "@/lib/auth-utils";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ sessionId: string; attachmentId: string }> },
) {
  const { sessionId, attachmentId } = await params;
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
      {
        error: "SESSION_BUSY",
        message: "Cannot delete a draft attachment while a run is active",
      },
      { status: 409 },
    );
  }

  try {
    await deleteDraftAttachment(sessionId, attachmentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }

    throw error;
  }
}
