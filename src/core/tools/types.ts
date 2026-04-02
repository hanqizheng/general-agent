import { z } from "zod";

import type { JSONValue } from "@/lib/artifact-types";

/** Tool 对应的风险等级 */
export type ToolRiskLevel = "low" | "medium" | "high";

/** Tool 执行上下文 */
export interface ToolContext {
  /** 工具目录根路径 */
  workspaceRoot: string;
  /** 中断信号 */
  signal?: AbortSignal;
}

/** Tool 的执行结果 */
export interface ToolResult {
  /** 输出内容（文本） */
  output: string;
  /** 是否为错误结果 */
  isError: boolean;
  /** 可选的结构化 artifact */
  artifacts?: Array<{
    artifactType: string;
    data: JSONValue;
    contractId?: string | null;
    summaryText?: string | null;
  }>;
}

/** Tool 本身的定义 */
export interface ToolDefinition<TInput = unknown> {
  /** tool 名称 */
  name: string;
  /** tool 描述 */
  description: string;
  /** tool 风险等级 */
  riskLevel: ToolRiskLevel;
  /**
   * 并发安全标记。
   * true = 只读、无副作用，可以和其他 concurrencySafe 的工具并发执行。
   * false = 有写操作或副作用，必须独占执行。
   * 默认视为 false（不声明则串行执行）。
   */
  concurrencySafe?: boolean;
  /** zod schema, 用于验证输入 + 通过 zod-to-json-schema 专程 JSON schema 传给 LLM */
  parameters: z.ZodType<TInput>;
  /** tool 的 call signature 标识当前类型的变量是可以作为函数直接调用的 */
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult>;
}
