import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createAttachmentFromUpload,
  createAttachmentFromUrl,
} from "@/core/attachments/attachment-service";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { getOwnedSessionDetail } from "@/db/repositories/session-repository";
import { requireUserId } from "@/lib/auth-utils";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createAttachmentFromUrlSchema = z.object({
  url: z.string().trim().url(),
  originalName: z.string().trim().max(255).optional(),
});

function toAttachmentDto(attachment: {
  id: string;
  kind: string;
  mimeType: string;
  originalName: string | null;
  sizeBytes: number | null;
  status: string;
  sourceKind: string;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    status: attachment.status,
    sourceKind: attachment.sourceKind,
    createdAt: attachment.createdAt.toISOString(),
  };
}

export async function POST(
  request: NextRequest,
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

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing file upload" },
          { status: 400 },
        );
      }

      const attachment = await createAttachmentFromUpload(sessionId, file);
      return NextResponse.json(
        { attachment: toAttachmentDto(attachment) },
        { status: 201 },
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = createAttachmentFromUrlSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const attachment = await createAttachmentFromUrl(
      sessionId,
      parsed.data.url,
      parsed.data.originalName,
    );

    return NextResponse.json(
      { attachment: toAttachmentDto(attachment) },
      { status: 201 },
    );
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
