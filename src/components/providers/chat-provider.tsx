"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { useChatState } from "@/hooks/use-chat-state";
import { useMessages } from "@/hooks/use-messages";
import { useSession } from "@/hooks/use-session";
import { useSessionEvents } from "@/hooks/use-session-events";
import { buildInitialChatState } from "@/lib/chat-mappers";
import type { ChatState } from "@/lib/chat-types";
import type { SessionMessagesPageDto } from "@/lib/session-dto";
import { useSessionContext } from "./session-provider";

interface ChatContextValue {
  state: ChatState;
  sendMessage: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  loadOlder: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({
  children,
  initialMessagesPage,
}: {
  children: React.ReactNode;
  initialMessagesPage: SessionMessagesPageDto;
}) {
  const { session, setSession } = useSessionContext();
  const seedState = useMemo(
    () => buildInitialChatState(session, initialMessagesPage),
    [initialMessagesPage, session],
  );
  const { state, dispatch } = useChatState(seedState);
  const { refresh: refreshSession, abort: abortSession } = useSession(
    session.id,
  );
  const {
    sendMessage: sendMessageRequest,
    refreshLatest,
    loadOlder: loadOlderMessages,
    hasMore,
    isLoadingMore,
    setPaginationState,
  } = useMessages({
    sessionId: session.id,
    dispatch,
    onSessionChange: setSession,
  });

  useEffect(() => {
    setPaginationState(initialMessagesPage);
  }, [initialMessagesPage, setPaginationState]);

  useEffect(() => {
    setSession((current) => ({
      ...current,
      status: state.status,
    }));
  }, [setSession, state.status]);

  const hydrateFromServer = useCallback(async () => {
    await Promise.all([
      refreshSession().then((nextSession) => {
        setSession(nextSession);
        dispatch({
          type: "hydrate_session",
          sessionId: nextSession.id,
          status: nextSession.status,
        });
      }),
      refreshLatest(),
    ]);
  }, [dispatch, refreshLatest, refreshSession, setSession]);

  useSessionEvents({
    sessionId: session.id,
    dispatch,
    onReconnect: hydrateFromServer,
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (state.status === "busy") {
        return;
      }

      try {
        await sendMessageRequest(text);
      } catch (error: unknown) {
        dispatch({
          type: "session_error",
          error:
            error instanceof Error ? error.message : "Failed to send message",
        });
      }
    },
    [dispatch, sendMessageRequest, state.status],
  );

  const abort = useCallback(async () => {
    try {
      await abortSession();
    } catch (error: unknown) {
      dispatch({
        type: "session_error",
        error:
          error instanceof Error ? error.message : "Failed to abort session",
      });
    }
  }, [abortSession, dispatch]);

  const loadOlder = useCallback(async () => {
    try {
      await loadOlderMessages();
    } catch (error: unknown) {
      dispatch({
        type: "session_error",
        error:
          error instanceof Error ? error.message : "Failed to load messages",
      });
    }
  }, [dispatch, loadOlderMessages]);

  return (
    <ChatContext.Provider
      value={{
        state,
        sendMessage,
        abort,
        loadOlder,
        hasMore,
        isLoadingMore,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within ChatProvider");
  }

  return ctx;
}
