import { DEFAULT_MAX_TURNS } from "@/lib/constants";
import { isAbortError } from "@/lib/errors";
import { buildContext } from "./context";
import { AgentLoopResult, AgentLoopStartParams } from "./types";
import { LoopEndReason } from "../events/types";
import {
  LOOP_END_REASON,
  SESSION_EVENT_TYPE,
  SESSION_STATUS,
  TURN_END_REASON,
} from "../events/constants";
import { genTurnId } from "@/lib/id";
import { executeTurn } from "./turn";

export async function runAgentLoop(
  params: AgentLoopStartParams,
): Promise<AgentLoopResult> {
  const {
    emitter,
    history,
    userMessage,
    maxTurns = DEFAULT_MAX_TURNS,
    interruptSignal,
    provider,
    systemPrompt,
    toolContext,
    toolRegistry,
  } = params;

  emitter.emit({
    type: SESSION_EVENT_TYPE.STATUS,
    status: SESSION_STATUS.BUSY,
  });

  let messages = buildContext(history, userMessage);
  let turnCount = 0;

  let endReason: LoopEndReason = LOOP_END_REASON.COMPLETE;

  const tools = toolRegistry?.toLLMToolDefinitions();

  emitter.emit({ type: "loop.start" });

  while (turnCount < maxTurns) {
    const turnId = genTurnId();

    if (interruptSignal?.aborted) {
      endReason = LOOP_END_REASON.INTERRUPTED;
      break;
    }

    turnCount += 1;

    emitter.emit({ type: "turn.start", turnId });

    try {
      const result = await executeTurn({
        provider,
        emitter,
        streamParams: {
          messages,
          systemPrompt,
          tools,
          signal: interruptSignal,
        },
        toolContext,
        toolRegistry,
      });

      messages = [...messages, result.assistantMessage];

      if (result.toolResultMessage) {
        messages = [...messages, result.toolResultMessage];
      }

      emitter.emit({
        type: "turn.end",
        turnId,
        reason: TURN_END_REASON.COMPLETE,
      });

      if (!result.hasToolCalls) {
        endReason = LOOP_END_REASON.COMPLETE;
        break;
      }
    } catch (error: unknown) {
      if (interruptSignal?.aborted || isAbortError(error)) {
        emitter.emit({
          type: "turn.end",
          turnId,
          reason: TURN_END_REASON.INTERRUPTED,
        });
        endReason = LOOP_END_REASON.INTERRUPTED;
        break;
      }

      emitter.emit({ type: "turn.end", turnId, reason: TURN_END_REASON.ERROR });

      emitter.emit({
        type: SESSION_EVENT_TYPE.ERROR,
        error: {
          code: "TURN_EXECUTION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unknown turn execution error",
          recoverable: false,
        },
      });

      endReason = LOOP_END_REASON.ERROR;
      break;
    }
  }

  if (turnCount >= maxTurns && endReason === LOOP_END_REASON.COMPLETE) {
    endReason = LOOP_END_REASON.MAX_TURNS;
  }

  emitter.emit({ type: "loop.end", reason: endReason });
  emitter.emit({
    type: SESSION_EVENT_TYPE.STATUS,
    status:
      endReason === LOOP_END_REASON.ERROR
        ? SESSION_STATUS.ERROR
        : SESSION_STATUS.IDLE,
  });

  return {
    endReason,
    messages,
    turnCount,
  };
}
