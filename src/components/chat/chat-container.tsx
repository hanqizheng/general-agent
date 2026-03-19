"use client";

import { useState } from "react";

import { SessionSidebar } from "@/components/layout/session-sidebar";
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
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const desktopShellPadding = isDesktopSidebarOpen
    ? "lg:pl-[336px] lg:pr-8"
    : "lg:px-8";

  return (
    <div className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.62),_transparent_28%),linear-gradient(180deg,_#f3efe8_0%,_#ece8e0_100%)] text-stone-950">
      <div className="flex h-full min-h-0">
        <SessionSidebar
          currentSession={session}
          isDesktopOpen={isDesktopSidebarOpen}
          onDesktopOpenChange={setIsDesktopSidebarOpen}
          isMobileOpen={isMobileSidebarOpen}
          onMobileOpenChange={setIsMobileSidebarOpen}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <div
            className={`flex min-h-0 flex-1 flex-col px-4 pt-4 transition-[padding] duration-300 lg:pt-5 ${desktopShellPadding}`}
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
                  status={state.status}
                />
              </div>
            </div>
          </div>

          <div
            className={`px-4 pb-4 pt-3 transition-[padding] duration-300 lg:pb-5 ${desktopShellPadding}`}
          >
            <InputArea
              busy={session.status === SESSION_STATUS.BUSY}
              isStopping={isStopping}
              onAbort={abort}
              onSend={sendMessage}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
