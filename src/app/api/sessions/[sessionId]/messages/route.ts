import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { db } from "@/db";
import {
  bindMessageToRun,
  hydrateMessageById,
  hydrateVisibleMessagesPage,
  insertVisibleUserMessage,
} from "@/db/repositories/message-repository";
import { createQueuedRun } from "@/db/repositories/run-repository";
import {
  getSessionDetail,
  lockSession,
  markSessionRunState,
} from "@/db/repositories/session-repository";
import { prepareSessionRunSetup } from "@/core/session/run-setup";
import { startSessionRun } from "@/core/session/session-runner";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(100_000),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  await repairSessionIfStale(sessionId);

  const session = await getSessionDetail(sessionId);
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
  await repairSessionIfStale(sessionId);

  const json = await request.json().catch(() => null);
  const parsed = sendMessageBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = await getSessionDetail(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const setup = await prepareSessionRunSetup(session.workspaceRoot);

  let createdRunId: string | null = null;
  let createdUserMessageId: string | null = null;
  let responseSession = session;

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
      responseSession = {
        ...responseSession,
        activeRunId: sessionRow.activeRunId,
        status: sessionRow.status,
      };
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
    userMessage: parsed.data.text,
    workspaceRoot: session.workspaceRoot,
    setup,
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
