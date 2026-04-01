"use client";

import { useEffect, useState, type ReactElement } from "react";

import { Check, Copy } from "lucide-react";

import type {
  UIAttachmentPart,
  UIArtifactPart,
  UIInvokedCommand,
  UIMessage,
  UIMessagePart,
  UIToolPart,
} from "@/lib/chat-types";
import {
  MESSAGE_PART_END_STATE,
  MESSAGE_PART_KIND,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "@/lib/constants";
import { stableStringifyJson } from "@/lib/artifact-types";

import { AttachmentCardList } from "./attachment-card-list";
import { ArtifactRenderer } from "./artifact-renderer";
import { MarkdownRenderer } from "./markdown-renderer";
import { ReasoningRenderer } from "./reasoning-renderer";
import { ToolStackRenderer } from "./tool-stack-renderer";
import { ToolRenderer } from "./tool-renderer";

interface MessageItemProps {
  message: UIMessage;
  emphasizeAssistantText?: boolean;
  toolContinuationParts?: UIToolPart[];
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
    case MESSAGE_PART_KIND.ATTACHMENT:
      return (
        <AttachmentCardList
          items={[
            {
              id: part.attachmentId,
              mimeLabel: "PDF",
              name: part.originalName ?? part.attachmentId,
              status: "ready",
            },
          ]}
          key={`attachment-${part.partIndex}`}
          variant="message"
        />
      );
    case MESSAGE_PART_KIND.REASONING:
      return <ReasoningRenderer key={`reasoning-${part.partIndex}`} part={part} />;
    case MESSAGE_PART_KIND.TOOL:
      return <ToolRenderer key={`tool-${part.partIndex}`} part={part} />;
    case MESSAGE_PART_KIND.ARTIFACT:
      return <ArtifactRenderer key={`artifact-${part.partIndex}`} part={part} />;
    default:
      return null;
  }
}

function isStructuredOutputArtifact(
  artifact: UIArtifactPart | undefined,
  tool: UIToolPart | undefined,
) {
  return (
    artifact?.producer?.name === "structured_output" &&
    tool?.toolName === "structured_output" &&
    artifact.data !== null
  );
}

function mergeStructuredArtifactIntoTool(
  tool: UIToolPart,
  artifact: UIArtifactPart,
): UIToolPart {
  return {
    ...tool,
    output: stableStringifyJson(artifact.data),
  };
}

function stripLeadingSlashCommand(text: string, commands: UIInvokedCommand[]) {
  const firstCommand = commands[0];
  if (!firstCommand || firstCommand.source !== "slash") {
    return text;
  }

  const trimmed = text.trimStart();
  const commandPrefix = `/${firstCommand.name}`;
  if (!trimmed.startsWith(commandPrefix)) {
    return text;
  }

  const remainder = trimmed.slice(commandPrefix.length);
  if (remainder.length > 0 && !/^\s/.test(remainder)) {
    return text;
  }

  return remainder.replace(/^\s+/, "");
}

function buildUserMessageText(message: UIMessage) {
  const text = message.parts
    .filter(
      (part): part is Extract<UIMessagePart, { kind: "text" }> =>
        part.kind === MESSAGE_PART_KIND.TEXT,
    )
    .map((part) => part.text)
    .join("\n\n");

  return stripLeadingSlashCommand(text, message.invokedCommands);
}

function AssistantTextPart({
  part,
  variant,
}: {
  part: Extract<UIMessagePart, { kind: "text" }>;
  variant: "final" | "process";
}) {
  const isFinal = variant === "final";
  const hasText = part.text.trim().length > 0;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  const copyText = async () => {
    if (!hasText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(part.text);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <section
      className={
        isFinal
          ? "min-w-0 overflow-hidden rounded-2xl bg-[rgba(255,252,247,0.92)] px-4 py-3 shadow-[0_16px_40px_rgba(24,24,27,0.06)] sm:px-5 sm:py-4"
          : "min-w-0 px-1 py-1.5"
      }
      key={`text-${part.partIndex}`}
    >
      {hasText ? (
        <MarkdownRenderer content={part.text} />
      ) : (
        <div className={`text-sm ${isFinal ? "text-stone-500" : "text-stone-400"}`}>
          Working...
        </div>
      )}

      {isFinal && (hasText || part.state === null) ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-h-5">
            {part.state === null ? (
              <span className="inline-block h-4 w-2 rounded-sm bg-stone-300 align-middle" />
            ) : null}
          </div>

          {hasText ? (
            <button
              aria-label="Copy assistant response"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-stone-200"
              onClick={() => {
                void copyText();
              }}
              type="button"
            >
              {copyState === "copied" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "error"
                    ? "Retry copy"
                    : "Copy"}
              </span>
            </button>
          ) : null}
        </div>
      ) : part.state === null ? (
        <div className="mt-2 px-1">
          <span className="inline-block h-4 w-2 rounded-sm bg-stone-300 align-middle" />
        </div>
      ) : null}
    </section>
  );
}

function renderUserAttachmentParts(parts: UIAttachmentPart[]) {
  if (parts.length === 0) {
    return null;
  }

  return (
    <AttachmentCardList
      items={parts.map((part) => ({
        id: part.attachmentId,
        mimeLabel: "PDF",
        name: part.originalName ?? part.attachmentId,
        status: "ready",
      }))}
      variant="message"
    />
  );
}

