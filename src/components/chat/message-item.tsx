"use client";

import type { ReactElement } from "react";

import type { UIMessage, UIMessagePart } from "@/lib/chat-types";
import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "@/lib/constants";

import { MarkdownRenderer } from "./markdown-renderer";
import { ReasoningRenderer } from "./reasoning-renderer";
import { ToolRenderer } from "./tool-renderer";

interface MessageItemProps {
  message: UIMessage;
}

function getAssistantBadge(message: UIMessage) {
  if (message.isStreaming) {
    return {
      label: "Streaming",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (message.status === MESSAGE_STATUS.INTERRUPTED) {
    return {
      label: "Stopped",
      className: "bg-stone-200 text-stone-700",
    };
  }

  if (message.status === MESSAGE_STATUS.ERROR) {
    return {
      label: "Error",
      className: "bg-rose-100 text-rose-700",
    };
  }

  return null;
}

function renderDetailPart(part: Exclude<UIMessagePart, { kind: "text" }>) {
  switch (part.kind) {
    case MESSAGE_PART_KIND.REASONING:
      return <ReasoningRenderer key={`reasoning-${part.partIndex}`} part={part} />;
    case MESSAGE_PART_KIND.TOOL:
      return <ToolRenderer key={`tool-${part.partIndex}`} part={part} />;
    default:
      return null;
  }
}

function renderAssistantTextPart(part: Extract<UIMessagePart, { kind: "text" }>) {
  const hasText = part.text.trim().length > 0;

  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl bg-[rgba(255,252,247,0.92)] px-4 py-3 shadow-[0_16px_40px_rgba(24,24,27,0.06)] sm:px-5 sm:py-4"
      key={`text-${part.partIndex}`}
    >
      {hasText ? (
        <MarkdownRenderer content={part.text} />
      ) : (
        <div className="text-sm text-stone-500">Working...</div>
      )}
      {part.state === null ? (
        <span className="inline-block h-4 w-2 rounded-sm bg-stone-300 align-middle" />
      ) : null}
    </section>
  );
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === MESSAGE_ROLE.USER;
  const messageWidthClass = isUser
    ? "w-full max-w-full sm:max-w-[85%] lg:max-w-3xl"
    : "w-full max-w-full lg:max-w-4xl";
  const textParts = message.parts.filter(
    (part): part is Extract<UIMessagePart, { kind: "text" }> =>
      part.kind === MESSAGE_PART_KIND.TEXT,
  );
  const badge = !isUser ? getAssistantBadge(message) : null;
  const orderedAssistantParts = message.parts
    .map((part) => {
      if (part.kind === MESSAGE_PART_KIND.TEXT) {
        if (part.text.trim().length === 0 && part.state !== null) {
          return null;
        }

        return renderAssistantTextPart(part);
      }

      return renderDetailPart(part);
    })
    .filter((part): part is ReactElement => part !== null);
  const hasAssistantContent = orderedAssistantParts.length > 0;

  return (
    <article
      className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`${messageWidthClass} min-w-0`}>
        <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-[10px] uppercase tracking-[0.18em] text-stone-500 sm:text-[11px]">
          {badge ? (
            <span className={`rounded-xl px-2.5 py-1 text-[10px] ${badge.className}`}>
              {badge.label}
            </span>
          ) : null}
        </div>

        {isUser ? (
          <div className="min-w-0 overflow-hidden rounded-2xl bg-stone-950 px-4 py-3 text-stone-50 shadow-[0_16px_40px_rgba(24,24,27,0.16)] sm:px-5 sm:py-4">
            <div className="chat-text-wrap whitespace-pre-wrap text-sm leading-6 sm:text-[15px] sm:leading-7">
              {textParts.map((part) => part.text).join("\n\n")}
            </div>
          </div>
        ) : hasAssistantContent ? (
          <div className="min-w-0 space-y-3">{orderedAssistantParts}</div>
        ) : message.isStreaming ? (
          <div className="min-w-0 overflow-hidden rounded-[14px] bg-white/70 px-4 py-3 text-sm text-stone-500 shadow-[0_12px_30px_rgba(24,24,27,0.05)]">
            Working...
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-[14px] bg-white/65 px-4 py-3 text-sm text-stone-500 shadow-[0_12px_30px_rgba(24,24,27,0.05)]">
            {message.parts.length > 0 ? "No visible assistant text." : "No assistant content."}
          </div>
        )}

        {!isUser && message.status === MESSAGE_STATUS.INTERRUPTED ? (
          <div className="mt-3 rounded-[14px] bg-stone-100 px-3 py-2 text-xs text-stone-600">
            Response stopped. Partial content was kept.
          </div>
        ) : null}

        {!isUser &&
        message.status === MESSAGE_STATUS.ERROR &&
        message.parts.some((part) => part.state === MESSAGE_PART_END_STATE.ERROR) ? (
          <div className="mt-3 rounded-[14px] bg-rose-100 px-3 py-2 text-xs text-rose-700">
            This message ended with an error. Partial content is preserved.
          </div>
        ) : null}
      </div>
    </article>
  );
}
