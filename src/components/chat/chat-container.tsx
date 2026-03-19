"use client";

import { useState } from "react";

import { SessionSidebar } from "@/components/layout/session-sidebar";
import { useChat } from "@/components/providers/chat-provider";
import { useSessionContext } from "@/components/providers/session-provider";
import type { SessionStatus } from "@/lib/chat-types";
import { SESSION_STATUS } from "@/lib/constants";

import { InputArea } from "./input-area";
import { MessageList } from "./message-list";

function getStatusLabel(status: SessionStatus) {
  switch (status) {
    case SESSION_STATUS.BUSY:
      return "Running";
    case SESSION_STATUS.ERROR:
      return "Error";
    case SESSION_STATUS.IDLE:
    default:
      return "Ready";
  }
}

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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="h-dvh overflow-hidden bg-stone-100 text-stone-950">
      <div className="flex h-full min-h-0">
        <SessionSidebar
          currentSession={session}
          isMobileOpen={isMobileSidebarOpen}
          onMobileOpenChange={setIsMobileSidebarOpen}
        />

        <section className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,_#fcfcfa_0%,_#f7f5f1_100%)]">
          <header className="border-b border-stone-200 bg-white/80 px-4 py-4 backdrop-blur lg:px-8">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 lg:hidden"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  type="button"
                >
                  Chats
                </button>

                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-stone-950">
                    {session.title}
                  </h1>
                  <p className="truncate text-sm text-stone-500">
                    {session.workspaceRoot}
                  </p>
                </div>
              </div>

              <div className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600">
                {getStatusLabel(session.status)}
              </div>
            </div>
          </header>

          {state.requestError ? (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:px-8">
              <div className="mx-auto max-w-4xl">{state.requestError}</div>
            </div>
          ) : null}

          {state.transportError ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 lg:px-8">
              <div className="mx-auto max-w-4xl">{state.transportError}</div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden px-4 lg:px-8">
            <MessageList
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              messages={state.messages}
              onLoadOlder={loadOlder}
              status={state.status}
            />
          </div>

          <div className="border-t border-stone-200 bg-white/80 px-4 py-4 backdrop-blur lg:px-8">
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
