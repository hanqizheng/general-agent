"use client";

import { useReducer } from "react";

import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  SESSION_STATUS,
  TOOL_CALL_STATUS,
  TOOL_END_STATE,
} from "@/lib/constants";
import type {
  ChatState,
  MessagePartEndState,
  UIReasoningPart,
  UITextPart,
  UIToolPart,
  UIMessagePart,
  UIMessage,
  ChatAction,
} from "@/lib/chat-types";

const initialState: ChatState = {
  sessionId: null,
  messages: [],
  status: SESSION_STATUS.IDLE,
  error: null,
  currentTurnIndex: 0,
  loopEndReason: null,
};

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

function createTextPart(
  partIndex: number,
  text = "",
  state: MessagePartEndState | null = null,
): UITextPart {
  return {
    kind: MESSAGE_PART_KIND.TEXT,
    partIndex,
    text,
    state,
  };
}

function createReasoningPart(
  partIndex: number,
  text = "",
  state: MessagePartEndState | null = null,
): UIReasoningPart {
  return {
    kind: MESSAGE_PART_KIND.REASONING,
    partIndex,
    text,
    state,
  };
}

function createToolPart(
  partIndex: number,
  state: MessagePartEndState | null = null,
): UIToolPart {
  return {
    kind: MESSAGE_PART_KIND.TOOL,
    partIndex,
    state,
    toolCallId: null,
    toolName: null,
    input: null,
    status: TOOL_CALL_STATUS.PENDING,
    updates: [],
  };
}

function createMessagePart(
  partIndex: number,
  kind: UIMessagePart["kind"],
): UIMessagePart {
  switch (kind) {
    case MESSAGE_PART_KIND.TEXT:
      return createTextPart(partIndex);
    case MESSAGE_PART_KIND.REASONING:
      return createReasoningPart(partIndex);
    case MESSAGE_PART_KIND.TOOL:
      return createToolPart(partIndex);
    default:
      return assertNever(kind);
  }
}

function createAssistantMessage(messageId: string): UIMessage {
  return {
    messageId,
    role: MESSAGE_ROLE.ASSISTANT,
    parts: [],
    isStreaming: true,
  };
}

function sortParts(parts: UIMessagePart[]) {
  return [...parts].sort((a, b) => a.partIndex - b.partIndex);
}

function replaceOrAppendPart(
  message: UIMessage,
  nextPart: UIMessagePart,
): UIMessage {
  const currentIndex = message.parts.findIndex(
    (part) => part.partIndex === nextPart.partIndex,
  );

  const nextParts =
    currentIndex === -1
      ? sortParts([...message.parts, nextPart])
      : message.parts.map((part, index) =>
          index === currentIndex ? nextPart : part,
        );

  return {
    ...message,
    parts: nextParts,
  };
}

function upsertTextPart(
  message: UIMessage,
  partIndex: number,
  updater: (part: UITextPart) => UITextPart,
): UIMessage {
  const current = message.parts.find((part) => part.partIndex === partIndex);
  const base =
    current?.kind === MESSAGE_PART_KIND.TEXT
      ? current
      : createTextPart(partIndex);

  return replaceOrAppendPart(message, updater(base));
}

function upsertReasoningPart(
  message: UIMessage,
  partIndex: number,
  updater: (part: UIReasoningPart) => UIReasoningPart,
): UIMessage {
  const current = message.parts.find((part) => part.partIndex === partIndex);
  const base =
    current?.kind === MESSAGE_PART_KIND.REASONING
      ? current
      : createReasoningPart(partIndex);

  return replaceOrAppendPart(message, updater(base));
}

function upsertToolPart(
  message: UIMessage,
  partIndex: number,
  updater: (part: UIToolPart) => UIToolPart,
): UIMessage {
  const current = message.parts.find((part) => part.partIndex === partIndex);
  const base =
    current?.kind === MESSAGE_PART_KIND.TOOL
      ? current
      : createToolPart(partIndex);

  return replaceOrAppendPart(message, updater(base));
}

function upsertAssistantMessage(
  state: ChatState,
  messageId: string,
  updater: (message: UIMessage) => UIMessage,
): ChatState {
  let found = false;

  const messages = state.messages.map((message) => {
    if (message.messageId !== messageId) {
      return message;
    }

    found = true;
    return updater(message);
  });

  if (found) {
    return {
      ...state,
      messages,
    };
  }

  return {
    ...state,
    messages: [...state.messages, updater(createAssistantMessage(messageId))],
  };
}

