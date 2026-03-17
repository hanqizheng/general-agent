"use client";

import type { UIMessage, UIMessagePart } from "@/lib/chat-types";
import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
} from "@/lib/constants";

import { ReasoningRenderer } from "./reasoning-renderer";
import { ToolRenderer } from "./tool-renderer";

interface MessageItemProps {
  message: UIMessage;
}

function renderTextPart(part: Extract<UIMessagePart, { kind: "text" }>) {
  return (
    <div
      className="whitespace-pre-wrap text-[15px] leading-7 text-stone-800"
      key={`text-${part.partIndex}`}
    >
      {part.text}
      {part.state === null ? (
        <span className="ml-1 inline-block h-5 w-2 animate-pulse rounded-sm bg-stone-300 align-middle" />
      ) : null}
    </div>
  );
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === MESSAGE_ROLE.USER;

  return (
    <article className={isUser ? "ml-auto max-w-3xl" : "mr-auto max-w-4xl"}>
      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.22em] text-stone-500">
        <span>{isUser ? "User" : "Agent"}</span>
        {!isUser && message.isStreaming ? (
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] text-emerald-700">
            streaming
          </span>
        ) : null}
      </div>

      <div
        className={
          isUser
            ? "rounded-[28px] bg-stone-950 px-5 py-4 text-stone-50 shadow-[0_18px_48px_rgba(38,30,21,0.16)]"
            : "space-y-3 rounded-[30px] border border-stone-900/8 bg-white/90 px-5 py-4 shadow-[0_18px_48px_rgba(38,30,21,0.08)]"
        }
      >
        {message.parts.map((part) => {
          switch (part.kind) {
            case MESSAGE_PART_KIND.TEXT:
              if (isUser) {
                return (
                  <div
                    className="whitespace-pre-wrap text-[15px] leading-7"
                    key={`user-text-${part.partIndex}`}
                  >
                    {part.text}
                  </div>
                );
              }

              return renderTextPart(part);

            case MESSAGE_PART_KIND.REASONING:
              return (
                <ReasoningRenderer
                  key={`reasoning-${part.partIndex}`}
                  part={part}
                />
              );

            case MESSAGE_PART_KIND.TOOL:
              return (
                <ToolRenderer key={`tool-${part.partIndex}`} part={part} />
              );

            default:
              return null;
          }
        })}

        {!isUser && message.parts.length === 0 ? (
          <div className="text-sm text-stone-500">Waiting for first part...</div>
        ) : null}

        {!isUser &&
        !message.isStreaming &&
        message.parts.some((part) => part.state === MESSAGE_PART_END_STATE.ERROR) ? (
          <div className="rounded-2xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            This message ended with an error. Partial content is preserved.
          </div>
        ) : null}
      </div>
    </article>
  );
}
