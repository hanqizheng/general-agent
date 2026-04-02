import type { ContextWindowConfig } from "./token-budget";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMStreamParams,
} from "../provider/base";
import type { LLMProvider } from "../provider/base";

import type { LoopEndReason } from "../events/types";
import type { EventEmitter } from "../events/emitter";
import type { ArtifactContractRegistry } from "../contracts";
import type { ToolRegistry } from "../tools/registry";
import type { ToolContext } from "../tools/types";

/** Agent Loop 的启动参数 */
export interface AgentLoopStartParams {
  provider: LLMProvider;
  emitter: EventEmitter;
  systemPrompt: string;
  userContent: LLMContentBlock[];
  history: LLMMessage[];
  maxTurns?: number;
  interruptSignal?: AbortSignal;
  toolRegistry?: ToolRegistry;
  toolContext?: ToolContext;
  contractRegistry?: ArtifactContractRegistry;
  targetArtifactContractId?: string | null;
  /** 上下文窗口配置，不传则使用默认值（200k context / 8k output） */
  contextWindowConfig?: ContextWindowConfig;
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
  contractRegistry?: ArtifactContractRegistry;
}

/** 一次 Turn 的输出 */
export interface TurnResult {
  assistantMessage: LLMMessage;
  hasToolCalls: boolean;
  toolResultMessage?: LLMMessage;
  /** API 返回的 token 使用量（如有），用于上下文窗口管理 */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** 输出是否因 max_tokens 限制被截断（需要续接） */
  truncated?: boolean;
}

export interface PendingToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  partIndex: number;
}
