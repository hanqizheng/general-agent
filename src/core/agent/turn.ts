/**
 * executeTurn —— 执行一个完整的 agent turn。
 *
 * 一个 turn = 一次 LLM 流式响应 + 响应中声明的工具调用执行。
 *
 * 职责编排（不直接处理细节）：
 * 1. 消费 LLM 流 → 收集 contentBlocks + pendingToolCalls
 * 2. 如果有 pendingToolCalls → 交给 tool-executor 按批次执行
 * 3. 汇总为 TurnResult 返回给 loop 层
 *
 * 流消费中的 part 状态机（text/reasoning 的 start→delta→done→end）
 * 直接在本文件处理，因为它与流式 chunk 紧密耦合。
 *
 * 工具执行的分区、并行/串行逻辑在 tool-executor.ts 中。
 */

import { MESSAGE_PART_KIND, MESSAGE_ROLE, MAX_RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from "@/lib/constants";
import { InterruptedError, isAbortError } from "@/lib/errors";
import { genMessageId } from "@/lib/id";

import { MESSAGE_PART_END_STATE } from "../events/constants";
import { executeToolBatches, emitToolInterrupted } from "./tool-executor";
import type {
  MessagePartEndState,
  MessagePartKind,
} from "../events/types";
import type { LLMContentBlock } from "../provider/base";
import type { PendingToolCall, TurnParams, TurnResult } from "./types";
import { streamWithRetry } from "./with-retry";

type StreamPartKind =
  | typeof MESSAGE_PART_KIND.TEXT
  | typeof MESSAGE_PART_KIND.REASONING;

export async function executeTurn(params: TurnParams): Promise<TurnResult> {
  const {
    emitter,
    provider,
    streamParams,
    toolRegistry,
    toolContext,
    contractRegistry,
  } = params;
  const msgId = genMessageId();
  const interruptSignal = streamParams.signal;

  emitter.emit({ type: "message.start", messageId: msgId, role: "assistant" });

  const contentBlocks: LLMContentBlock[] = [];
  const pendingToolCalls: PendingToolCall[] = [];
  const completedTextPartIndices: number[] = [];
  let usageData: { inputTokens: number; outputTokens: number } | undefined;
  let stopReason: string | undefined;

  let currentPartKind: StreamPartKind | null = null;
  let currentPartContent = "";
  let partIndex = 0;

  // ─── Part 状态机辅助函数 ──────────────────────────

  const emitPartStart = (
    kind: MessagePartKind,
    customPartIndex = partIndex,
  ) => {
    emitter.emit({
      type: "message.part.start",
      messageId: msgId,
      partIndex: customPartIndex,
      kind,
    });
  };

  const emitPartEnd = (
    kind: MessagePartKind,
    state: MessagePartEndState,
    customPartIndex = partIndex,
  ) => {
    emitter.emit({
      type: "message.part.end",
      messageId: msgId,
      partIndex: customPartIndex,
      kind,
      state,
    });
  };

  const flushCurrentPart = (
    state: MessagePartEndState = MESSAGE_PART_END_STATE.COMPLETE,
  ) => {
    if (!currentPartKind) {
      return;
    }

    if (currentPartContent.length > 0) {
      if (currentPartKind === MESSAGE_PART_KIND.TEXT) {
        if (state === MESSAGE_PART_END_STATE.COMPLETE) {
          emitter.emit({
            type: "message.text.done",
            messageId: msgId,
            partIndex,
          });
        }

        completedTextPartIndices.push(partIndex);

        contentBlocks.push({
          type: "text",
          text: currentPartContent,
        });
      } else {
        if (state === MESSAGE_PART_END_STATE.COMPLETE) {
          emitter.emit({
            type: "message.reasoning.done",
            messageId: msgId,
            partIndex,
            text: currentPartContent,
          });
        }

        contentBlocks.push({
          type: "reasoning",
          text: currentPartContent,
        });
      }
    }

    emitPartEnd(currentPartKind, state);

    currentPartKind = null;
    currentPartContent = "";
    partIndex += 1;
  };

  const ensureStreamPart = (kind: StreamPartKind) => {
    if (currentPartKind !== null && currentPartKind !== kind) {
      flushCurrentPart();
    }

    if (currentPartKind === null) {
      emitPartStart(kind);
      currentPartKind = kind;
    }
  };

  const appendToStreamPart = (kind: StreamPartKind, value: string) => {
    if (!value) {
      return;
    }

    ensureStreamPart(kind);
    currentPartContent += value;

    if (kind === MESSAGE_PART_KIND.TEXT) {
      emitter.emit({
        type: "message.text.delta",
        messageId: msgId,
        partIndex,
        text: value,
      });
    } else {
      emitter.emit({
        type: "message.reasoning.delta",
        messageId: msgId,
        partIndex,
        content: value,
      });
    }
  };

  const ensureNotInterrupted = () => {
    if (interruptSignal?.aborted) {
      throw new InterruptedError();
    }
  };

  // ─── 主流程 ──────────────────────────────────────

  try {
    // 1. 消费 LLM 流式响应
    try {
      const stream = await streamWithRetry(provider, streamParams, {
        maxAttempts: MAX_RETRY_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        emitter,
      });
      ensureNotInterrupted();

      for await (const chunk of stream) {
        ensureNotInterrupted();

        switch (chunk.type) {
          case "text_delta":
            appendToStreamPart(MESSAGE_PART_KIND.TEXT, chunk.text);
            break;

          case "reasoning_delta":
            appendToStreamPart(MESSAGE_PART_KIND.REASONING, chunk.text);
            break;

          case "tool_use":
            flushCurrentPart();
            emitPartStart(MESSAGE_PART_KIND.TOOL);

            contentBlocks.push({
              type: "tool_use",
              id: chunk.id,
              name: chunk.name,
              input: chunk.input,
            });

            pendingToolCalls.push({
              id: chunk.id,
              name: chunk.name,
              input: chunk.input,
              partIndex,
            });

            partIndex += 1;
            break;

          case "usage":
            usageData = {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
            };
            break;

          case "text_annotations":
            for (const block of chunk.blocks) {
              const targetPartIndex = completedTextPartIndices[block.blockIndex];
              if (
                typeof targetPartIndex === "number" &&
                block.annotations.length > 0
              ) {
                emitter.emit({
                  type: "message.text.annotations",
                  messageId: msgId,
                  partIndex: targetPartIndex,
                  annotations: block.annotations,
                });
              }
            }
            break;

          case "stop":
            stopReason = chunk.stopReason;
            break;
        }
      }
    } catch (error) {
      if (interruptSignal?.aborted || isAbortError(error)) {
        flushCurrentPart(MESSAGE_PART_END_STATE.INTERRUPTED);

        for (const toolCall of pendingToolCalls) {
          emitToolInterrupted(
            { emitter, msgId, interruptSignal },
            toolCall,
          );
        }

        throw new InterruptedError();
      }

      flushCurrentPart(MESSAGE_PART_END_STATE.ERROR);

      for (const toolCall of pendingToolCalls) {
        emitter.emit({
          type: "message.part.end",
          messageId: msgId,
          partIndex: toolCall.partIndex,
          kind: MESSAGE_PART_KIND.TOOL,
          state: MESSAGE_PART_END_STATE.ERROR,
        });
      }

      throw error;
    }

    ensureNotInterrupted();
    flushCurrentPart();

    // 2. 执行工具调用（如有）
    let toolResultBlocks: LLMContentBlock[] = [];

    if (pendingToolCalls.length > 0) {
      const executionResult = await executeToolBatches(
        {
          emitter,
          msgId,
          interruptSignal,
          toolRegistry,
          toolContext,
          contractRegistry,
        },
        pendingToolCalls,
        partIndex, // artifact parts 从这个 index 开始
      );

      toolResultBlocks = executionResult.toolResultBlocks;
      // artifact content blocks 已经通过 emitArtifactPart 事件通知了 UI，
      // 同时也需要加入 contentBlocks 给上层用于历史记录
      contentBlocks.push(...executionResult.artifactContentBlocks);
    }

    // 3. 汇总返回
    return {
      assistantMessage: {
        role: MESSAGE_ROLE.ASSISTANT,
        content: contentBlocks,
      },
      hasToolCalls: pendingToolCalls.length > 0,
      toolResultMessage:
        pendingToolCalls.length > 0
          ? {
              role: MESSAGE_ROLE.USER,
              content: toolResultBlocks,
            }
          : undefined,
      usage: usageData,
      truncated: stopReason === "max_tokens",
    };
  } finally {
    emitter.emit({ type: "message.end", messageId: msgId });
  }
}
