"use client";

import { useEffect } from "react";

import type {
  ChatAction,
  LoopEndReason,
  MessagePartEndState,
  MessagePartKind,
  SessionStatus,
  ToolEndState,
} from "@/lib/chat-types";
import { MESSAGE_ROLE } from "@/lib/constants";

interface UseSessionEventsOptions {
  sessionId: string;
  dispatch: React.Dispatch<ChatAction>;
  onReconnect: () => Promise<void>;
}

export function useSessionEvents({
  sessionId,
  dispatch,
  onReconnect,
}: UseSessionEventsOptions) {
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;

    const connect = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/events`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Event stream failed: ${response.status}`);
        }

        await readSSEStream(response.body, dispatch);

        if (!closedByCleanup) {
          await onReconnect();
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 750);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        dispatch({
          type: "session_error",
          error:
            error instanceof Error ? error.message : "Failed to connect stream",
        });
        await onReconnect().catch(() => undefined);
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 1_000);
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
  }, [dispatch, onReconnect, sessionId]);
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  dispatch: React.Dispatch<ChatAction>,
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

function dispatchSSEEvent(
  sseEvent: { event: string; data: Record<string, unknown> },
  dispatch: React.Dispatch<ChatAction>,
) {
  const { event, data } = sseEvent;

  switch (event) {
    case "session.status":
      dispatch({
        type: "session_status",
        sessionId: data.sessionId as string,
        status: data.status as SessionStatus,
      });
      break;

    case "session.error":
      dispatch({
        type: "session_error",
        error: (data.error as { message: string }).message,
      });
      break;

    case "loop.start":
      dispatch({ type: "loop_start" });
      break;

    case "loop.end":
      dispatch({
        type: "loop_end",
        reason: data.reason as LoopEndReason,
      });
      break;

    case "turn.start":
      dispatch({
        type: "turn_start",
        turnId: data.turnId as string,
      });
      break;

    case "message.start":
      if (data.role === MESSAGE_ROLE.ASSISTANT) {
        dispatch({
          type: "message_start",
          messageId: data.messageId as string,
        });
      }
      break;

    case "message.end":
      dispatch({
        type: "message_end",
        messageId: data.messageId as string,
      });
      break;

    case "message.part.start":
      dispatch({
        type: "part_start",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        kind: data.kind as MessagePartKind,
      });
      break;

    case "message.part.end":
      dispatch({
        type: "part_end",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        kind: data.kind as MessagePartKind,
        state: data.state as MessagePartEndState,
      });
      break;

    case "message.text.delta":
      dispatch({
        type: "text_delta",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        text: data.text as string,
      });
      break;

    case "message.reasoning.delta":
      dispatch({
        type: "reasoning_delta",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        content: data.content as string,
      });
      break;

    case "message.tool.start":
      dispatch({
        type: "tool_start",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
        toolName: data.toolName as string,
        input: data.input as Record<string, unknown>,
      });
      break;

    case "message.tool.running":
      dispatch({
        type: "tool_running",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
      });
      break;

    case "message.tool.update":
      dispatch({
        type: "tool_update",
        messageId: data.messageId as string,
        partIndex: data.partIndex as number,
        toolCallId: data.toolCallId as string,
        content: data.content as string,
      });
      break;

    case "message.tool.end":
      dispatch({
        type: "tool_end",
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
