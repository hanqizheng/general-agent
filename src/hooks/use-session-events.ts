"use client";

import { useEffect } from "react";

import {
  CHAT_ACTION_TYPE,
  CHAT_TRANSPORT_STATUS,
} from "@/lib/chat-constants";
import type {
  ChatAction,
  LoopEndReason,
  MessagePartEndState,
  MessagePartKind,
  SessionStatus,
  ToolEndState,
} from "@/lib/chat-types";
import { MESSAGE_ROLE, SESSION_EVENT_TYPE, SESSION_STATUS } from "@/lib/constants";

interface SessionEventUpdate {
  sessionId: string;
  status?: SessionStatus;
  title?: string;
  activeRunId?: string | null;
}

interface UseSessionEventsOptions {
  sessionId: string;
  dispatch: React.Dispatch<ChatAction>;
  onReconnect: () => Promise<void>;
  onSessionUpdate: (update: SessionEventUpdate) => void;
}

export function useSessionEvents({
  sessionId,
  dispatch,
  onReconnect,
  onSessionUpdate,
}: UseSessionEventsOptions) {
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;

    const scheduleReconnect = (delayMs: number) => {
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/events`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Event stream failed: ${response.status}`);
        }

        dispatch({
          type: CHAT_ACTION_TYPE.TRANSPORT_STATUS,
          status: CHAT_TRANSPORT_STATUS.CONNECTED,
          error: null,
        });

        await readSSEStream(response.body, dispatch, onSessionUpdate);

        if (!closedByCleanup) {
          dispatch({
            type: CHAT_ACTION_TYPE.TRANSPORT_STATUS,
            status: CHAT_TRANSPORT_STATUS.RECONNECTING,
            error: "Live updates disconnected. Reconnecting...",
          });
          await onReconnect().catch(() => undefined);
          scheduleReconnect(750);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to connect live updates";

        dispatch({
          type: CHAT_ACTION_TYPE.TRANSPORT_STATUS,
          status: CHAT_TRANSPORT_STATUS.RECONNECTING,
          error: `Live updates disconnected. ${message}`,
        });
        await onReconnect().catch(() => undefined);
        scheduleReconnect(1_000);
      }
    };

    void connect();

    return () => {
      closedByCleanup = true;
      controller.abort();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [dispatch, onReconnect, onSessionUpdate, sessionId]);
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  dispatch: React.Dispatch<ChatAction>,
  onSessionUpdate: (update: SessionEventUpdate) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.trim()) {
          continue;
        }

        const parsed = parseSSEEvent(chunk);
        if (parsed) {
          handleSessionEvent(parsed, onSessionUpdate);
          dispatchSSEEvent(parsed, dispatch);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEEvent(raw: string) {
  let event = "";
  let data = "";

  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      data = line.slice(6);
    }
  }

  if (!event || !data) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(data) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function handleSessionEvent(
  sseEvent: { event: string; data: Record<string, unknown> },
  onSessionUpdate: (update: SessionEventUpdate) => void,
) {
  const { event, data } = sseEvent;

  switch (event) {
    case SESSION_EVENT_TYPE.STATUS:
      onSessionUpdate({
        sessionId: data.sessionId as string,
        status: data.status as SessionStatus,
        activeRunId:
          data.status === SESSION_STATUS.BUSY ? undefined : null,
      });
      break;

    case SESSION_EVENT_TYPE.PRESENTATION:
      onSessionUpdate({
        sessionId: data.sessionId as string,
        title: data.title as string,
      });
      break;

    default:
      break;
  }
}

function dispatchSSEEvent(
  sseEvent: { event: string; data: Record<string, unknown> },
  dispatch: React.Dispatch<ChatAction>,
) {
  const { event, data } = sseEvent;

  switch (event) {
    case SESSION_EVENT_TYPE.STATUS:
      dispatch({
        type: CHAT_ACTION_TYPE.SESSION_STATUS,
        sessionId: data.sessionId as string,
        status: data.status as SessionStatus,
      });
      break;

    case SESSION_EVENT_TYPE.ERROR:
      dispatch({
        type: CHAT_ACTION_TYPE.REQUEST_ERROR,
        error: (data.error as { message: string }).message,
      });
      break;

    case "loop.start":
      dispatch({ type: CHAT_ACTION_TYPE.LOOP_START });
      break;

    case "loop.end":
      dispatch({
        type: CHAT_ACTION_TYPE.LOOP_END,
        reason: data.reason as LoopEndReason,
      });
      break;

    case "turn.start":
      dispatch({
        type: CHAT_ACTION_TYPE.TURN_START,
        turnId: data.turnId as string,
      });
      break;

    case "message.start":
      if (data.role === MESSAGE_ROLE.ASSISTANT) {
        dispatch({
          type: CHAT_ACTION_TYPE.MESSAGE_START,
          messageId: data.messageId as string,
        });
      }
      break;

    case "message.end":
      dispatch({
        type: CHAT_ACTION_TYPE.MESSAGE_END,
        messageId: data.messageId as string,
      });
      break;

    case "message.part.start":
      dispatch({
        type: CHAT_ACTION_TYPE.PART_START,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        kind: data.kind as MessagePartKind,
      });
      break;

    case "message.part.end":
      dispatch({
        type: CHAT_ACTION_TYPE.PART_END,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        kind: data.kind as MessagePartKind,
        state: data.state as MessagePartEndState,
      });
      break;

    case "message.text.delta":
      dispatch({
        type: CHAT_ACTION_TYPE.TEXT_DELTA,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        text: data.text as string,
      });
      break;

    case "message.reasoning.delta":
      dispatch({
        type: CHAT_ACTION_TYPE.REASONING_DELTA,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        content: data.content as string,
      });
      break;

    case "message.tool.start":
      dispatch({
        type: CHAT_ACTION_TYPE.TOOL_START,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
        toolName: data.toolName as string,
        input: data.input as Record<string, unknown>,
      });
      break;

    case "message.tool.running":
      dispatch({
        type: CHAT_ACTION_TYPE.TOOL_RUNNING,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
      });
      break;

    case "message.tool.update":
      dispatch({
        type: CHAT_ACTION_TYPE.TOOL_UPDATE,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
        content: data.content as string,
      });
      break;

    case "message.tool.end":
      dispatch({
        type: CHAT_ACTION_TYPE.TOOL_END,
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
        state: data.state as ToolEndState,
        output: data.output as string,
        error: data.error as string | undefined,
        durationMs: data.durationMs as number,
      });
      break;

    default:
      break;
  }
}
