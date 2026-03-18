import {
  LOOP_END_REASON,
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  SESSION_STATUS,
  TOOL_CALL_STATUS,
  TOOL_END_STATE,
} from "./constants";

export type SessionStatus =
  (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export type LoopEndReason =
  (typeof LOOP_END_REASON)[keyof typeof LOOP_END_REASON];

export type MessagePartKind =
  (typeof MESSAGE_PART_KIND)[keyof typeof MESSAGE_PART_KIND];

export type MessagePartEndState =
  (typeof MESSAGE_PART_END_STATE)[keyof typeof MESSAGE_PART_END_STATE];

export type ToolCallStatus =
  (typeof TOOL_CALL_STATUS)[keyof typeof TOOL_CALL_STATUS];

export type ToolEndState = (typeof TOOL_END_STATE)[keyof typeof TOOL_END_STATE];

/**
 * UI 消息只有 user 和 assistant 两种角色。
 * system prompt 不会出现在聊天列表里。
 */
export type UIMessageRole =
  | typeof MESSAGE_ROLE.USER
  | typeof MESSAGE_ROLE.ASSISTANT;

interface UIMessagePartBase {
  partIndex: number;
  /**
   * part 的生命周期收口状态。
   * null 表示 part 已经开始，但还没有结束。
   */
  state: MessagePartEndState | null;
}

export interface UITextPart extends UIMessagePartBase {
  kind: typeof MESSAGE_PART_KIND.TEXT;
  text: string;
}

export interface UIReasoningPart extends UIMessagePartBase {
  kind: typeof MESSAGE_PART_KIND.REASONING;
  text: string;
}

export interface UIToolPart extends UIMessagePartBase {
  kind: typeof MESSAGE_PART_KIND.TOOL;
  toolCallId: string | null;
  toolName: string | null;
  input: Record<string, unknown> | null;
  status: ToolCallStatus;
  updates: string[];
  output?: string;
  error?: string;
  durationMs?: number;
}

export type UIMessagePart = UITextPart | UIReasoningPart | UIToolPart;

export interface UIMessage {
  messageId: string;
  role: UIMessageRole;
  parts: UIMessagePart[];
  isStreaming: boolean;
}

export interface ChatState {
  sessionId: string | null;
  messages: UIMessage[];
  status: SessionStatus;
  error: string | null;
  currentTurnIndex: number;
  loopEndReason: LoopEndReason | null;
}

export type ChatAction =
  | {
      type: "hydrate_session";
      sessionId: string;
      status: SessionStatus;
    }
  | {
      type: "hydrate_messages";
      messages: UIMessage[];
    }
  | {
      type: "prepend_history_page";
      messages: UIMessage[];
    }
  | { type: "user_message"; messageId: string; text: string }
  | { type: "session_status"; sessionId: string; status: SessionStatus }
  | { type: "session_error"; error: string }
  | { type: "loop_start" }
  | { type: "loop_end"; reason: LoopEndReason }
  | { type: "turn_start"; turnId: string }
  | { type: "message_start"; messageId: string }
  | { type: "message_end"; messageId: string }
  | {
      type: "part_start";
      messageId: string;
      partIndex: number;
      kind: MessagePartKind;
    }
  | {
      type: "part_end";
      messageId: string;
      partIndex: number;
      kind: MessagePartKind;
      state: MessagePartEndState;
    }
  | {
      type: "text_delta";
      messageId: string;
      partIndex: number;
      text: string;
    }
  | {
      type: "reasoning_delta";
      messageId: string;
      partIndex: number;
      content: string;
    }
  | {
      type: "tool_start";
      messageId: string;
      partIndex: number;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_running";
      messageId: string;
      partIndex: number;
      toolCallId: string;
    }
  | {
      type: "tool_update";
      messageId: string;
      partIndex: number;
      toolCallId: string;
      content: string;
    }
  | {
      type: "tool_end";
      messageId: string;
      partIndex: number;
      toolCallId: string;
      state: ToolEndState;
      output: string;
      error?: string;
      durationMs: number;
    }
  | { type: "reset" };
