"use client";

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
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (message.status === MESSAGE_STATUS.INTERRUPTED) {
    return {
      label: "Stopped",
      className: "border-stone-200 bg-stone-100 text-stone-700",
    };
  }

  if (message.status === MESSAGE_STATUS.ERROR) {
    return {
      label: "Error",
      className: "border-rose-200 bg-rose-50 text-rose-700",
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
  return (
    <div className="space-y-2" key={`text-${part.partIndex}`}>
      <MarkdownRenderer content={part.text} />
      {part.state === null ? (
        <span className="inline-block h-4 w-2 rounded-sm bg-stone-300 align-middle" />
      ) : null}
    </div>
  );
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === MESSAGE_ROLE.USER;
  const textParts = message.parts.filter(
    (part): part is Extract<UIMessagePart, { kind: "text" }> =>
      part.kind === MESSAGE_PART_KIND.TEXT,
  );
  const detailParts = message.parts.filter(
    (part): part is Exclude<UIMessagePart, { kind: "text" }> =>
      part.kind !== MESSAGE_PART_KIND.TEXT,
  );
  const badge = !isUser ? getAssistantBadge(message) : null;

  return (
    <article className={isUser ? "ml-auto max-w-3xl" : "mr-auto max-w-4xl"}>
      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.18em] text-stone-500">
        <span>{isUser ? "You" : "Assistant"}</span>
        {badge ? (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] ${badge.className}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <div
        className={
          isUser
            ? "rounded-[28px] bg-stone-950 px-5 py-4 text-stone-50"
            : "space-y-4 rounded-[28px] border border-stone-200 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(24,24,27,0.05)]"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap text-[15px] leading-7">
            {textParts.map((part) => part.text).join("\n\n")}
          </div>
        ) : textParts.length > 0 ? (
          <div className="space-y-4">{textParts.map(renderAssistantTextPart)}</div>
        ) : (
          <div className="text-sm text-stone-500">
            {message.isStreaming ? "Working..." : "No text content."}
          </div>
        )}

        {!isUser && detailParts.length > 0 ? (
          <details className="rounded-2xl border border-stone-200 bg-stone-50/80">
            <summary className="cursor-pointer list-none px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
              Details
            </summary>
            <div className="space-y-3 border-t border-stone-200 px-4 py-4">
              {detailParts.map(renderDetailPart)}
            </div>
          </details>
        ) : null}

        {!isUser && message.status === MESSAGE_STATUS.INTERRUPTED ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            Response stopped. Partial content was kept.
          </div>
        ) : null}

        {!isUser &&
        message.status === MESSAGE_STATUS.ERROR &&
        message.parts.some((part) => part.state === MESSAGE_PART_END_STATE.ERROR) ? (
          <div className="rounded-2xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            This message ended with an error. Partial content is preserved.
          </div>
        ) : null}
      </div>
    </article>
  );
}
