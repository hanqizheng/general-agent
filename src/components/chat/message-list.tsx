"use client";

import { useEffect, useRef, useState } from "react";

import type { UIMessage, UIMessagePart, UIToolPart } from "@/lib/chat-types";
import { MESSAGE_PART_KIND, MESSAGE_ROLE } from "@/lib/constants";

import { MessageItem } from "./message-item";

interface MessageListProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  messages: UIMessage[];
  onLoadOlder: () => void | Promise<void>;
}

interface MessageListEntry {
  id: string;
  message: UIMessage;
  toolContinuationParts: UIToolPart[];
}

function isVisibleTextPart(part: UIMessagePart) {
  return part.kind === MESSAGE_PART_KIND.TEXT && part.text.trim().length > 0;
}

function isToolOnlyAssistantMessage(message: UIMessage) {
  if (message.role !== MESSAGE_ROLE.ASSISTANT) {
    return false;
  }

  let hasTool = false;

  for (const part of message.parts) {
    if (part.kind === MESSAGE_PART_KIND.TOOL) {
      hasTool = true;
      continue;
    }

    if (isVisibleTextPart(part)) {
      return false;
    }

    if (part.kind !== MESSAGE_PART_KIND.TEXT) {
      return false;
    }
  }

  return hasTool;
}

function collectToolParts(message: UIMessage) {
  return message.parts.filter(
    (part): part is UIToolPart => part.kind === MESSAGE_PART_KIND.TOOL,
  );
}

function hasTrailingToolSequence(message: UIMessage) {
  if (message.role !== MESSAGE_ROLE.ASSISTANT || message.parts.length === 0) {
    return false;
  }

  return message.parts[message.parts.length - 1]?.kind === MESSAGE_PART_KIND.TOOL;
}

function buildEntries(messages: UIMessage[]): MessageListEntry[] {
  const entries: MessageListEntry[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index] as UIMessage;

    if (!hasTrailingToolSequence(message)) {
      entries.push({
        id: message.messageId,
        message,
        toolContinuationParts: [],
      });
      continue;
    }

    const toolContinuationParts: UIToolPart[] = [];

    while (
      index + 1 < messages.length &&
      isToolOnlyAssistantMessage(messages[index + 1] as UIMessage)
    ) {
      index += 1;
      toolContinuationParts.push(
        ...collectToolParts(messages[index] as UIMessage),
      );
    }

    entries.push({
      id: message.messageId,
      message,
      toolContinuationParts,
    });
  }

  return entries;
}

export function MessageList({
  hasMore,
  isLoadingMore,
  messages,
  onLoadOlder,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const entries = buildEntries(messages);

  useEffect(() => {
    if (!stickToBottom) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [messages, stickToBottom]);

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
        <div className="max-w-xl rounded-[30px] bg-white/45 px-6 py-8 text-center shadow-[0_18px_60px_rgba(24,24,27,0.05)] backdrop-blur-sm sm:px-8 sm:py-10">
          <h2 className="text-xl font-semibold tracking-tight text-stone-950 sm:text-2xl">
            Start a conversation
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-500 sm:leading-7">
            Ask the assistant to inspect the project, explain a file, or help you
            implement a change.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto px-1 sm:px-0"
      onScroll={handleScroll}
      ref={scrollRef}
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end gap-4 pb-3 pt-4 sm:gap-6 sm:pb-4 sm:pt-6 lg:pt-8">
        {hasMore ? (
          <div className="flex justify-center">
            <button
              className="rounded-2xl bg-white/75 px-4 py-2 text-xs font-medium text-stone-700 shadow-[0_10px_30px_rgba(24,24,27,0.06)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
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

        {entries.map((entry) => (
          <MessageItem
            key={entry.id}
            message={entry.message}
            toolContinuationParts={entry.toolContinuationParts}
          />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
