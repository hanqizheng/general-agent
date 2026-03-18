"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { useChat } from "@/components/providers/chat-provider";

import { InputArea } from "./input-area";
import { MessageList } from "./message-list";

export function ChatContainer() {
  const { state, sendMessage, loadOlder, hasMore, isLoadingMore } = useChat();

  const messageCount = state.messages.length;
  const partCount = state.messages.reduce(
    (total, message) => total + message.parts.length,
    0,
  );
  const toolCount = state.messages.reduce(
    (total, message) =>
      total + message.parts.filter((part) => part.kind === "tool").length,
    0,
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(240,206,146,0.35),_transparent_30%),linear-gradient(180deg,_#f6f0e5_0%,_#efe6d7_40%,_#ebe2d5_100%)] px-4 py-4 text-stone-950 lg:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1500px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Sidebar
          currentTurnIndex={state.currentTurnIndex}
          loopEndReason={state.loopEndReason}
          messageCount={messageCount}
          partCount={partCount}
          status={state.status}
          toolCount={toolCount}
        />

        <section className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-stone-900/10 bg-white/72 shadow-[0_24px_80px_rgba(54,40,18,0.12)] backdrop-blur">
          <Header
            currentTurnIndex={state.currentTurnIndex}
            loopEndReason={state.loopEndReason}
            messageCount={messageCount}
            sessionId={state.sessionId}
            status={state.status}
          />

          {state.error ? (
            <div className="mx-4 mt-4 rounded-2xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-800 lg:mx-6">
              {state.error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 px-4 pb-4 pt-4 lg:px-6">
            <MessageList
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              messages={state.messages}
              onLoadOlder={loadOlder}
              status={state.status}
            />
          </div>

          <div className="border-t border-stone-900/8 px-4 py-4 lg:px-6">
            <InputArea busy={state.status === "busy"} onSend={sendMessage} />
          </div>
        </section>
      </div>
    </div>
  );
}
