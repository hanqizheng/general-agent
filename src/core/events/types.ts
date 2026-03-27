import type { ArtifactPartPayload } from "@/lib/artifact-types";
import {
  MESSAGE_PART_KIND,
  SESSION_EVENT_TYPE,
} from "@/lib/constants";
import {
  SESSION_STATUS,
  LOOP_END_REASON,
  TURN_END_REASON,
  TOOL_END_STATE,
  MESSAGE_PART_END_STATE,
} from "./constants";
import type { MessageRole } from "@/lib/types";

export type SessionStatus =
  (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];
export type LoopEndReason =
  (typeof LOOP_END_REASON)[keyof typeof LOOP_END_REASON];
export type TurnEndReason =
  (typeof TURN_END_REASON)[keyof typeof TURN_END_REASON];
export type ToolEndState = (typeof TOOL_END_STATE)[keyof typeof TOOL_END_STATE];
export type MessagePartEndState =
  (typeof MESSAGE_PART_END_STATE)[keyof typeof MESSAGE_PART_END_STATE];
export type MessagePartKind =
  (typeof MESSAGE_PART_KIND)[keyof typeof MESSAGE_PART_KIND];

export interface EventBase {
  sessionId: string;
  seq: number;
  timestamp: number;
}

interface SessionStatusEvent extends EventBase {
  type: typeof SESSION_EVENT_TYPE.STATUS;
  status: SessionStatus;
}

interface SessionPresentationEvent extends EventBase {
  type: typeof SESSION_EVENT_TYPE.PRESENTATION;
  title: string;
}

interface LoopStartEvent extends EventBase {
  type: "loop.start";
}

interface LoopEndEvent extends EventBase {
  type: "loop.end";
  reason: LoopEndReason;
}

interface TurnStartEvent extends EventBase {
  type: "turn.start";
  turnId: string;
}

interface TurnEndEvent extends EventBase {
  type: "turn.end";
  turnId: string;
  reason: TurnEndReason;
}

interface MessageStartEvent extends EventBase {
  type: "message.start";
  messageId: string;
  role: MessageRole;
}

interface MessagePartStartEvent extends EventBase {
  type: "message.part.start";
  messageId: string;
  partIndex: number;
  kind: MessagePartKind;
}

interface MessagePartEndEvent extends EventBase {
  type: "message.part.end";
  messageId: string;
  partIndex: number;
  kind: MessagePartKind;
  state: MessagePartEndState;
}

interface MessageEndEvent extends EventBase {
  type: "message.end";
  messageId: string;
}

interface TextDeltaEvent extends EventBase {
  type: "message.text.delta";
  messageId: string;
  partIndex: number;
  text: string;
}

interface TextDoneEvent extends EventBase {
  type: "message.text.done";
  messageId: string;
  partIndex: number;
}

interface MessageReasoningDeltaEvent extends EventBase {
  type: "message.reasoning.delta";
  messageId: string;
  partIndex: number;
  content: string;
}

interface MessageReasoningDoneEvent extends EventBase {
  type: "message.reasoning.done";
  messageId: string;
  partIndex: number;
  text: string;
}

interface ToolStartEvent extends EventBase {
  type: "message.tool.start";
  messageId: string;
  partIndex: number;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolRunningEvent extends EventBase {
  type: "message.tool.running";
  messageId: string;
  partIndex: number;
  toolCallId: string;
}

interface ToolUpdateEvent extends EventBase {
  type: "message.tool.update";
  messageId: string;
  partIndex: number;
  toolCallId: string;
  content: string;
}

interface ToolEndEvent extends EventBase {
  type: "message.tool.end";
  messageId: string;
  partIndex: number;
  toolCallId: string;
  state: ToolEndState;
  output: string;
  error?: string;
  durationMs: number;
}

interface ArtifactEvent extends EventBase {
  type: "message.artifact";
  messageId: string;
  partIndex: number;
  artifact: ArtifactPartPayload;
}

interface ErrorEvent extends EventBase {
  type: typeof SESSION_EVENT_TYPE.ERROR;
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

interface HeartbeatEvent extends EventBase {
  type: typeof SESSION_EVENT_TYPE.HEARTBEAT;
}

export type AgentEvent =
  | SessionStatusEvent
  | SessionPresentationEvent
  | LoopStartEvent
  | LoopEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessagePartStartEvent
  | MessagePartEndEvent
  | MessageEndEvent
  | TextDeltaEvent
  | TextDoneEvent
  | MessageReasoningDeltaEvent
  | MessageReasoningDoneEvent
  | ToolStartEvent
  | ToolRunningEvent
  | ToolUpdateEvent
  | ToolEndEvent
  | ArtifactEvent
  | ErrorEvent
  | HeartbeatEvent;
