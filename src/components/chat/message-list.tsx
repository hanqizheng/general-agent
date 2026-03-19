"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionStatus, UIMessage } from "@/lib/chat-types";

import { MessageItem } from "./message-item";

interface MessageListProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  messages: UIMessage[];
  onLoadOlder: () => void | Promise<void>;
  status: SessionStatus;
}

export function MessageList({
  hasMore,
  isLoadingMore,
  messages,
  onLoadOlder,
  status,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const liveSignature = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    const lastPart = lastMessage?.parts[lastMessage.parts.length - 1];

    return [
      messages.length,
      lastMessage?.messageId ?? "",
      lastMessage?.status ?? "",
      lastPart?.partIndex ?? -1,
      lastPart?.state ?? "open",
      status,
    ].join(":");
  }, [messages, status]);

  useEffect(() => {
    if (!stickToBottom) {
      return;
    }

    bottomRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [liveSignature, stickToBottom]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;

    setStickToBottom(distanceFromBottom < 96);
  };

  if (messages.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-xl rounded-[30px] bg-white/45 px-8 py-10 text-center shadow-[0_18px_60px_rgba(24,24,27,0.05)] backdrop-blur-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
            Start a conversation
          </h2>
          <p className="mt-3 text-sm leading-7 text-stone-500">
            Ask the assistant to inspect the project, explain a file, or help you
            implement a change.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto pr-1"
      onScroll={handleScroll}
      ref={scrollRef}
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end gap-6 pb-4 pt-6 lg:pt-8">
        {hasMore ? (
          <div className="flex justify-center">
            <button
              className="rounded-[16px] bg-white/75 px-4 py-2 text-xs font-medium text-stone-700 shadow-[0_10px_30px_rgba(24,24,27,0.06)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoadingMore}
              onClick={() => {
                void onLoadOlder();
              }}
              type="button"
            >
              {isLoadingMore ? "Loading..." : "Load older messages"}
            </button>
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageItem key={message.messageId} message={message} />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
