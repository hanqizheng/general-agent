import { EventBus } from "@/core/events/bus";
import { LOOP_END_REASON, SESSION_EVENT_TYPE } from "@/core/events/constants";
import { EventEmitter } from "@/core/events/emitter";
import { runAgentLoop } from "@/core/agent/loop";
import type { LoopEndReason } from "@/core/events/types";
import { db } from "@/db";
import { finalizeRun, markRunRunning } from "@/db/repositories/run-repository";
import {
  getExecutionMessageById,
  markRunMessagesInterrupted,
  messagePartRowToExecutionContentPart,
} from "@/db/repositories/message-repository";
import { markSessionRunState } from "@/db/repositories/session-repository";
import { MESSAGE_STATUS, SESSION_STATUS } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import {
  expireAttachmentsInStore,
  purgeAttachmentResourcesByIds,
  resolveLLMMessagesAttachments,
  resolveLLMMessageAttachments,
} from "@/core/attachments/binding-service";
import { liveSessionRegistry } from "./live-session-registry";
import { DbSessionProjector } from "./db-session-projector";
import {
  assembleSessionContext,
  buildVisibleContent,
} from "./context-assembler";
import { maybeGenerateSessionPresentation } from "./presentation-generator";
import {
  prependExpandedPromptCommands,
  readStoredPromptCommandInvocations,
} from "@/core/skills";
import type { LLMMessage } from "@/core/provider/base";
import type { SessionRunSetup } from "./run-setup";

interface StartSessionRunParams {
  sessionId: string;
  runId: string;
  requestMessageId: string;
  workspaceRoot: string;
  setup: SessionRunSetup;
  generateSessionPresentation?: boolean;
  targetArtifactContractId?: string | null;
}

function getTerminalStatus(
  sessionId: string,
  endReason: LoopEndReason,
) {
  if (liveSessionRegistry.wasAbortRequested(sessionId)) {
    return "aborted" as const;
  }

  if (endReason === LOOP_END_REASON.ERROR) {
    return "failed" as const;
  }

  if (endReason === LOOP_END_REASON.INTERRUPTED) {
    return "interrupted" as const;
  }

  return "completed" as const;
}

function extractAttachmentIds(
  parts: Array<{
    kind: string;
    payload: Record<string, unknown> | null;
  }>,
) {
  return Array.from(
    new Set(
      parts.flatMap((part) =>
        part.kind === "attachment" && typeof part.payload?.attachmentId === "string"
          ? [part.payload.attachmentId]
          : [],
      ),
    ),
  );
}

function buildCurrentUserMessage(
  requestMessage: Awaited<ReturnType<typeof getExecutionMessageById>>,
): LLMMessage | null {
  if (
    requestMessage.message.role !== "user" ||
    requestMessage.message.visibility !== "visible"
  ) {
    return null;
  }

  const content = prependExpandedPromptCommands(
    buildVisibleContent(
      requestMessage.parts.map(messagePartRowToExecutionContentPart),
    ),
    readStoredPromptCommandInvocations(requestMessage.message.metadata),
  );

  return {
    role: "user",
    content: content.filter(
      (block) => block.type === "text" || block.type === "attachment",
    ),
  };
}