function renderInlineInvokedCommandTags(commands: UIInvokedCommand[]) {
  if (commands.length === 0) {
    return null;
  }

  return (
    <>
      {commands.map((command, index) => {
        return (
          <span
            className="mr-2 inline-flex max-w-full items-center gap-1 rounded-[8px] bg-emerald-100 px-2 py-0.5 align-middle text-[12px] font-medium text-emerald-950"
            key={`${command.name}-${index}`}
            title={command.args || undefined}
          >
            <span className="shrink-0">/{command.name}</span>
          </span>
        );
      })}
    </>
  );
}

function renderAssistantParts(
  parts: UIMessagePart[],
  toolContinuationParts: UIToolPart[] = [],
  emphasizeAssistantText = false,
) {
  const rendered: ReactElement[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.kind === MESSAGE_PART_KIND.TEXT) {
      if (part.text.trim().length === 0 && part.state !== null) {
        continue;
      }

      rendered.push(
        <AssistantTextPart
          key={`text-${part.partIndex}`}
          part={part}
          variant={emphasizeAssistantText ? "final" : "process"}
        />,
      );
      continue;
    }

    if (part.kind === MESSAGE_PART_KIND.TOOL) {
      const toolGroup: UIToolPart[] = [part];

      while (
        index + 1 < parts.length &&
        parts[index + 1]?.kind === MESSAGE_PART_KIND.TOOL
      ) {
        index += 1;
        toolGroup.push(parts[index] as UIToolPart);
      }

      const nextPart = parts[index + 1];
      const artifactPart =
        nextPart?.kind === MESSAGE_PART_KIND.ARTIFACT ? nextPart : undefined;
      const lastTool = toolGroup[toolGroup.length - 1];

      if (isStructuredOutputArtifact(artifactPart, lastTool)) {
        toolGroup[toolGroup.length - 1] = mergeStructuredArtifactIntoTool(
          lastTool as UIToolPart,
          artifactPart as UIArtifactPart,
        );
        index += 1;
      }

      const mergedToolGroup =
        index === parts.length - 1 && toolContinuationParts.length > 0
          ? [...toolGroup, ...toolContinuationParts]
          : toolGroup;

      rendered.push(
        mergedToolGroup.length > 1 ? (
          <ToolStackRenderer
            key={`tool-stack-${toolGroup[0]?.partIndex ?? index}`}
            parts={mergedToolGroup}
          />
        ) : (
          <ToolRenderer
            key={`tool-${toolGroup[0]?.partIndex ?? index}`}
            part={toolGroup[0]}
          />
        ),
      );
      continue;
    }

    const renderedPart = renderDetailPart(
      part as Exclude<UIMessagePart, { kind: "text" }>,
    );

    if (renderedPart) {
      rendered.push(renderedPart);
    }
  }

  return rendered;
}

export function MessageItem({
  emphasizeAssistantText = false,
  message,
  toolContinuationParts = [],
}: MessageItemProps) {
  const isUser = message.role === MESSAGE_ROLE.USER;
  const messageWidthClass = isUser
    ? "flex w-full max-w-full flex-col items-end sm:max-w-[85%] lg:max-w-3xl"
    : "w-full max-w-full lg:max-w-4xl";
  const attachmentParts = message.parts.filter(
    (part): part is UIAttachmentPart =>
      part.kind === MESSAGE_PART_KIND.ATTACHMENT,
  );
  const badge = !isUser ? getAssistantBadge(message) : null;
  const orderedAssistantParts = renderAssistantParts(
    message.parts,
    toolContinuationParts,
    emphasizeAssistantText,
  );
  const hasAssistantContent = orderedAssistantParts.length > 0;
  const userMessageText = buildUserMessageText(message);

  return (
    <article
      className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`${messageWidthClass} min-w-0`}>
        {badge ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-[10px] uppercase tracking-[0.18em] text-stone-500 sm:text-[11px]">
            <span className={`rounded-xl px-2.5 py-1 text-[10px] ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        ) : null}

        {isUser ? (
          <div className="flex w-full flex-col items-end gap-2">
            {attachmentParts.length > 0 ? (
              <div className="w-full">{renderUserAttachmentParts(attachmentParts)}</div>
            ) : null}
            <div className="max-w-full overflow-hidden rounded-3xl bg-zinc-800 px-4 py-3 text-zinc-50 shadow-[0_16px_40px_rgba(24,24,27,0.16)] sm:px-5 sm:py-4">
              {message.invokedCommands.length > 0 || userMessageText.trim().length > 0 ? (
                <div className="chat-text-wrap whitespace-pre-wrap text-sm leading-6 sm:text-[15px] sm:leading-7">
                  {renderInlineInvokedCommandTags(message.invokedCommands)}
                  {userMessageText}
                </div>
              ) : null}
            </div>
          </div>
        ) : hasAssistantContent ? (
          <div className="min-w-0 space-y-3">{orderedAssistantParts}</div>
        ) : message.isStreaming ? (
          <div className="min-w-0 px-1 py-1 text-sm text-stone-500">
            Working...
          </div>
        ) : (
          <div className="min-w-0 px-1 py-1 text-sm text-stone-500">
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
