"use client";

import { useCallback, useRef } from "react";

import { MESSAGE_ROLE } from "@/lib/constants";
import type {
  ChatAction,
  LoopEndReason,
  MessagePartEndState,
  MessagePartKind,
  SessionStatus,
  ToolEndState,
} from "@/lib/chat-types";

interface UseAgentSSEOptions {
  dispatch: React.Dispatch<ChatAction>;
}

export function useAgentSSE({ dispatch }: UseAgentSSEOptions) {
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string) => {
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          dispatch({
            type: "session_error",
            error: errorText || `Request failed: ${response.status}`,
          });
          return;
        }

        if (!response.body) {
          dispatch({
            type: "session_error",
            error: "Response body is empty",
          });
          return;
        }

        await readSSEStream(response.body, dispatch);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        dispatch({
          type: "session_error",
          error: error instanceof Error ? error.message : "Unknown Error",
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [dispatch],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { send, abort };
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

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part.trim()) {
          continue;
        }

        const parsed = parseSSEEvent(part);

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
  }
}
