"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { useChatState } from "@/hooks/use-chat-state";
import { consumePendingMessage } from "@/hooks/use-initial-message";
import { useMessages } from "@/hooks/use-messages";
import { useSession } from "@/hooks/use-session";
import { useSessionEvents } from "@/hooks/use-session-events";
import { CHAT_ACTION_TYPE } from "@/lib/chat-constants";
import { buildInitialChatState } from "@/lib/chat-mappers";
import type { ChatState, SessionStatus } from "@/lib/chat-types";
import { SESSION_STATUS } from "@/lib/constants";
import type {
  SendMessageInput,
  SessionMessagesPageDto,
} from "@/lib/session-dto";
import { useSessionContext } from "./session-provider";

interface ChatContextValue {
  state: ChatState;
  sendMessage: (input: SendMessageInput) => Promise<void>;
  abort: () => Promise<void>;
  loadOlder: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  isStopping: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({
  children,
  initialMessagesPage,
}: {
  children: React.ReactNode;
  initialMessagesPage: SessionMessagesPageDto;
}) {
  const { session, replaceSession, patchSession } = useSessionContext();
  const [abortRequested, setAbortRequested] = useState(false);
  const previousStatusRef = useRef<SessionStatus>(session.status);
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
    onSessionChange: replaceSession,
  });

  useEffect(() => {
    setPaginationState(initialMessagesPage);
  }, [initialMessagesPage, setPaginationState]);

  useEffect(() => {
    if (
      previousStatusRef.current === SESSION_STATUS.BUSY &&
      state.status !== SESSION_STATUS.BUSY
    ) {
      const timer = setTimeout(() => {
        void refreshSession()
          .then((nextSession) => {
            replaceSession(nextSession);
          })
          .catch(() => undefined);
      }, 900);

      previousStatusRef.current = state.status;
      return () => {
        clearTimeout(timer);
      };
    }

    previousStatusRef.current = state.status;

  }, [refreshSession, replaceSession, state.status]);

  const hydrateFromServer = useCallback(async () => {
    await Promise.all([
      refreshSession().then((nextSession) => {
        replaceSession(nextSession);
        dispatch({
          type: CHAT_ACTION_TYPE.HYDRATE_SESSION,
          sessionId: nextSession.id,
          status: nextSession.status,
        });
      }),
      refreshLatest(),
    ]);
  }, [dispatch, refreshLatest, refreshSession, replaceSession]);

  const handleSessionUpdate = useCallback(
    (update: {
      sessionId: string;
      status?: SessionStatus;
      title?: string;
      activeRunId?: string | null;
    }) => {
      patchSession({
        id: update.sessionId,
        ...(update.status ? { status: update.status } : {}),
        ...(update.title ? { title: update.title } : {}),
        ...(update.activeRunId !== undefined
          ? { activeRunId: update.activeRunId }
          : {}),
      });
    },
    [patchSession],
  );

  useSessionEvents({
    sessionId: session.id,
    dispatch,
    onReconnect: hydrateFromServer,
    onSessionUpdate: handleSessionUpdate,
  });

  const sendMessage = useCallback(
    async (input: SendMessageInput) => {
      if (state.status === SESSION_STATUS.BUSY) {
        return;
      }

      dispatch({ type: CHAT_ACTION_TYPE.CLEAR_REQUEST_ERROR });

      try {
        setAbortRequested(false);
        await sendMessageRequest(input);
      } catch (error: unknown) {
        dispatch({
          type: CHAT_ACTION_TYPE.REQUEST_ERROR,
          error:
            error instanceof Error ? error.message : "Failed to send message",
        });
        throw error;
      }
    },
    [dispatch, sendMessageRequest, state.status],
  );

  const initialMessageSentRef = useRef(false);
  const sendPendingMessage = useEffectEvent((input: SendMessageInput) => {
    void sendMessage(input);
  });

  useEffect(() => {
    if (initialMessageSentRef.current) return;
    const input = consumePendingMessage(session.id);
    if (input) {
      initialMessageSentRef.current = true;
      queueMicrotask(() => {
        sendPendingMessage(input);
      });
    }
  }, [session.id]);

  const abort = useCallback(async () => {
    dispatch({ type: CHAT_ACTION_TYPE.CLEAR_REQUEST_ERROR });

    try {
      setAbortRequested(true);
      await abortSession();
    } catch (error: unknown) {
      setAbortRequested(false);
      dispatch({
        type: CHAT_ACTION_TYPE.REQUEST_ERROR,
        error:
          error instanceof Error ? error.message : "Failed to abort session",
      });
    }
  }, [abortSession, dispatch]);

  const loadOlder = useCallback(async () => {
    dispatch({ type: CHAT_ACTION_TYPE.CLEAR_REQUEST_ERROR });

    try {
      await loadOlderMessages();
    } catch (error: unknown) {
      dispatch({
        type: CHAT_ACTION_TYPE.REQUEST_ERROR,
        error:
          error instanceof Error ? error.message : "Failed to load messages",
      });
    }
  }, [dispatch, loadOlderMessages]);

  const isStopping =
    abortRequested && session.status === SESSION_STATUS.BUSY;

  return (
    <ChatContext.Provider
      value={{
        state,
        sendMessage,
        abort,
        loadOlder,
        hasMore,
        isLoadingMore,
        isStopping,
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
