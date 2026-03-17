"use client";

import { createContext, useCallback, useContext } from "react";

import type { ChatState } from "@/lib/chat-types";
import { useChatState } from "@/hooks/use-chat-state";
import { useAgentSSE } from "@/hooks/use-agent-sse";

interface ChatContextValue {
  state: ChatState;
  sendMessage: (text: string) => void;
  abort: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useChatState();
  const { send, abort } = useAgentSSE({ dispatch });

  const sendMessage = useCallback(
    (text: string) => {
      if (state.status === "busy") {
        return;
      }

      dispatch({
        type: "user_message",
        messageId: `m_local_${crypto.randomUUID().slice(0, 8)}`,
        text,
      });

      send(text);
    },
    [state.status, dispatch, send],
  );

  return (
    <ChatContext.Provider value={{ state, sendMessage, abort }}>
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
