import type { LLMMessage, LLMStreamParams } from "../provider/base";
import type { LLMProvider } from "../provider/base";

import type { LoopEndReason } from "../events/types";
import type { EventEmitter } from "../events/emitter";
import type { ToolRegistry } from "../tools/registry";
import type { ToolContext } from "../tools/types";

/** Agent Loop 的启动参数 */
export interface AgentLoopStartParams {
  provider: LLMProvider;
  emitter: EventEmitter;
  systemPrompt: string;
  userMessage: string;
  history: LLMMessage[];
  maxTurns?: number;
  interruptSignal?: AbortSignal;
  toolRegistry?: ToolRegistry;
  toolContext?: ToolContext;
}

/** Agent Loop 运行结果 */
export interface AgentLoopResult {
  messages: LLMMessage[];
  turnCount: number;
  endReason: LoopEndReason;
}

/** 一次 Turn 的输入 */
export interface TurnParams {
  provider: LLMProvider;
  emitter: EventEmitter;
  streamParams: LLMStreamParams;
  toolRegistry?: ToolRegistry;
  toolContext?: ToolContext;
}

/** 一次 Turn 的输出 */
export interface TurnResult {
  assistantMessage: LLMMessage;
  hasToolCalls: boolean;
  toolResultMessage?: LLMMessage;
}

export interface PendingToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  partIndex: number;
}
