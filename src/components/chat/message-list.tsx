"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionStatus, UIMessage } from "@/lib/chat-types";

import { MessageItem } from "./message-item";

interface MessageListProps {
  messages: UIMessage[];
  status: SessionStatus;
}

export function MessageList({ messages, status }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const liveSignature = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    const lastPart = lastMessage?.parts[lastMessage.parts.length - 1];

    return JSON.stringify({
      messageCount: messages.length,
      lastMessageId: lastMessage?.messageId ?? "",
      partCount: lastMessage?.parts.length ?? 0,
      lastPartIndex: lastPart?.partIndex ?? -1,
      lastPartState: lastPart?.state ?? null,
      status,
    });
  }, [messages, status]);

  useEffect(() => {
    if (!stickToBottom) {
      return;
    }

    bottomRef.current?.scrollIntoView({
      behavior: messages.length > 0 ? "smooth" : "auto",
      block: "end",
    });
  }, [liveSignature, messages.length, stickToBottom]);

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
        <div className="max-w-4xl space-y-6 rounded-[32px] border border-stone-900/8 bg-white/72 px-6 py-8 shadow-[0_20px_60px_rgba(48,36,22,0.08)]">
          <div className="inline-flex rounded-full border border-stone-900/10 bg-stone-900/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-600">
            {"Session -> Message -> Part"}
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-stone-950">
              Live runtime view for your agent
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              This UI is driven by SSE events. Each assistant response is
              projected into ordered parts, so reasoning, text, and tool calls
              can render in the same message without flattening away the
              sequence.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {[
              {
                title: "Inspect architecture",
                body: "Read the README and summarize what the current agent runtime already supports.",
              },
              {
                title: "Trace the runtime",
                body: "Explain how session, message, and part events are emitted during one turn.",
              },
              {
                title: "Find next work",
                body: "Search the codebase for UI TODOs, missing session persistence, or placeholders.",
              },
            ].map((item) => (
              <div
                className="rounded-[24px] border border-stone-900/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,244,238,0.96))] p-4"
                key={item.title}
              >
                <h3 className="text-sm font-semibold text-stone-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        className="h-full overflow-y-auto pr-2"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        <div className="space-y-6 pb-10">
          {messages.map((message) => (
            <MessageItem key={message.messageId} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {!stickToBottom ? (
        <button
          className="absolute bottom-4 right-4 rounded-full border border-stone-900/10 bg-white/92 px-4 py-2 text-xs font-medium text-stone-700 shadow-[0_14px_30px_rgba(48,36,22,0.1)] transition hover:bg-stone-50"
          onClick={() =>
            bottomRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "end",
            })
          }
          type="button"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
