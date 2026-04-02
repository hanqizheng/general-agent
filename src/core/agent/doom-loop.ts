/**
 * Doom Loop 检测 —— 识别 LLM 反复用相同参数调用相同工具并持续报错的情况。
 *
 * 典型场景：
 * - LLM 反复尝试 read_file("/nonexistent") → 每次都 "file not found"
 * - LLM 反复 bash("invalid command") → 每次都 "command not found"
 *
 * 检测方式：
 * 1. 每个 turn 结束后，从 TurnResult 提取所有 (toolName, input, isError) 三元组
 * 2. 将三元组序列化为"指纹"字符串
 * 3. 如果连续 N 个 turn 的指纹完全相同且包含错误，判定为 doom loop
 *
 * 为什么用指纹而不是逐字段比较？
 * - JSON.stringify 后的字符串比较简单高效
 * - 覆盖了 input 中任意嵌套结构的变化
 * - 如果 LLM 稍微改了一个参数（哪怕是多了个空格），指纹就不同，计数重置
 *   这正是我们想要的：只有**完全相同**的重复才是 doom loop
 */

import type { LLMContentBlock } from "../provider/base";
import type { TurnResult } from "./types";

/**
 * 从 TurnResult 中提取当前 turn 的工具调用指纹。
 *
 * 指纹格式：将所有 tool_use 块按顺序提取 (name, input)，
 * 再与对应的 tool_result 的 isError 配对，最后 JSON.stringify。
 *
 * 如果这个 turn 没有工具调用，返回 null（不参与 doom loop 计数）。
 */
export function extractTurnFingerprint(result: TurnResult): string | null {
  if (!result.hasToolCalls) {
    return null;
  }

  // 从 assistantMessage 中提取 tool_use 块
  const toolUseBlocks = result.assistantMessage.content.filter(
    (block): block is Extract<LLMContentBlock, { type: "tool_use" }> =>
      block.type === "tool_use",
  );

  if (toolUseBlocks.length === 0) {
    return null;
  }

  // 从 toolResultMessage 中提取 tool_result 块，建立 id → isError 映射
  const errorMap = new Map<string, boolean>();
  if (result.toolResultMessage) {
    for (const block of result.toolResultMessage.content) {
      if (block.type === "tool_result") {
        errorMap.set(block.toolCallId, block.isError === true);
      }
    }
  }

  // 构建指纹：[(name, input, isError), ...]
  const fingerprint = toolUseBlocks.map((block) => ({
    name: block.name,
    input: block.input,
    isError: errorMap.get(block.id) ?? false,
  }));

  return JSON.stringify(fingerprint);
}

/**
 * 判断指纹是否代表一个"全部报错"的 turn。
 *
 * 只有当 turn 中**所有**工具调用都失败时才计入 doom loop。
 * 如果有部分成功，说明 LLM 还在做有效工作。
 */
export function isFingerprintAllErrors(result: TurnResult): boolean {
  if (!result.toolResultMessage) {
    return false;
  }

  const resultBlocks = result.toolResultMessage.content.filter(
    (block): block is Extract<LLMContentBlock, { type: "tool_result" }> =>
      block.type === "tool_result",
  );

  if (resultBlocks.length === 0) {
    return false;
  }

  return resultBlocks.every((block) => block.isError === true);
}

/**
 * Doom loop 追踪器。
 *
 * 在 loop 层每个 turn 结束后调用 `track(result)`，
 * 返回值告诉调用者是否检测到 doom loop。
 *
 * 使用方式：
 * ```ts
 * const tracker = createDoomLoopTracker(DOOM_LOOP_THRESHOLD);
 * // 在每个 turn 结束后：
 * if (tracker.track(result)) {
 *   // doom loop detected, break
 * }
 * ```
 */
export function createDoomLoopTracker(threshold: number) {
  let lastFingerprint: string | null = null;
  let consecutiveCount = 0;

  return {
    /**
     * 追踪一个 turn 的结果，返回是否检测到 doom loop。
     */
    track(result: TurnResult): boolean {
      const fingerprint = extractTurnFingerprint(result);

      // 没有工具调用 → 重置计数
      if (fingerprint === null) {
        lastFingerprint = null;
        consecutiveCount = 0;
        return false;
      }

      // 不是全部报错 → 重置计数（LLM 还在做有效工作）
      if (!isFingerprintAllErrors(result)) {
        lastFingerprint = fingerprint;
        consecutiveCount = 0;
        return false;
      }

      // 与上次指纹相同且全部报错 → 累加计数
      if (fingerprint === lastFingerprint) {
        consecutiveCount += 1;
      } else {
        // 指纹变了（虽然也是错误），重新开始计数
        lastFingerprint = fingerprint;
        consecutiveCount = 1;
      }

      return consecutiveCount >= threshold;
    },

    /** 当前连续重复次数（用于日志/调试） */
    get count() {
      return consecutiveCount;
    },
  };
}