export function startSessionRun(params: StartSessionRunParams): Promise<void> {
  const abortController = new AbortController();
  const bus = new EventBus();
  const emitter = new EventEmitter(bus, params.sessionId);
  const projector = new DbSessionProjector(params.sessionId, params.runId);

  let projectionQueue: Promise<void> = Promise.resolve();
  let loopStarted = false;
  let requestAttachmentIds: string[] = [];

  bus.on((event) => {
    liveSessionRegistry.broadcast(params.sessionId, event);
    projectionQueue = projectionQueue
      .then(() => projector.project(event))
      .catch(() => undefined);
  });

  const runPromise = (async () => {
    try {
      await db.transaction(async (tx) => {
        await markRunRunning(tx, params.runId);
        await markSessionRunState(
          tx,
          params.sessionId,
          params.runId,
          SESSION_STATUS.BUSY,
        );
      });

      const requestMessage = await getExecutionMessageById(params.requestMessageId);
      requestAttachmentIds = extractAttachmentIds(
        requestMessage.parts.map((part) => ({
          kind: part.kind,
          payload: part.payload as Record<string, unknown> | null,
        })),
      );
      const currentUserMessage = buildCurrentUserMessage(requestMessage);
      if (!currentUserMessage || currentUserMessage.role !== "user") {
        throw new AppError(
          "Run request message is missing",
          "REQUEST_MESSAGE_NOT_FOUND",
          500,
          false,
        );
      }

      const history = await assembleSessionContext(params.sessionId, {
        excludeMessageId: params.requestMessageId,
      });
      const resolvedHistory = await resolveLLMMessagesAttachments(history, {
        provider: params.setup.providerName,
        modelFamily: params.setup.model,
      });
      const resolvedCurrentUserMessage = await resolveLLMMessageAttachments(
        currentUserMessage,
        {
          provider: params.setup.providerName,
          modelFamily: params.setup.model,
        },
      );

      loopStarted = true;
      const result = await runAgentLoop({
        emitter,
        provider: params.setup.provider,
        systemPrompt: params.setup.systemPrompt,
        userContent: resolvedCurrentUserMessage.content,
        history: resolvedHistory,
        interruptSignal: abortController.signal,
        contractRegistry: params.setup.contractRegistry,
        targetArtifactContractId: params.targetArtifactContractId ?? null,
        toolContext: {
          workspaceRoot: params.workspaceRoot,
          signal: abortController.signal,
        },
        toolRegistry: params.setup.toolRegistry,
      });

      await projectionQueue;

      const status = getTerminalStatus(params.sessionId, result.endReason);
      await db.transaction(async (tx) => {
        await finalizeRun(
          tx,
          params.runId,
          status,
          status === "failed"
            ? {
                code: "RUN_FAILED",
                message: "Agent loop ended with an error",
              }
            : null,
        );
        if (status === "aborted" || status === "interrupted") {
          await markRunMessagesInterrupted(
            tx,
            params.runId,
            MESSAGE_STATUS.INTERRUPTED,
          );
        }
        await markSessionRunState(
          tx,
          params.sessionId,
          null,
          status === "failed" ? SESSION_STATUS.ERROR : SESSION_STATUS.IDLE,
        );
        await expireAttachmentsInStore(tx, requestAttachmentIds);
      });

      await purgeAttachmentResourcesByIds(requestAttachmentIds).catch(() => undefined);

      if (params.generateSessionPresentation && status === "completed") {
        void maybeGenerateSessionPresentation({
          provider: params.setup.provider,
          sessionId: params.sessionId,
        }).catch(() => undefined);
      }
    } catch (error: unknown) {
      if (!loopStarted) {
        emitter.emit({
          type: SESSION_EVENT_TYPE.ERROR,
          error: {
            code:
              error instanceof AppError ? error.code : "RUN_UNCAUGHT",
            message:
              error instanceof Error ? error.message : "Unknown run error",
            recoverable:
              error instanceof AppError ? error.recoverable : false,
          },
        });
        emitter.emit({
          type: SESSION_EVENT_TYPE.STATUS,
          status: liveSessionRegistry.wasAbortRequested(params.sessionId)
            ? SESSION_STATUS.IDLE
            : SESSION_STATUS.ERROR,
        });
      }

      await projectionQueue.catch(() => undefined);

      const status = liveSessionRegistry.wasAbortRequested(params.sessionId)
        ? "aborted"
        : "failed";

      await db.transaction(async (tx) => {
        await finalizeRun(tx, params.runId, status, {
          code: status === "aborted" ? "RUN_ABORTED" : "RUN_UNCAUGHT",
          message:
            error instanceof Error ? error.message : "Unknown run error",
        });
        await markRunMessagesInterrupted(
          tx,
          params.runId,
          status === "aborted"
            ? MESSAGE_STATUS.INTERRUPTED
            : MESSAGE_STATUS.ERROR,
        );
        await markSessionRunState(
          tx,
          params.sessionId,
          null,
          status === "failed" ? SESSION_STATUS.ERROR : SESSION_STATUS.IDLE,
        );
        await expireAttachmentsInStore(tx, requestAttachmentIds);
      });

      await purgeAttachmentResourcesByIds(requestAttachmentIds).catch(() => undefined);
    } finally {
      liveSessionRegistry.complete(params.sessionId);
      bus.dispose();
    }
  })();

  liveSessionRegistry.attachRun(
    params.sessionId,
    params.runId,
    abortController,
    runPromise,
  );

  return runPromise;
}
