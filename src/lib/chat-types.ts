import {
  LOOP_END_REASON,
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  SESSION_STATUS,
  TOOL_CALL_STATUS,
  TOOL_END_STATE,
} from "./constants";
import { CHAT_ACTION_TYPE, CHAT_TRANSPORT_STATUS } from "./chat-constants";
import type {
  ArtifactPartPayload,
  JSONValue,
} from "./artifact-types";
import type { AttachmentKind, AttachmentMimeType } from "./attachment-types";

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

export type MessageStatus =
  (typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];

export type TransportStatus =
  (typeof CHAT_TRANSPORT_STATUS)[keyof typeof CHAT_TRANSPORT_STATUS];

export type UIMessageStatus = MessageStatus;
export type ComposerAttachmentStatus = "uploading" | "ready" | "error";

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

export interface UIAttachmentPart extends UIMessagePartBase {
  kind: typeof MESSAGE_PART_KIND.ATTACHMENT;
  attachmentId: string;
  attachmentKind: AttachmentKind;
  mimeType: AttachmentMimeType;
  originalName: string | null;
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

export interface UIArtifactPart extends UIMessagePartBase {
  kind: typeof MESSAGE_PART_KIND.ARTIFACT;
  artifactType: string | null;
  contractId: string | null;
  producer: ArtifactPartPayload["producer"] | null;
  data: JSONValue | null;
  summaryText?: string | null;
}

export type UIMessagePart =
  | UITextPart
  | UIAttachmentPart
  | UIReasoningPart
  | UIToolPart
  | UIArtifactPart;

export interface UIMessage {
  messageId: string;
  role: UIMessageRole;
  parts: UIMessagePart[];
  isStreaming: boolean;
  status: UIMessageStatus;
}

export interface ComposerAttachmentDraft {
  clientId: string;
  sessionId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: ComposerAttachmentStatus;
  attachmentId: string | null;
  error: string | null;
  abortController: AbortController | null;
  file: File;
  dedupeKey: string;
}

export interface ChatState {
  sessionId: string | null;
  messages: UIMessage[];
  status: SessionStatus;
  requestError: string | null;
  transportError: string | null;
  transportStatus: TransportStatus;
  currentTurnIndex: number;
  loopEndReason: LoopEndReason | null;
}

export type ChatAction =
  | {
      type: typeof CHAT_ACTION_TYPE.HYDRATE_SESSION;
      sessionId: string;
      status: SessionStatus;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.HYDRATE_MESSAGES;
      messages: UIMessage[];
    }
  | {
      type: typeof CHAT_ACTION_TYPE.PREPEND_HISTORY_PAGE;
      messages: UIMessage[];
    }
  | {
      type: typeof CHAT_ACTION_TYPE.USER_MESSAGE;
      message: UIMessage;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.SESSION_STATUS;
      sessionId: string;
      status: SessionStatus;
    }
  | { type: typeof CHAT_ACTION_TYPE.REQUEST_ERROR; error: string }
  | { type: typeof CHAT_ACTION_TYPE.CLEAR_REQUEST_ERROR }
  | {
      type: typeof CHAT_ACTION_TYPE.TRANSPORT_STATUS;
      status: TransportStatus;
      error?: string | null;
    }
  | { type: typeof CHAT_ACTION_TYPE.LOOP_START }
  | { type: typeof CHAT_ACTION_TYPE.LOOP_END; reason: LoopEndReason }
  | { type: typeof CHAT_ACTION_TYPE.TURN_START; turnId: string }
  | { type: typeof CHAT_ACTION_TYPE.MESSAGE_START; messageId: string }
  | { type: typeof CHAT_ACTION_TYPE.MESSAGE_END; messageId: string }
  | {
      type: typeof CHAT_ACTION_TYPE.PART_START;
      messageId: string;
      partIndex: number;
      kind: MessagePartKind;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.PART_END;
      messageId: string;
      partIndex: number;
      kind: MessagePartKind;
      state: MessagePartEndState;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.TEXT_DELTA;
      messageId: string;
      partIndex: number;
      text: string;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.REASONING_DELTA;
      messageId: string;
      partIndex: number;
      content: string;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.ARTIFACT;
      messageId: string;
      partIndex: number;
      artifact: ArtifactPartPayload;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.TOOL_START;
      messageId: string;
      partIndex: number;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.TOOL_RUNNING;
      messageId: string;
      partIndex: number;
      toolCallId: string;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.TOOL_UPDATE;
      messageId: string;
      partIndex: number;
      toolCallId: string;
      content: string;
    }
  | {
      type: typeof CHAT_ACTION_TYPE.TOOL_END;
      messageId: string;
      partIndex: number;
      toolCallId: string;
      state: ToolEndState;
      output: string;
      error?: string;
      durationMs: number;
    }
  | { type: typeof CHAT_ACTION_TYPE.RESET };
