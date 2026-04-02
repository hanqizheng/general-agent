"use client";

import { useReducer } from "react";

import {
  CHAT_ACTION_TYPE,
  CHAT_TRANSPORT_STATUS,
} from "@/lib/chat-constants";
import {
  LOOP_END_REASON,
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  SESSION_STATUS,
  TOOL_CALL_STATUS,
  TOOL_END_STATE,
} from "@/lib/constants";
import type {
  ChatState,
  UIAttachmentPart,
  MessagePartEndState,
  UIArtifactPart,
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
  requestError: null,
  transportError: null,
  transportStatus: CHAT_TRANSPORT_STATUS.CONNECTED,
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

function createAttachmentPart(
  partIndex: number,
  state: MessagePartEndState | null = null,
): UIAttachmentPart {
  return {
    kind: MESSAGE_PART_KIND.ATTACHMENT,
    partIndex,
    state,
    attachmentId: "",
    attachmentKind: "document",
    mimeType: "application/pdf",
    originalName: null,
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

function createArtifactPart(
  partIndex: number,
  state: MessagePartEndState | null = null,
): UIArtifactPart {
  return {
    kind: MESSAGE_PART_KIND.ARTIFACT,
    partIndex,
    state,
    artifactType: null,
    contractId: null,
    producer: null,
    data: null,
    summaryText: null,
  };
}

function createMessagePart(
  partIndex: number,
  kind: UIMessagePart["kind"],
): UIMessagePart {
  switch (kind) {
    case MESSAGE_PART_KIND.TEXT:
      return createTextPart(partIndex);
    case MESSAGE_PART_KIND.ATTACHMENT:
      return createAttachmentPart(partIndex);
    case MESSAGE_PART_KIND.REASONING:
      return createReasoningPart(partIndex);
    case MESSAGE_PART_KIND.TOOL:
      return createToolPart(partIndex);
    case MESSAGE_PART_KIND.ARTIFACT:
      return createArtifactPart(partIndex);
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
    status: MESSAGE_STATUS.STREAMING,
    invokedCommands: [],
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

function upsertArtifactPart(
  message: UIMessage,
  partIndex: number,
  updater: (part: UIArtifactPart) => UIArtifactPart,
): UIMessage {
  const current = message.parts.find((part) => part.partIndex === partIndex);
  const base =
    current?.kind === MESSAGE_PART_KIND.ARTIFACT
      ? current
      : createArtifactPart(partIndex);

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
    case CHAT_ACTION_TYPE.HYDRATE_SESSION:
      return {
        ...state,
        sessionId: action.sessionId,
        status: action.status,
      };

    case CHAT_ACTION_TYPE.HYDRATE_MESSAGES:
      return {
        ...state,
        messages: action.messages,
      };

    case CHAT_ACTION_TYPE.PREPEND_HISTORY_PAGE: {
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

    case CHAT_ACTION_TYPE.USER_MESSAGE:
      return {
        ...state,
        requestError: null,
        messages: state.messages.some(
          (message) => message.messageId === action.message.messageId,
        )
          ? state.messages.map((message) =>
              message.messageId === action.message.messageId
                ? action.message
                : message,
            )
          : [...state.messages, action.message],
      };

    case CHAT_ACTION_TYPE.RESET:
      return {
        ...initialState,
      };

    case CHAT_ACTION_TYPE.SESSION_STATUS:
      return {
        ...state,
        sessionId: action.sessionId,
        status: action.status,
      };

    case CHAT_ACTION_TYPE.REQUEST_ERROR:
      return {
        ...state,
        requestError: action.error,
      };

    case CHAT_ACTION_TYPE.CLEAR_REQUEST_ERROR:
      return {
        ...state,
        requestError: null,
      };

    case CHAT_ACTION_TYPE.TRANSPORT_STATUS:
      return {
        ...state,
        transportStatus: action.status,
        transportError:
          action.status === CHAT_TRANSPORT_STATUS.CONNECTED
            ? null
            : action.error ?? state.transportError,
      };

    case CHAT_ACTION_TYPE.LOOP_START:
      return {
        ...state,
        currentTurnIndex: 0,
        loopEndReason: null,
        requestError: null,
      };

    case CHAT_ACTION_TYPE.LOOP_END:
      if (
        action.reason === LOOP_END_REASON.INTERRUPTED ||
        action.reason === LOOP_END_REASON.ERROR
      ) {
        const messages = [...state.messages];

        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          if (message.role !== MESSAGE_ROLE.ASSISTANT) {
            continue;
          }

          messages[index] = {
            ...message,
            isStreaming: false,
            status:
              action.reason === LOOP_END_REASON.INTERRUPTED
                ? MESSAGE_STATUS.INTERRUPTED
                : MESSAGE_STATUS.ERROR,
          };
          break;
        }

        return {
          ...state,
          loopEndReason: action.reason,
          messages,
        };
      }

      return {
        ...state,
        loopEndReason: action.reason,
      };

    case CHAT_ACTION_TYPE.TURN_START:
      return {
        ...state,
        currentTurnIndex: state.currentTurnIndex + 1,
      };

    case CHAT_ACTION_TYPE.MESSAGE_START:
      return upsertAssistantMessage(state, action.messageId, (message) => ({
        ...message,
        isStreaming: true,
        status: MESSAGE_STATUS.STREAMING,
      }));

    case CHAT_ACTION_TYPE.MESSAGE_END:
      return updateExistingMessage(state, action.messageId, (message) => ({
        ...message,
        isStreaming: false,
        status:
          message.status === MESSAGE_STATUS.STREAMING
            ? MESSAGE_STATUS.COMPLETED
            : message.status,
      }));

    case CHAT_ACTION_TYPE.PART_START:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        replaceOrAppendPart(
          message,
          createMessagePart(action.partIndex, action.kind),
        ),
      );

    case CHAT_ACTION_TYPE.PART_END:
      return upsertAssistantMessage(state, action.messageId, (message) => {
        const nextStatus =
          action.state === MESSAGE_PART_END_STATE.ERROR
            ? MESSAGE_STATUS.ERROR
            : action.state === MESSAGE_PART_END_STATE.INTERRUPTED &&
                message.status !== MESSAGE_STATUS.ERROR
              ? MESSAGE_STATUS.INTERRUPTED
              : message.status;

        switch (action.kind) {
          case MESSAGE_PART_KIND.TEXT:
            return {
              ...upsertTextPart(message, action.partIndex, (part) => ({
                ...part,
                state: action.state,
              })),
              status: nextStatus,
            };

          case MESSAGE_PART_KIND.ATTACHMENT:
            return {
              ...replaceOrAppendPart(
                message,
                createAttachmentPart(action.partIndex, action.state),
              ),
              status: nextStatus,
            };

          case MESSAGE_PART_KIND.REASONING:
            return {
              ...upsertReasoningPart(message, action.partIndex, (part) => ({
                ...part,
                state: action.state,
              })),
              status: nextStatus,
            };

          case MESSAGE_PART_KIND.TOOL:
            return {
              ...upsertToolPart(message, action.partIndex, (part) => ({
                ...part,
                state: action.state,
                status:
                  action.state === MESSAGE_PART_END_STATE.ERROR &&
                  part.status !== TOOL_CALL_STATUS.DONE
                    ? TOOL_CALL_STATUS.ERROR
                    : action.state === MESSAGE_PART_END_STATE.INTERRUPTED &&
                        part.status !== TOOL_CALL_STATUS.DONE
                      ? TOOL_CALL_STATUS.INTERRUPTED
                      : part.status,
              })),
              status: nextStatus,
            };

          case MESSAGE_PART_KIND.ARTIFACT:
            return {
              ...upsertArtifactPart(message, action.partIndex, (part) => ({
                ...part,
                state: action.state,
              })),
              status: nextStatus,
            };

          default:
            return assertNever(action.kind);
        }
      });

    case CHAT_ACTION_TYPE.TEXT_DELTA:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertTextPart(message, action.partIndex, (part) => ({
          ...part,
          text: part.text + action.text,
        })),
      );

    case CHAT_ACTION_TYPE.REASONING_DELTA:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertReasoningPart(message, action.partIndex, (part) => ({
          ...part,
          text: part.text + action.content,
        })),
      );

    case CHAT_ACTION_TYPE.ARTIFACT:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertArtifactPart(message, action.partIndex, (part) => ({
          ...part,
          artifactType: action.artifact.artifactType,
          contractId: action.artifact.contractId ?? null,
          producer: action.artifact.producer,
          data: action.artifact.data,
          summaryText: action.artifact.summaryText ?? null,
        })),
      );

    case CHAT_ACTION_TYPE.TOOL_START:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          toolName: action.toolName,
          input: action.input,
          status: TOOL_CALL_STATUS.PENDING,
        })),
      );

    case CHAT_ACTION_TYPE.TOOL_RUNNING:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          status: TOOL_CALL_STATUS.RUNNING,
        })),
      );

    case CHAT_ACTION_TYPE.TOOL_UPDATE:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          updates: [...part.updates, action.content],
        })),
      );

    case CHAT_ACTION_TYPE.TOOL_END:
      return upsertAssistantMessage(state, action.messageId, (message) =>
        upsertToolPart(message, action.partIndex, (part) => ({
          ...part,
          toolCallId: action.toolCallId,
          status:
            action.state === TOOL_END_STATE.ERROR
              ? TOOL_CALL_STATUS.ERROR
              : action.state === TOOL_END_STATE.INTERRUPTED
                ? TOOL_CALL_STATUS.INTERRUPTED
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
