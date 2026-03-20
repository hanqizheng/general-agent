"use client";

import { useChatShell } from "@/components/layout/chat-shell";
import { useChat } from "@/components/providers/chat-provider";
import { useSessionContext } from "@/components/providers/session-provider";
import { SESSION_STATUS } from "@/lib/constants";

import { InputArea } from "./input-area";
import { MessageList } from "./message-list";

export function ChatContainer() {
  const {
    state,
    sendMessage,
    abort,
    loadOlder,
    hasMore,
    isLoadingMore,
    isStopping,
  } = useChat();
  const { session } = useSessionContext();
  const { desktopShellPadding } = useChatShell();

  return (
    <>
      <div
        className={`flex min-h-0 flex-1 flex-col px-3 pt-3 transition-[padding] duration-300 sm:px-4 sm:pt-4 lg:pt-5 ${desktopShellPadding}`}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
          {state.requestError ? (
            <div className="mx-auto mb-3 w-full max-w-4xl rounded-[22px] bg-rose-100/90 px-4 py-3 text-sm text-rose-700 shadow-[0_12px_32px_rgba(244,63,94,0.10)]">
              {state.requestError}
            </div>
          ) : null}

          {state.transportError ? (
            <div className="mx-auto mb-3 w-full max-w-4xl rounded-[22px] bg-amber-100/90 px-4 py-3 text-sm text-amber-800 shadow-[0_12px_32px_rgba(245,158,11,0.10)]">
              {state.transportError}
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
            <MessageList
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              messages={state.messages}
              onLoadOlder={loadOlder}
            />
          </div>
        </div>
      </div>

      <div
        className={`px-3 pb-3 pt-3 transition-[padding] duration-300 sm:px-4 sm:pb-4 lg:pb-5 ${desktopShellPadding}`}
      >
        <InputArea
          busy={session.status === SESSION_STATUS.BUSY}
          isStopping={isStopping}
          onAbort={abort}
          onSend={sendMessage}
        />
      </div>
    </>
  );
}
