"use client";

import { useCallback, useState } from "react";

import { mapMessagesPageToUiMessages } from "@/lib/chat-mappers";
import type { ChatAction } from "@/lib/chat-types";
import type {
  SessionDetailDto,
  SessionMessagesPageDto,
  StartRunResponseDto,
} from "@/lib/session-dto";

interface UseMessagesOptions {
  sessionId: string;
  dispatch: React.Dispatch<ChatAction>;
  onSessionChange: (session: SessionDetailDto) => void;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function useMessages({
  sessionId,
  dispatch,
  onSessionChange,
}: UseMessagesOptions) {
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(
    null,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const hydratePage = useCallback(
    (page: SessionMessagesPageDto, mode: "replace" | "prepend" = "replace") => {
      const messages = mapMessagesPageToUiMessages(page);
      dispatch({
        type: mode === "replace" ? "hydrate_messages" : "prepend_history_page",
        messages,
      });
      setHasMore(page.hasMore);
      setNextBeforeSequence(page.nextBeforeSequence);
    },
    [dispatch],
  );

  const refreshLatest = useCallback(async () => {
    const response = await fetch(`/api/sessions/${sessionId}/messages`, {
      cache: "no-store",
    });

    const page = await parseJsonResponse<SessionMessagesPageDto>(response);
    hydratePage(page, "replace");
    return page;
  }, [hydratePage, sessionId]);

  const loadOlder = useCallback(async () => {
    if (nextBeforeSequence === null || isLoadingMore) {
      return null;
    }

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/messages?beforeSequence=${nextBeforeSequence}&limit=50`,
        {
          cache: "no-store",
        },
      );

      const page = await parseJsonResponse<SessionMessagesPageDto>(response);
      hydratePage(page, "prepend");
      return page;
    } finally {
      setIsLoadingMore(false);
    }
  }, [hydratePage, isLoadingMore, nextBeforeSequence, sessionId]);

  const setPaginationState = useCallback((page: SessionMessagesPageDto) => {
    setHasMore(page.hasMore);
    setNextBeforeSequence(page.nextBeforeSequence);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const payload = await parseJsonResponse<StartRunResponseDto>(response);
      onSessionChange(payload.session);
      dispatch({
        type: "session_status",
        sessionId: payload.session.id,
        status: payload.session.status,
      });
      dispatch({
        type: "user_message",
        messageId: payload.userMessage.id,
        text,
      });

      return payload;
    },
    [dispatch, onSessionChange, sessionId],
  );

  return {
    sendMessage,
    refreshLatest,
    loadOlder,
    hydratePage,
    hasMore,
    nextBeforeSequence,
    isLoadingMore,
    setPaginationState,
  };
}
