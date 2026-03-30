import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { db } from "@/db";
import { providerSupportsAttachmentInput } from "@/core/provider/attachment-capabilities";
import {
  bindMessageToRun,
  hydrateMessageById,
  hydrateVisibleMessagesPage,
  insertVisibleUserMessage,
} from "@/db/repositories/message-repository";
import {
  listSessionActiveAttachments,
  listSessionAttachmentsByIds,
} from "@/db/repositories/attachment-repository";
import { createQueuedRun } from "@/db/repositories/run-repository";
import {
  getOwnedSessionDetail,
  lockSession,
  markSessionRunState,
} from "@/db/repositories/session-repository";
import { prepareSessionRunSetup } from "@/core/session/run-setup";
import { startSessionRun } from "@/core/session/session-runner";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { requireUserId } from "@/lib/auth-utils";
import type { AttachmentPartPayload } from "@/lib/attachment-types";
import type { SessionDetailDto } from "@/lib/session-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(100_000),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string().trim().min(1),
      }),
    )
    .max(10)
    .optional(),
  format: z
    .object({
      type: z.literal("artifact_contract"),
      contractId: z.string().trim().min(1),
    })
    .optional(),
});

export async function GET(
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

  const rawBeforeSequence = request.nextUrl.searchParams.get("beforeSequence");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const beforeSequence =
    rawBeforeSequence === null ? null : Number.parseInt(rawBeforeSequence, 10);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(rawLimit ?? "50", 10) || 50),
  );

  if (beforeSequence !== null && Number.isNaN(beforeSequence)) {
    return NextResponse.json(
      { error: "beforeSequence must be a number" },
      { status: 400 },
    );
  }

  const page = await hydrateVisibleMessagesPage(
    sessionId,
    beforeSequence,
    limit,
  );
  return NextResponse.json(page);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const userId = await requireUserId();

  const json = await request.json().catch(() => null);
  const parsed = sendMessageBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let session = await getOwnedSessionDetail(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await repairSessionIfStale(sessionId);
  session = await getOwnedSessionDetail(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const setup = await prepareSessionRunSetup(session.workspaceRoot);
  const targetArtifactContractId = parsed.data.format?.contractId ?? null;
  const requestedAttachmentIds = Array.from(
    new Set(
      (parsed.data.attachments ?? []).map((attachment) => attachment.attachmentId),
    ),
  );

  if (
    targetArtifactContractId &&
    !setup.contractRegistry.has(targetArtifactContractId)
  ) {
    return NextResponse.json(
      { error: `Unknown artifact contract: ${targetArtifactContractId}` },
      { status: 400 },
    );
  }

  const requestedAttachments =
    requestedAttachmentIds.length > 0
      ? await listSessionAttachmentsByIds(sessionId, requestedAttachmentIds)
      : [];

  if (requestedAttachments.length !== requestedAttachmentIds.length) {
    return NextResponse.json(
      {
        error: "ATTACHMENT_NOT_FOUND",
        message: "One or more attachments were not found for this session",
      },
      { status: 404 },
    );
  }

  const sessionAttachments =
    setup.providerName === "anthropic"
      ? requestedAttachments
      : await listSessionActiveAttachments(sessionId);

  const unsupportedAttachment = sessionAttachments.find(
    (attachment) =>
      !providerSupportsAttachmentInput(setup.providerName, {
        kind: attachment.kind,
        mimeType: attachment.mimeType,
      }),
  );

  if (unsupportedAttachment) {
    return NextResponse.json(
      {
        error: "ATTACHMENT_NOT_SUPPORTED",
        message: `Provider "${setup.providerName}" does not support ${unsupportedAttachment.mimeType} attachments`,
      },
      { status: 409 },
    );
  }

  const attachmentPayloads: AttachmentPartPayload[] = requestedAttachments.map(
    (attachment) => ({
      attachmentId: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
    }),
  );

  let createdRunId: string | null = null;
  let createdUserMessageId: string | null = null;
  let shouldGenerateSessionPresentation = false;
  let responseSession = session;
  const workspaceRoot = session.workspaceRoot;

  try {
    await db.transaction(async (tx) => {
      const lockedSession = await lockSession(tx, sessionId);
      if (!lockedSession) {
        throw new Error("SESSION_NOT_FOUND");
      }

      if (lockedSession.activeRunId || lockedSession.status === "busy") {
        throw new Error("SESSION_BUSY");
      }

      const userMessage = await insertVisibleUserMessage(tx, {
        sessionId,
        runId: null,
        turnIndex: null,
        text: parsed.data.text,
        attachments: attachmentPayloads,
      });

      const run = await createQueuedRun(tx, {
        sessionId,
        requestMessageId: userMessage.id,
        provider: setup.providerName,
        model: setup.model,
        systemPromptHash: setup.systemPromptHash,
      });

      await bindMessageToRun(tx, userMessage.id, run.id);
      const sessionRow = await markSessionRunState(
        tx,
        sessionId,
        run.id,
        "busy",
      );

      createdRunId = run.id;
      createdUserMessageId = userMessage.id;
      shouldGenerateSessionPresentation = userMessage.sequence === 1;
      responseSession = {
        ...responseSession,
        activeRunId: sessionRow.activeRunId,
        status: sessionRow.status,
      } as SessionDetailDto;
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "SESSION_BUSY") {
      return NextResponse.json(
        {
          error: "SESSION_BUSY",
          message: "Only one run can be active per session",
        },
        { status: 409 },
      );
    }

    throw error;
  }

  if (createdRunId === null || createdUserMessageId === null) {
    return NextResponse.json(
      { error: "Failed to start session run" },
      { status: 500 },
    );
  }

  const userMessage = await hydrateMessageById(createdUserMessageId);

  void startSessionRun({
    sessionId,
    runId: createdRunId,
    requestMessageId: createdUserMessageId,
    workspaceRoot,
    setup,
    generateSessionPresentation: shouldGenerateSessionPresentation,
    targetArtifactContractId,
  }).catch(() => undefined);

  return NextResponse.json(
    {
      session: responseSession,
      run: {
        id: createdRunId,
        status: "queued",
      },
      userMessage,
    },
    { status: 202 },
  );
}
