import { DEFAULT_MAX_TURNS, DOOM_LOOP_THRESHOLD } from "@/lib/constants";
import { isAbortError } from "@/lib/errors";
import { MESSAGE_ROLE } from "@/lib/constants";
import { genTurnId } from "@/lib/id";

import { hasArtifactForContract } from "./artifacts";
import { buildContext } from "./context";
import { createDoomLoopTracker } from "./doom-loop";
import { trimMessagesToFitBudget } from "./token-budget";
import type { ContextWindowConfig } from "./token-budget";
import type { AgentLoopResult, AgentLoopStartParams } from "./types";
import type { LoopEndReason } from "../events/types";
import {
  LOOP_END_REASON,
  SESSION_EVENT_TYPE,
  SESSION_STATUS,
  TURN_END_REASON,
} from "../events/constants";
import { executeTurn } from "./turn";

/** 输出截断后最多续接几次 */
const MAX_TRUNCATION_RECOVERIES = 3;

export async function runAgentLoop(
  params: AgentLoopStartParams,
): Promise<AgentLoopResult> {
  const {
    emitter,
    history,
    userContent,
    maxTurns = DEFAULT_MAX_TURNS,
    interruptSignal,
    provider,
    systemPrompt,
    toolContext,
    toolRegistry,
    contractRegistry,
    targetArtifactContractId,
    contextWindowConfig,
  } = params;

  emitter.emit({
    type: SESSION_EVENT_TYPE.STATUS,
    status: SESSION_STATUS.BUSY,
  });

  const messages = buildContext(history, userContent);
  let turnCount = 0;

  let endReason: LoopEndReason = LOOP_END_REASON.COMPLETE;

  const tools = toolRegistry?.toLLMToolDefinitions();
  const doomLoopTracker = createDoomLoopTracker(DOOM_LOOP_THRESHOLD);
  let truncationRecoveries = 0;

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
      // 每次 turn 前检查消息是否超出上下文窗口预算，必要时裁剪
      const trimmedMessages = trimMessagesToFitBudget(
        messages,
        systemPrompt,
        contextWindowConfig,
      );

      const result = await executeTurn({
        provider,
        emitter,
        streamParams: {
          messages: trimmedMessages,
          systemPrompt,
          tools,
          signal: interruptSignal,
        },
        toolContext,
        toolRegistry,
        contractRegistry,
      });

      messages.push(result.assistantMessage);

      if (result.toolResultMessage) {
        messages.push(result.toolResultMessage);
      }

      // Doom loop 检测：连续 N 次相同工具+相同参数+全部报错 → 提前终止
      if (doomLoopTracker.track(result)) {
        emitter.emit({
          type: SESSION_EVENT_TYPE.ERROR,
          error: {
            code: "DOOM_LOOP",
            message: `Doom loop detected: the same tool call has failed ${DOOM_LOOP_THRESHOLD} times consecutively with identical parameters. Stopping to avoid wasting turns.`,
            recoverable: false,
          },
        });

        emitter.emit({
          type: "turn.end",
          turnId,
          reason: TURN_END_REASON.ERROR,
        });

        endReason = LOOP_END_REASON.DOOM_LOOP;
        break;
      }

      // 输出截断恢复：LLM 输出达到 max_tokens 被截断时，注入续接提示让它接着说
      // 截断的回复已经作为 assistantMessage 加入 messages，LLM 下一轮能看到并续接
      if (result.truncated && !result.hasToolCalls) {
        if (truncationRecoveries < MAX_TRUNCATION_RECOVERIES) {
          truncationRecoveries += 1;

          messages.push({
            role: MESSAGE_ROLE.USER,
            content: [
              {
                type: "text" as const,
                text: "Your response was truncated due to output length limits. Please continue exactly where you left off.",
              },
            ],
          });

          emitter.emit({
            type: "turn.end",
            turnId,
            reason: TURN_END_REASON.COMPLETE,
          });

          continue;
        }
        // 超过最大续接次数 → 不再续接，正常结束（保留已有的部分输出）
      }

      // 如果不是截断恢复的 turn，重置计数器
      if (!result.truncated) {
        truncationRecoveries = 0;
      }

      if (
        !result.hasToolCalls &&
        targetArtifactContractId &&
        !hasArtifactForContract(messages, targetArtifactContractId)
      ) {
        // LLM 结束回复但没有产出要求的 artifact。
        // 注入一条提醒消息让 LLM 继续循环，而不是另起一次独立的 LLM 调用。
        messages.push({
          role: MESSAGE_ROLE.USER,
          content: [
            {
              type: "text" as const,
              text: `You must call the structured_output tool with contract_id "${targetArtifactContractId}" to produce the required structured artifact before finishing. Call it now with the data you have gathered.`,
            },
          ],
        });

        emitter.emit({
          type: "turn.end",
          turnId,
          reason: TURN_END_REASON.COMPLETE,
        });

        continue;
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
