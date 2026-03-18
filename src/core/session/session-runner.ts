import { EventBus } from "@/core/events/bus";
import { EventEmitter } from "@/core/events/emitter";
import { runAgentLoop } from "@/core/agent/loop";
import { db } from "@/db";
import { finalizeRun, markRunRunning } from "@/db/repositories/run-repository";
import { markSessionRunState } from "@/db/repositories/session-repository";
import { liveSessionRegistry } from "./live-session-registry";
import { DbSessionProjector } from "./db-session-projector";
import { assembleSessionContext } from "./context-assembler";
import type { SessionRunSetup } from "./run-setup";

interface StartSessionRunParams {
  sessionId: string;
  runId: string;
  userMessage: string;
  workspaceRoot: string;
  setup: SessionRunSetup;
}

function getTerminalStatus(
  sessionId: string,
  endReason: "complete" | "interrupted" | "error" | "max_turns",
) {
  if (liveSessionRegistry.wasAbortRequested(sessionId)) {
    return "aborted" as const;
  }

  if (endReason === "error") {
    return "failed" as const;
  }

  if (endReason === "interrupted") {
    return "interrupted" as const;
  }

  return "completed" as const;
}

export function startSessionRun(params: StartSessionRunParams): Promise<void> {
  const abortController = new AbortController();
  const bus = new EventBus();
  const emitter = new EventEmitter(bus, params.sessionId);
  const projector = new DbSessionProjector(params.sessionId, params.runId);

  let projectionQueue: Promise<void> = Promise.resolve();

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
        await markSessionRunState(tx, params.sessionId, params.runId, "busy");
      });

      const history = await assembleSessionContext(params.sessionId);
      const result = await runAgentLoop({
        emitter,
        provider: params.setup.provider,
        systemPrompt: params.setup.systemPrompt,
        userMessage: params.userMessage,
        history,
        interruptSignal: abortController.signal,
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
        await markSessionRunState(
          tx,
          params.sessionId,
          null,
          status === "failed" ? "error" : "idle",
        );
      });
    } catch (error: unknown) {
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
        await markSessionRunState(
          tx,
          params.sessionId,
          null,
          status === "failed" ? "error" : "idle",
        );
      });
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
