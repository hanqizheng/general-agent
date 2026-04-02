/**
 * 工具执行器 —— 负责执行 pending tool calls 并收集结果。
 *
 * 从 turn.ts 中提取出来，让 turn.ts 只负责编排，不关心工具执行的细节。
 *
 * 职责：
 * - 执行单个工具调用（参数验证 → execute → artifact 处理 → 事件发射）
 * - 按批次编排：并行批次用 Promise.allSettled，串行批次逐个执行
 * - 中断处理：检查 AbortSignal，被中断的工具发射 interrupted 事件
 */

import { MESSAGE_PART_KIND, DEFAULT_TOOL_TIMEOUT_MS } from "@/lib/constants";
import { InterruptedError, isAbortError } from "@/lib/errors";

import { MESSAGE_PART_END_STATE, TOOL_END_STATE } from "../events/constants";
import {
  artifactPayloadToContentBlock,
  buildArtifactPayload,
} from "./artifacts";
import { partitionToolCalls } from "./tool-orchestration";
import type { EventEmitter } from "../events/emitter";
import type { LLMContentBlock } from "../provider/base";
import type { PendingToolCall } from "./types";
import type { ArtifactPartPayload } from "@/lib/artifact-types";
import type { ArtifactContractRegistry } from "../contracts";
import type { ToolRegistry } from "../tools/registry";
import type { ToolContext } from "../tools/types";

/** 工具执行所需的上下文 */
export interface ToolExecutorContext {
  emitter: EventEmitter;
  msgId: string;
  interruptSignal?: AbortSignal;
  toolRegistry?: ToolRegistry;
  toolContext?: ToolContext;
  contractRegistry?: ArtifactContractRegistry;
}

/** 工具执行的结果 */
export interface ToolExecutionResult {
  /** tool_result content blocks，顺序与 pendingToolCalls 一致 */
  toolResultBlocks: LLMContentBlock[];
  /** 工具产出的 artifact content blocks */
  artifactContentBlocks: LLMContentBlock[];
}

/**
 * 标记一个 pending tool call 为被中断状态。
 *
 * 用于两种场景：
 * 1. 工具执行过程中被中断（emitToolEnd=true，发射 tool.end + part.end）
 * 2. 工具还未开始执行就被中断（emitToolEnd=false，只发射 part.end）
 */
function emitToolInterrupted(
  ctx: ToolExecutorContext,
  toolCall: PendingToolCall,
  durationMs = 0,
  emitToolEnd = false,
) {
  if (emitToolEnd) {
    ctx.emitter.emit({
      type: "message.tool.end",
      messageId: ctx.msgId,
      partIndex: toolCall.partIndex,
      toolCallId: toolCall.id,
      output: "Interrupted by user.",
      error: undefined,
      durationMs,
      state: TOOL_END_STATE.INTERRUPTED,
    });
  }

  ctx.emitter.emit({
    type: "message.part.end",
    messageId: ctx.msgId,
    partIndex: toolCall.partIndex,
    kind: MESSAGE_PART_KIND.TOOL,
    state: MESSAGE_PART_END_STATE.INTERRUPTED,
  });
}

/**
 * 执行单个工具调用。
 *
 * 生命周期：tool.start → tool.running → execute() → tool.end → part.end
 * 如果 execute 抛出 InterruptedError，会在内部发射 interrupted 事件后重新抛出。
 */
