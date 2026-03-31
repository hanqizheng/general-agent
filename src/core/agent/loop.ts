import { DEFAULT_MAX_TURNS } from "@/lib/constants";
import { isAbortError } from "@/lib/errors";
import { MESSAGE_PART_END_STATE, MESSAGE_PART_KIND, MESSAGE_ROLE } from "@/lib/constants";
import { genMessageId, genTurnId } from "@/lib/id";

import {
  artifactPayloadToContentBlock,
  buildArtifactPayload,
  hasArtifactForContract,
} from "./artifacts";
import { buildContext } from "./context";
import type { AgentLoopResult, AgentLoopStartParams } from "./types";
import type { LoopEndReason } from "../events/types";
import {
  LOOP_END_REASON,
  SESSION_EVENT_TYPE,
  SESSION_STATUS,
  TURN_END_REASON,
} from "../events/constants";
import { executeTurn } from "./turn";

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
  } = params;

  emitter.emit({
    type: SESSION_EVENT_TYPE.STATUS,
    status: SESSION_STATUS.BUSY,
  });

  let messages = buildContext(history, userContent);
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
        contractRegistry,
      });

      messages = [...messages, result.assistantMessage];

      if (result.toolResultMessage) {
        messages = [...messages, result.toolResultMessage];
      }

      if (
        !result.hasToolCalls &&
        targetArtifactContractId &&
        !hasArtifactForContract(messages, targetArtifactContractId)
      ) {
        if (!contractRegistry) {
          throw new Error("Artifact contract registry is not configured.");
        }

        const contract = contractRegistry.get(targetArtifactContractId);
        const structuredResult = await provider.generateStructured({
          messages,
          systemPrompt,
          contract,
          signal: interruptSignal,
        });
        const artifact = buildArtifactPayload(contract, structuredResult, {
          kind: "assistant",
          name: "finalize_structured_output",
        });
        const artifactMessageId = genMessageId();

        emitter.emit({
          type: "message.start",
          messageId: artifactMessageId,
          role: MESSAGE_ROLE.ASSISTANT,
        });
        emitter.emit({
          type: "message.part.start",
          messageId: artifactMessageId,
          partIndex: 0,
          kind: MESSAGE_PART_KIND.ARTIFACT,
        });
        emitter.emit({
          type: "message.artifact",
          messageId: artifactMessageId,
          partIndex: 0,
          artifact,
        });
        emitter.emit({
          type: "message.part.end",
          messageId: artifactMessageId,
          partIndex: 0,
          kind: MESSAGE_PART_KIND.ARTIFACT,
          state: MESSAGE_PART_END_STATE.COMPLETE,
        });
        emitter.emit({
          type: "message.end",
          messageId: artifactMessageId,
        });

        messages = [
          ...messages,
          {
            role: MESSAGE_ROLE.ASSISTANT,
            content: [artifactPayloadToContentBlock(artifact)],
          },
        ];
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
