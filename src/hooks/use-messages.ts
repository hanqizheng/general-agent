"use client";

import { useCallback, useState } from "react";

import { CHAT_ACTION_TYPE } from "@/lib/chat-constants";
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
    let parsedMessage = "";
    try {
      const parsed = JSON.parse(errorText) as {
        error?: string;
        message?: string;
      };
      parsedMessage = parsed.message || parsed.error || "";
    } catch {
      parsedMessage = "";
    }
    throw new Error(parsedMessage || errorText || `Request failed: ${response.status}`);
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
        type:
          mode === "replace"
            ? CHAT_ACTION_TYPE.HYDRATE_MESSAGES
            : CHAT_ACTION_TYPE.PREPEND_HISTORY_PAGE,
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
        type: CHAT_ACTION_TYPE.SESSION_STATUS,
        sessionId: payload.session.id,
        status: payload.session.status,
      });
      dispatch({
        type: CHAT_ACTION_TYPE.USER_MESSAGE,
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
