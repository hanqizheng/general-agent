/**
 * 工具编排 —— 将一组工具调用分区为可并行和必须串行的批次。
 *
 * 核心思路：
 * - 连续的 concurrencySafe=true 工具归入同一个并发批次，用 Promise.allSettled 并行
 * - 遇到 concurrencySafe=false 的工具，先提交之前积攒的并发批次，再单独串行执行
 * - 批次之间是严格顺序的（上一批全部完成才执行下一批）
 */

import type { PendingToolCall } from "./types";
import type { ToolRegistry } from "../tools/registry";

export interface ToolBatch {
  toolCalls: PendingToolCall[];
  /** true = 这个批次内的工具可以并发执行 */
  concurrent: boolean;
}

/**
 * 将一组 pending tool calls 分区为批次。
 *
 * 示例：[read(a), read(b), write(c), read(d), grep(e)]
 * → 批次 1: [read(a), read(b)]     concurrent=true
 * → 批次 2: [write(c)]             concurrent=false
 * → 批次 3: [read(d), grep(e)]     concurrent=true
 */
export function partitionToolCalls(
  toolCalls: PendingToolCall[],
  registry: ToolRegistry,
): ToolBatch[] {
  if (toolCalls.length === 0) {
    return [];
  }

  const batches: ToolBatch[] = [];
  let currentConcurrentBatch: PendingToolCall[] = [];

  for (const toolCall of toolCalls) {
    const tool = registry.has(toolCall.name)
      ? registry.get(toolCall.name)
      : null;
    const isSafe = tool?.concurrencySafe === true;

    if (isSafe) {
      currentConcurrentBatch.push(toolCall);
    } else {
      // 遇到不安全工具：先提交积攒的并发批次
      if (currentConcurrentBatch.length > 0) {
        batches.push({
          toolCalls: currentConcurrentBatch,
          concurrent: true,
        });
        currentConcurrentBatch = [];
      }
      // 不安全工具独占一个串行批次
      batches.push({
        toolCalls: [toolCall],
        concurrent: false,
      });
    }
  }

  // 别忘了最后积攒的并发批次
  if (currentConcurrentBatch.length > 0) {
    batches.push({
      toolCalls: currentConcurrentBatch,
      concurrent: true,
    });
  }

  return batches;
}