function updateExistingMessage(
  state: ChatState,
  messageId: string,
  updater: (message: UIMessage) => UIMessage,
): ChatState {
  let found = false;

  const messages = state.messages.map((message) => {
    if (message.messageId !== messageId) {
      return message;
    }

    found = true;
    return updater(message);
  });

  return found
    ? {
        ...state,
        messages,
      }
    : state;
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "hydrate_session":
      return {
        ...state,
        sessionId: action.sessionId,
        status: action.status,
        error: null,
      };

    case "hydrate_messages":
      return {
        ...state,
        messages: action.messages,
      };

    case "prepend_history_page": {
      const seen = new Set(state.messages.map((message) => message.messageId));
      const nextMessages = [
        ...action.messages.filter((message) => !seen.has(message.messageId)),
        ...state.messages,
      ];

      return {
        ...state,
        messages: nextMessages,
      };
    }

    case "user_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            messageId: action.messageId,
            role: MESSAGE_ROLE.USER,
            parts: [
              createTextPart(0, action.text, MESSAGE_PART_END_STATE.COMPLETE),
            ],
            isStreaming: false,
          },
        ],
      };

    case "reset":
      return initialState;

    case "session_status":
      return {
        ...state,
        sessionId: action.sessionId,
        status: action.status,
        error: action.status === SESSION_STATUS.ERROR ? state.error : null,
      };

    case "session_error":
      return {
        ...state,
        status: SESSION_STATUS.ERROR,
        error: action.error,
      };

    case "loop_start":
      return {
        ...state,
        currentTurnIndex: 0,
        loopEndReason: null,
      };

    case "loop_end":
      return {
        ...state,
        loopEndReason: action.reason,
      };

    case "turn_start":
      return {
        ...state,
        currentTurnIndex: state.currentTurnIndex + 1,
      };

    case "message_start":
      return upsertAssistantMessage(state, action.messageId, (message) => ({
        ...message,
        isStreaming: true,
      }));

    case "message_end":
      return updateExistingMessage(state, action.messageId, (message) => ({
        ...message,
        isStreaming: false,
      }));

    case "part_start":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        replaceOrAppendPart(
          message,
          createMessagePart(action.partIndex, action.kind),
        ),
      );

    case "part_end":
      return upsertAssistantMessage(state, action.messageId, (message) => {
        switch (action.kind) {
          case MESSAGE_PART_KIND.TEXT:
            return upsertTextPart(message, action.partIndex, (part) => ({
              ...part,
              state: action.state,
            }));

          case MESSAGE_PART_KIND.REASONING:
            return upsertReasoningPart(message, action.partIndex, (part) => ({
              ...part,
              state: action.state,
            }));

          case MESSAGE_PART_KIND.TOOL:
            return upsertToolPart(message, action.partIndex, (part) => ({
              ...part,
              state: action.state,
              status:
                action.state === MESSAGE_PART_END_STATE.ERROR &&
                part.status !== TOOL_CALL_STATUS.DONE
                  ? TOOL_CALL_STATUS.ERROR
                  : part.status,
            }));

          default:
            return assertNever(action.kind);
        }
      });

    case "text_delta":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertTextPart(message, action.partIndex, (part) => ({
          ...part,
          text: part.text + action.text,
        })),
      );

    case "reasoning_delta":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertReasoningPart(message, action.partIndex, (part) => ({
          ...part,
          text: part.text + action.content,
        })),
      );

    case "tool_start":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          toolName: action.toolName,
          input: action.input,
          status: TOOL_CALL_STATUS.PENDING,
        })),
      );

    case "tool_running":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          status: TOOL_CALL_STATUS.RUNNING,
        })),
      );

    case "tool_update":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          updates: [...part.updates, action.content],
        })),
      );

    case "tool_end":
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          status:
            action.state === TOOL_END_STATE.ERROR
              ? TOOL_CALL_STATUS.ERROR
              : TOOL_CALL_STATUS.DONE,
          output: action.output,
          error: action.error,
          durationMs: action.durationMs,
        })),
      );

    default:
      return state;
  }
}

export function useChatState(seedState: ChatState = initialState) {
  const [state, dispatch] = useReducer(chatReducer, seedState);
  return { state, dispatch };
}
