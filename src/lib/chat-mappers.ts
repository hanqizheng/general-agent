import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_STATUS,
  TOOL_CALL_STATUS,
} from "./constants";
import { CHAT_TRANSPORT_STATUS } from "./chat-constants";
import type { ChatState, UIMessage, UIMessagePart } from "./chat-types";
import type {
  SessionDetailDto,
  SessionMessagesPageDto,
  TranscriptMessageDto,
  TranscriptPartDto,
} from "./session-dto";

function mapPartState(state: TranscriptPartDto["state"]) {
  return state;
}

function mapTranscriptPartToUiPart(part: TranscriptPartDto): UIMessagePart {
  if (part.kind === MESSAGE_PART_KIND.TEXT) {
    return {
      kind: MESSAGE_PART_KIND.TEXT,
      partIndex: part.partIndex,
      state: mapPartState(part.state),
      text: part.textContent ?? "",
    };
  }

  if (part.kind === MESSAGE_PART_KIND.REASONING) {
    return {
      kind: MESSAGE_PART_KIND.REASONING,
      partIndex: part.partIndex,
      state: mapPartState(part.state),
      text: part.textContent ?? "",
    };
  }

  return {
    kind: MESSAGE_PART_KIND.TOOL,
    partIndex: part.partIndex,
    state: mapPartState(part.state),
    toolCallId:
      typeof part.payload.toolCallId === "string" ? part.payload.toolCallId : null,
    toolName:
      typeof part.payload.toolName === "string" ? part.payload.toolName : null,
    input:
      typeof part.payload.input === "object" && part.payload.input
        ? (part.payload.input as Record<string, unknown>)
        : null,
    status:
      part.state === null
        ? TOOL_CALL_STATUS.RUNNING
        : part.state === MESSAGE_PART_END_STATE.INTERRUPTED
          ? TOOL_CALL_STATUS.INTERRUPTED
        : part.state === MESSAGE_PART_END_STATE.ERROR
          ? TOOL_CALL_STATUS.ERROR
          : TOOL_CALL_STATUS.DONE,
    updates: [],
    output: part.textContent ?? undefined,
    error:
      typeof part.payload.error === "string" ? part.payload.error : undefined,
    durationMs:
      typeof part.payload.durationMs === "number"
        ? part.payload.durationMs
        : undefined,
  };
}

export function mapTranscriptMessageToUiMessage(
  message: TranscriptMessageDto,
): UIMessage {
  return {
    messageId: message.id,
    role: message.role,
    parts: message.parts.map(mapTranscriptPartToUiPart),
    isStreaming: message.status === MESSAGE_STATUS.STREAMING,
    status: message.status,
  };
}

export function mapMessagesPageToUiMessages(page: SessionMessagesPageDto) {
  return page.messages.map(mapTranscriptMessageToUiMessage);
}

export function buildInitialChatState(
  session: SessionDetailDto,
  page: SessionMessagesPageDto,
): ChatState {
  return {
    sessionId: session.id,
    status: session.status,
    requestError: null,
    transportError: null,
    transportStatus: CHAT_TRANSPORT_STATUS.CONNECTED,
    loopEndReason: null,
    currentTurnIndex: Math.max(
      0,
      ...page.messages.map((message) => message.turnIndex ?? 0),
    ),
    messages: mapMessagesPageToUiMessages(page),
  };
}