async function executeSingleTool(
  ctx: ToolExecutorContext,
  toolCall: PendingToolCall,
): Promise<{
  toolResultBlock: LLMContentBlock;
  producedArtifacts: ArtifactPartPayload[];
}> {
  ctx.emitter.emit({
    type: "message.tool.start",
    messageId: ctx.msgId,
    partIndex: toolCall.partIndex,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    input: toolCall.input,
  });

  ctx.emitter.emit({
    type: "message.tool.running",
    messageId: ctx.msgId,
    partIndex: toolCall.partIndex,
    toolCallId: toolCall.id,
  });

  const startTime = Date.now();
  let output = "";
  let isError = false;
  const producedArtifacts: ArtifactPartPayload[] = [];

  if (!ctx.toolRegistry || !ctx.toolContext) {
    output = "Tool system is not configured.";
    isError = true;
  } else {
    try {
      if (ctx.interruptSignal?.aborted) throw new InterruptedError();

      const tool = ctx.toolRegistry.get(toolCall.name);
      const parsed = tool.parameters.parse(toolCall.input);

      // 为工具执行创建一个组合信号：用户中断 OR 超时（5 分钟）
      // AbortSignal.any 将两个信号合并：任一触发即中止
      const timeoutSignal = AbortSignal.timeout(DEFAULT_TOOL_TIMEOUT_MS);
      const combinedSignal = ctx.interruptSignal
        ? AbortSignal.any([ctx.interruptSignal, timeoutSignal])
        : timeoutSignal;

      const toolContext = {
        ...ctx.toolContext,
        signal: combinedSignal,
      };

      const result = await tool.execute(parsed, toolContext);

      if (ctx.interruptSignal?.aborted) throw new InterruptedError();

      output = result.output;
      isError = result.isError;

      for (const artifact of result.artifacts ?? []) {
        if (artifact.contractId) {
          if (!ctx.contractRegistry) {
            throw new Error(
              `Artifact contract registry is not configured for "${artifact.contractId}".`,
            );
          }

          const contract = ctx.contractRegistry.get(artifact.contractId);
          producedArtifacts.push(
            buildArtifactPayload(
              contract,
              {
                data: artifact.data,
                summaryText: artifact.summaryText ?? null,
              },
              {
                kind: "tool",
                name: toolCall.name,
              },
            ),
          );
          continue;
        }

        producedArtifacts.push({
          artifactType: artifact.artifactType,
          contractId: artifact.contractId ?? null,
          producer: {
            kind: "tool",
            name: toolCall.name,
          },
          data: artifact.data,
          summaryText: artifact.summaryText ?? null,
        });
      }
    } catch (error: unknown) {
      // 区分用户中断 vs 工具超时 vs 普通错误
      if (ctx.interruptSignal?.aborted) {
        // 用户主动中断 → 向上传播 InterruptedError
        emitToolInterrupted(ctx, toolCall, Date.now() - startTime, true);
        throw new InterruptedError();
      }

      if (isAbortError(error)) {
        // AbortSignal 触发但不是用户中断 → 一定是超时
        output = `Error executing tool "${toolCall.name}": execution timed out after ${DEFAULT_TOOL_TIMEOUT_MS / 1000}s`;
        isError = true;
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown tool execution error";

        output = `Error executing tool "${toolCall.name}": ${message}`;
        isError = true;
      }
    }
  }

  ctx.emitter.emit({
    type: "message.tool.end",
    messageId: ctx.msgId,
    partIndex: toolCall.partIndex,
    toolCallId: toolCall.id,
    output,
    error: isError ? output : undefined,
    durationMs: Date.now() - startTime,
    state: isError ? TOOL_END_STATE.ERROR : TOOL_END_STATE.COMPLETE,
  });

  ctx.emitter.emit({
    type: "message.part.end",
    messageId: ctx.msgId,
    partIndex: toolCall.partIndex,
    kind: MESSAGE_PART_KIND.TOOL,
    state: isError
      ? MESSAGE_PART_END_STATE.ERROR
      : MESSAGE_PART_END_STATE.COMPLETE,
  });

  return {
    toolResultBlock: {
      type: "tool_result",
      toolCallId: toolCall.id,
      content: output,
      isError,
    },
    producedArtifacts,
  };
}

/**
 * 按批次执行所有 pending tool calls。
 *
 * @param ctx       执行上下文（emitter、signal 等）
 * @param toolCalls 待执行的工具调用列表
 * @param startPartIndex artifact part 的起始索引（紧接在最后一个 tool part 之后）
 */
export async function executeToolBatches(
  ctx: ToolExecutorContext,
  toolCalls: PendingToolCall[],
  startPartIndex: number,
): Promise<ToolExecutionResult> {
  const toolResultBlocks: LLMContentBlock[] = [];
  const artifactContentBlocks: LLMContentBlock[] = [];
  let nextArtifactPartIndex = startPartIndex;

  const emitArtifactPart = (
    artifact: ArtifactPartPayload,
    artifactPartIndex: number,
  ) => {
    ctx.emitter.emit({
      type: "message.part.start",
      messageId: ctx.msgId,
      partIndex: artifactPartIndex,
      kind: MESSAGE_PART_KIND.ARTIFACT,
    });
    ctx.emitter.emit({
      type: "message.artifact",
      messageId: ctx.msgId,
      partIndex: artifactPartIndex,
      artifact,
    });
    ctx.emitter.emit({
      type: "message.part.end",
      messageId: ctx.msgId,
      partIndex: artifactPartIndex,
      kind: MESSAGE_PART_KIND.ARTIFACT,
      state: MESSAGE_PART_END_STATE.COMPLETE,
    });
    artifactContentBlocks.push(artifactPayloadToContentBlock(artifact));
  };

  // 分区：连续的 concurrencySafe 工具归入并行批次，其余串行
  const batches = ctx.toolRegistry
    ? partitionToolCalls(toolCalls, ctx.toolRegistry)
    : toolCalls.map((tc) => ({
        toolCalls: [tc],
        concurrent: false,
      }));

  for (const batch of batches) {
    if (ctx.interruptSignal?.aborted) {
      for (const tc of batch.toolCalls) {
        emitToolInterrupted(ctx, tc);
      }
      throw new InterruptedError();
    }

    if (batch.concurrent && batch.toolCalls.length > 1) {
      const settled = await Promise.allSettled(
        batch.toolCalls.map((tc) => executeSingleTool(ctx, tc)),
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          for (const artifact of outcome.value.producedArtifacts) {
            emitArtifactPart(artifact, nextArtifactPartIndex);
            nextArtifactPartIndex += 1;
          }
          toolResultBlocks.push(outcome.value.toolResultBlock);
        } else {
          if (outcome.reason instanceof InterruptedError) {
            throw outcome.reason;
          }
          throw outcome.reason;
        }
      }
    } else {
      for (const tc of batch.toolCalls) {
        if (ctx.interruptSignal?.aborted) {
          emitToolInterrupted(ctx, tc);
          throw new InterruptedError();
        }
        const result = await executeSingleTool(ctx, tc);
        for (const artifact of result.producedArtifacts) {
          emitArtifactPart(artifact, nextArtifactPartIndex);
          nextArtifactPartIndex += 1;
        }
        toolResultBlocks.push(result.toolResultBlock);
      }
    }
  }

  return { toolResultBlocks, artifactContentBlocks };
}

export { emitToolInterrupted };
